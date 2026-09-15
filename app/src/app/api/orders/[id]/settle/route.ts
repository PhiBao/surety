import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getOrder, saveOrder } from "@/lib/store";
import { ESCROW_ABI, ESCROW_ADDRESS, XLAYER_TESTNET, txUrl } from "@/lib/chain";

/**
 * Server-side adjudication settlement (TESTNET ONLY).
 *
 * Calls SuretyEscrow.adjudicate() with the deterministic evaluator's verdict,
 * so the receipt carries a REAL on-chain tx — the core of "design for proof".
 * Gated on ADJUDICATOR_KEY; refuses to run on mainnet in this build.
 * The key rotates to the dedicated evaluator service before any real volume.
 */
const xlayerTestnet = {
  id: XLAYER_TESTNET.id,
  name: XLAYER_TESTNET.name,
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [XLAYER_TESTNET.rpc] } },
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!order.verdict || order.verdict.unverifiable) {
    return NextResponse.json({ error: "No clean verdict to settle." }, { status: 409 });
  }
  if (order.chain?.settleTx) {
    return NextResponse.json({ error: "Already settled on-chain.", tx: order.chain.settleTx }, { status: 409 });
  }
  const key = process.env.ADJUDICATOR_KEY as Hex | undefined;
  if (!key) return NextResponse.json({ error: "Adjudicator not configured." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const chainOrderId = BigInt(body.chainOrderId ?? 0);

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: xlayerTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: xlayerTestnet, transport: http() });
  try {
    const hash = await wallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "adjudicate",
      args: [chainOrderId, order.verdict.pass, order.verdict.logUri],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    order.chain = { ...(order.chain ?? { orderId: String(chainOrderId), txs: {} }), orderId: String(chainOrderId), txs: {}, settleTx: hash, settleUrl: txUrl(hash) };
    await saveOrder(order);
    return NextResponse.json({ tx: hash, url: txUrl(hash) });
  } catch (e) {
    return NextResponse.json({ error: `On-chain settle failed: ${(e as Error).message}` }, { status: 502 });
  }
}
