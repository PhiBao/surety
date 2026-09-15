import { NextRequest, NextResponse } from "next/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";

/**
 * Paid x402 tier for the Surety checker (A2MCP paid-endpoint form).
 *
 * - No payment header  → HTTP 402 + PAYMENT-REQUIRED challenge
 *   (exact / X Layer mainnet / USDT0 $0.01 — envelope per OKX A2MCP docs).
 * - Valid PAYMENT-SIGNATURE → OKX hosted facilitator verify → resource →
 *   settle → HTTP 200 + PAYMENT-RESPONSE. No mocks: every step hits OKX.
 * - No keys configured  → honest 501 (free tier at /api/v1/check/url stays
 *   the listed endpoint).
 *
 * Keys are server-side only (never NEXT_PUBLIC_*).
 */

const NETWORK = "eip155:196"; // X Layer mainnet
const USDT0 = "0x779ded0c9e1022225f8e0630b35a9b54be713736"; // official settlement USDT0 (OKX docs)
const PAY_TO = "0x4Ba1e9e275EF61B56C99532D0066506436201D73"; // Surety treasury
const AMOUNT = "10000"; // $0.01 at 6 decimals
const MAX_TIMEOUT = 300;

interface Facilitator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSupported(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verify(payload: any, requirements: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settle(payload: any, requirements: any): Promise<any>;
}

let facilitatorPromise: Promise<Facilitator | null> | null = null;

function getFacilitator(): Promise<Facilitator | null> {
  if (!facilitatorPromise) {
    facilitatorPromise = (async () => {
      const apiKey = process.env.OKX_API_KEY;
      const secretKey = process.env.OKX_SECRET_KEY;
      const passphrase = process.env.OKX_PASSPHRASE;
      if (!apiKey || !secretKey || !passphrase) return null;
      const client = new OKXFacilitatorClient({ apiKey, secretKey, passphrase });
      await client.getSupported(); // validates credentials up front
      return client as unknown as Facilitator;
    })().catch(() => null);
  }
  return facilitatorPromise;
}

function requirements(url: string) {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: USDT0,
    amount: AMOUNT,
    payTo: PAY_TO,
    maxTimeoutSeconds: MAX_TIMEOUT,
    extra: { name: "USD₮0", version: "1" },
    resource: url,
    description: "Surety URL verification — paid tier",
    mimeType: "application/json",
  };
}

function challenge(url: string) {
  return {
    x402Version: 2,
    resource: { url, description: "Surety URL verification — paid tier", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        asset: USDT0,
        amount: AMOUNT,
        payTo: PAY_TO,
        maxTimeoutSeconds: MAX_TIMEOUT,
        extra: { name: "USD₮0", version: "1" },
      },
    ],
  };
}

async function runCheck(target: string) {
  const started = Date.now();
  try {
    const res = await fetch(target, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "surety-checker/1.0" },
    });
    return { ok: res.ok, status: res.status, url: target, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, url: target, error: (e as Error).message, latencyMs: Date.now() - started };
  }
}

export async function GET(req: NextRequest) {
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json(
      { error: "Paid tier not configured (missing facilitator keys). Use the free tier: /api/v1/check/url" },
      { status: 501 },
    );
  }
  const target = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(target)) {
    return NextResponse.json({ error: "Provide ?url=https://…" }, { status: 400 });
  }

  const sig = req.headers.get("payment-signature");
  if (!sig) {
    const encoded = Buffer.from(JSON.stringify(challenge(req.url))).toString("base64");
    return new NextResponse(JSON.stringify({ x402Version: 2, error: "Payment required" }), {
      status: 402,
      headers: { "content-type": "application/json", "PAYMENT-REQUIRED": encoded },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Malformed PAYMENT-SIGNATURE." }, { status: 400 });
  }

  const reqs = requirements(req.url);
  let verification: { isValid?: boolean; invalidReason?: string };
  try {
    verification = await facilitator.verify(payload, reqs);
  } catch (e) {
    return NextResponse.json({ error: `Verification failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (!verification?.isValid) {
    return NextResponse.json(
      { error: `Invalid payment: ${verification?.invalidReason ?? "rejected by facilitator"}` },
      { status: 402 },
    );
  }

  const result = await runCheck(target);
  const body = JSON.stringify({
    ...result,
    checkedAt: new Date().toISOString(),
    service: "surety-url-check",
    billing: "x402-paid-tier",
  });

  try {
    const settlement = await facilitator.settle(payload, reqs);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(settlement)).toString("base64"),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Settlement error: ${(e as Error).message}` }, { status: 502 });
  }
}
