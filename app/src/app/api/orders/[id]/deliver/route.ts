import { NextResponse } from "next/server";
import { evaluateDelivery, hashDelivery } from "@/lib/spec";
import { getOrder, saveOrder } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "bonded" && order.status !== "delivered") {
    return NextResponse.json({ error: "Order is not awaiting delivery." }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Provide delivery rows." }, { status: 400 });
  }

  const verdict = await evaluateDelivery(rows, order.spec);
  order.delivery = {
    rows,
    hash: hashDelivery(JSON.stringify(rows)),
    at: new Date().toISOString(),
  };
  order.verdict = {
    pass: verdict.pass,
    unverifiable: verdict.unverifiable,
    evidence: verdict.results.map((r) => r.evidence),
    at: verdict.checkedAt,
    logUri: `log:${order.id}:${verdict.checkedAt}`,
  };
  // Unverifiable NEVER auto-fails: routes to human review (disputed).
  order.status = verdict.unverifiable ? "disputed" : verdict.pass ? "passed" : "failed";
  await saveOrder(order);
  return NextResponse.json({ verdict, status: order.status });
}
