import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await listOrders());
}
