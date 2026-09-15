import type { AcceptanceSpec, Assertion, JobKind } from "./spec";

/**
 * Deterministic spec compiler (v1).
 *
 * Deliberately NOT an LLM call: the money-moving checklist must be
 * reproducible, reviewable, and demo-safe. Plain words in, frozen
 * machine-checkable assertions out, via transparent extraction rules.
 * An LLM assist layer can propose drafts later — the frozen spec is always
 * this function's output, confirmed by both sides.
 */
export function compileSpec(jobText: string, jobKind: JobKind): AcceptanceSpec {
  const text = jobText.toLowerCase();
  const count = extractCount(text) ?? 50;
  const assertions: Assertion[] = [
    { type: "rowCount", min: Math.max(1, Math.floor(count * 0.9)), max: Math.ceil(count * 1.1) },
  ];

  if (jobKind === "lead-list") {
    assertions.push(
      { type: "schemaConforms", requiredFields: ["name", "email", "company", "source_url"] },
      { type: "dedupe", keyField: "email" },
      { type: "emailPlausible", emailField: "email", sampleSize: 20 },
      { type: "urlResolves", urlField: "source_url", sampleSize: 20 },
    );
    if (mentionsRecency(text)) {
      assertions.push({ type: "datePresent", dateField: "source_date", maxAgeDays: extractMaxAge(text) ?? 14 });
    }
  } else if (jobKind === "enrichment") {
    assertions.push(
      { type: "schemaConforms", requiredFields: ["key", "field", "value", "source_url"] },
      { type: "dedupe", keyField: "key" },
      { type: "urlResolves", urlField: "source_url", sampleSize: 20 },
    );
  } else {
    assertions.push(
      { type: "schemaConforms", requiredFields: ["claim", "source_url", "source_date"] },
      { type: "urlResolves", urlField: "source_url", sampleSize: 20 },
      { type: "datePresent", dateField: "source_date", maxAgeDays: extractMaxAge(text) ?? 30 },
    );
  }

  return {
    version: 1,
    jobKind,
    summary: summarize(jobText, count),
    assertions,
  };
}

const COUNT_UNITS =
  "rows?|leads?|companies|contacts|records|items|entries|cfos?|ceos?|ctos?|founders?|developers?|profiles?|people|prospects|accounts|clients|customers";

function extractCount(text: string): number | null {
  // Nearest number preceding a quantity noun ("5 fintech CFOs" → 5).
  // Numbers followed by time words ("14 days") are ignored unless no
  // quantity noun exists anywhere — recency is not a row count.
  const unitRe = new RegExp(`\\b(?:${COUNT_UNITS})\\b`, "g");
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = unitRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const nums = [...before.matchAll(/(\d{1,5})/g)].map((n) => parseInt(n[1], 10));
    if (nums.length > 0) best = nums[nums.length - 1];
  }
  return best;
}

function mentionsRecency(text: string): boolean {
  return /(recent|latest|fresh|this (week|month)|last (week|month)|\d+\s*days?|funding|news)/.test(text);
}

function extractMaxAge(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*days?/);
  if (m) return parseInt(m[1], 10);
  if (/this week|last week/.test(text)) return 14;
  if (/this month|last month/.test(text)) return 45;
  return null;
}

function summarize(jobText: string, count: number): string {
  const short = jobText.trim().slice(0, 140);
  return `${short}${jobText.trim().length > 140 ? "…" : ""} (${count} rows expected)`;
}
