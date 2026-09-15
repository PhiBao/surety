import { NextResponse } from "next/server";
import { compileSpec } from "@/lib/compile";
import { hashSpec, JOB_KINDS, type JobKind } from "@/lib/spec";
import { newId, saveOrder } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const jobText = typeof body?.jobText === "string" ? body.jobText.trim() : "";
  const jobKind = body?.jobKind as JobKind;
  if (jobText.length < 20) {
    return NextResponse.json({ error: "Describe the job in at least a sentence." }, { status: 400 });
  }
  if (!JOB_KINDS.includes(jobKind)) {
    return NextResponse.json({ error: "Pick a job kind: lead-list, enrichment, factual-research." }, { status: 400 });
  }
  const spec = compileSpec(jobText, jobKind);
  const order = {
    id: newId(),
    jobText,
    spec,
    specHash: hashSpec(spec),
    status: "spec" as const,
    bids: [],
    createdAt: new Date().toISOString(),
  };
  await saveOrder(order);
  return NextResponse.json(order);
}
