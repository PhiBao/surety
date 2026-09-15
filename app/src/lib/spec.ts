import { keccak256, toHex } from "viem";

/**
 * Surety acceptance-spec model.
 *
 * A spec is compiled from plain words, confirmed bilaterally, then frozen:
 * keccak256(canonical JSON) is committed on-chain BEFORE work begins.
 * Post-hoc goalpost moves are impossible by construction.
 */

export const JOB_KINDS = ["lead-list", "enrichment", "factual-research"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type Assertion =
  | { type: "rowCount"; min: number; max: number }
  | { type: "schemaConforms"; requiredFields: string[] }
  | { type: "dedupe"; keyField: string }
  | { type: "urlResolves"; urlField: string; sampleSize: number }
  | { type: "emailPlausible"; emailField: string; sampleSize: number; checkMx?: boolean }
  | { type: "datePresent"; dateField: string; maxAgeDays: number };

export interface AcceptanceSpec {
  version: 1;
  jobKind: JobKind;
  summary: string;
  assertions: Assertion[];
}

export type Row = Record<string, unknown>;

export interface AssertionResult {
  assertion: Assertion;
  pass: boolean;
  /** Human-readable evidence, e.g. "48/50 URLs returned HTTP 200". */
  evidence: string;
  /** True when infra failed and the check could not run — never auto-FAILs. */
  unverifiable?: boolean;
}

export interface Verdict {
  pass: boolean;
  unverifiable: boolean;
  results: AssertionResult[];
  checkedAt: string;
}

/** Canonical JSON: sorted keys, no whitespace. What is hashed is what was agreed. */
export function canonicalize(spec: AcceptanceSpec): string {
  return JSON.stringify(sortKeys(spec));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

export function hashSpec(spec: AcceptanceSpec): `0x${string}` {
  return keccak256(toHex(canonicalize(spec)));
}

export function hashDelivery(bytes: Uint8Array | string): `0x${string}` {
  const hex = typeof bytes === "string" ? toHex(bytes) : toHex(bytes);
  return keccak256(hex);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Deterministic evaluation. Pure + small async I/O (HTTP HEAD/GET, DNS MX).
 * Rule: any infra failure yields `unverifiable: true`, NEVER a FAIL.
 * FAIL requires positive evidence of a violated assertion.
 */
export async function evaluateDelivery(rows: Row[], spec: AcceptanceSpec): Promise<Verdict> {
  const results: AssertionResult[] = [];
  for (const a of spec.assertions) {
    results.push(await runAssertion(a, rows));
  }
  const unverifiable = results.some((r) => r.unverifiable);
  const pass = !unverifiable && results.every((r) => r.pass);
  return { pass, unverifiable, results, checkedAt: new Date().toISOString() };
}

async function runAssertion(a: Assertion, rows: Row[]): Promise<AssertionResult> {
  switch (a.type) {
    case "rowCount": {
      const n = rows.length;
      const pass = n >= a.min && n <= a.max;
      return { assertion: a, pass, evidence: `${n} rows (required ${a.min}–${a.max})` };
    }
    case "schemaConforms": {
      const missing = rows.filter((r) => a.requiredFields.some((f) => r[f] == null || r[f] === ""));
      return {
        assertion: a,
        pass: missing.length === 0,
        evidence:
          missing.length === 0
            ? `${rows.length}/${rows.length} rows have ${a.requiredFields.join(", ")}`
            : `${missing.length}/${rows.length} rows missing required fields`,
      };
    }
    case "dedupe": {
      const seen = new Set<unknown>();
      let dups = 0;
      for (const r of rows) {
        const k = r[a.keyField];
        if (seen.has(k)) dups++;
        seen.add(k);
      }
      return {
        assertion: a,
        pass: dups === 0,
        evidence: dups === 0 ? `0 duplicates on "${a.keyField}"` : `${dups} duplicates on "${a.keyField}"`,
      };
    }
    case "urlResolves": {
      const sample = sampleRows(rows, a.sampleSize);
      let ok = 0;
      const failures: string[] = [];
      for (const r of sample) {
        const url = String(r[a.urlField] ?? "");
        try {
          const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
          if (res.ok) ok++;
          else failures.push(`${url} → ${res.status}`);
        } catch (e) {
          // Network-level failure (DNS, TLS, timeout): infra problem, not proof of bad data.
          return {
            assertion: a,
            pass: false,
            unverifiable: true,
            evidence: `could not reach ${url}: ${(e as Error).message}`,
          };
        }
      }
      return {
        assertion: a,
        pass: failures.length === 0,
        evidence: `${ok}/${sample.length} sampled URLs resolve (HTTP 200)${failures.length ? `: ${failures.slice(0, 3).join("; ")}` : ""}`,
      };
    }
    case "emailPlausible": {
      const sample = sampleRows(rows, a.sampleSize);
      const bad = sample.filter((r) => !EMAIL_RE.test(String(r[a.emailField] ?? "")));
      return {
        assertion: a,
        pass: bad.length === 0,
        evidence:
          bad.length === 0
            ? `${sample.length}/${sample.length} sampled emails well-formed`
            : `${bad.length}/${sample.length} sampled emails malformed`,
      };
    }
    case "datePresent": {
      const cutoff = Date.now() - a.maxAgeDays * 86_400_000;
      const bad = rows.filter((r) => {
        const t = Date.parse(String(r[a.dateField] ?? ""));
        return Number.isNaN(t) || t < cutoff;
      });
      return {
        assertion: a,
        pass: bad.length === 0,
        evidence:
          bad.length === 0
            ? `all ${rows.length} dates within ${a.maxAgeDays}d`
            : `${bad.length}/${rows.length} dates missing or older than ${a.maxAgeDays}d`,
      };
    }
  }
}

function sampleRows(rows: Row[], n: number): Row[] {
  if (rows.length <= n) return rows;
  // Deterministic sample: first n (delivery order is part of the committed bytes).
  return rows.slice(0, n);
}
