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

function extractCount(text: string): number | null {
  const m = text.match(/(\d{1,5})\s*(rows?|leads?|companies|contacts|records|items|entries)/);
  return m ? parseInt(m[1], 10) : null;
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
