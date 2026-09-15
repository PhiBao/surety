import { promises as dns } from "node:dns";

/**
 * Network evidence helpers. Shared by the evaluator and the A2MCP endpoints
 * so "resolves" means the same thing everywhere.
 */

export interface UrlCheck {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * HEAD first (cheap), fall back to ranged GET: some servers answer 405 to
 * HEAD while serving GET fine. A 405 alone must never FAIL a delivery.
 */
export async function checkUrl(url: string, timeoutMs = 8000): Promise<UrlCheck> {
  const base = { headers: { "user-agent": "surety-checker/1.0" }, redirect: "follow" as const };
  try {
    const head = await fetch(url, { ...base, method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    if (head.ok) return { ok: true, status: head.status };
    if (head.status !== 405 && head.status !== 501) return { ok: false, status: head.status };
    const get = await fetch(url, {
      ...base,
      method: "GET",
      headers: { ...base.headers, Range: "bytes=0-0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: get.ok, status: get.status };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    throw e; // network-level failure: caller marks UNVERIFIABLE, never FAIL
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface EmailCheck {
  wellFormed: boolean;
  mx: boolean | null; // null = could not check (DNS failure → unverifiable, not fail)
}

export async function checkEmail(email: string): Promise<EmailCheck> {
  const wellFormed = EMAIL_RE.test(email);
  if (!wellFormed) return { wellFormed, mx: false };
  const domain = email.split("@")[1];
  try {
    const mx = await dns.resolveMx(domain);
    return { wellFormed, mx: mx.length > 0 };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return { wellFormed, mx: null };
  }
}
