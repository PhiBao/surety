import { NextResponse } from "next/server";
import { checkUrl } from "@/lib/net";

/**
 * A2MCP service endpoint (free tier).
 *
 * Compliant "free endpoint" form: returns the result directly on call (HTTP 200),
 * no billing, no x402 — per the OKX A2MCP guide. When facilitator API keys are
 * provisioned, this same route is wrapped with the OKX Payment SDK
 * (@okxweb3/x402-express) to become the paid per-call tier; the free tier stays
 * as the trial path. Nothing here is mocked: it performs a live HTTP check.
 *
 * Self-check: curl -i "https://<domain>/api/v1/check/url?url=https://example.com"
 * Expected: HTTP 200 + JSON verdict.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "Provide ?url=https://…", ok: false }, { status: 400 });
  }
  const started = Date.now();
  try {
    const res = await checkUrl(url);
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      url,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      service: "surety-url-check",
      billing: "free-tier",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      url,
      error: (e as Error).message,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      service: "surety-url-check",
      billing: "free-tier",
    });
  }
}
