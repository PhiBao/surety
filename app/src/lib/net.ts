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
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    // ENOTFOUND / NXDOMAIN: the domain does not exist. That is positive
    // evidence of a bad address, not an infrastructure failure.
    if (code === "ENOTFOUND" || code === "NXDOMAIN") return { wellFormed, mx: false };
    // ENODATA: domain exists but publishes no MX. Per RFC 5321 mail falls back
    // to the A record, so only fail when there is no address record either.
    if (code === "ENODATA") {
      try {
        const a = await dns.resolve4(domain);
        return { wellFormed, mx: a.length > 0 };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch {
        return { wellFormed, mx: false };
      }
    }
    // Genuinely transient (SERVFAIL, timeouts, refused): do not imply bad data.
    return { wellFormed, mx: null };
  }
}
