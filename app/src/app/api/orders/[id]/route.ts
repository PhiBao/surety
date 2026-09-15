import { NextResponse } from "next/server";
import { getOrder, saveOrder } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "confirm-spec" && order.status === "spec") {
    order.status = "open";
  } else if (action === "bid" && order.status === "open") {
    const { provider, price, bond } = body ?? {};
    if (!provider || !price || !bond) {
      return NextResponse.json({ error: "Bid needs provider, price, bond." }, { status: 400 });
    }
    order.bids.push({ provider, price, bond, eta: body.eta ?? "", at: new Date().toISOString() });
  } else if (action === "accept-bid" && order.status === "open") {
    const bid = order.bids[body?.index ?? 0];
    if (!bid) return NextResponse.json({ error: "Bid not found." }, { status: 404 });
    order.status = "bonded"; // on-chain postBond mirrors this in production
    order.bids = [bid];
  } else {
    return NextResponse.json({ error: "Invalid action for this order state." }, { status: 409 });
  }
  await saveOrder(order);
  return NextResponse.json(order);
}
