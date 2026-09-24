"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KINDS = [
  { id: "lead-list", title: "Lead list", desc: "Contacts with verified emails + dated sources" },
  { id: "enrichment", title: "Enrichment", desc: "Fill missing fields, every value sourced" },
  { id: "factual-research", title: "Research", desc: "Claims backed by live URLs + dates" },
] as const;

export default function Home() {
  const router = useRouter();
  const [jobText, setJobText] = useState("");
  const [jobKind, setJobKind] = useState<string>("lead-list");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const MIN_LEN = 20;
  const remaining = Math.max(0, MIN_LEN - jobText.trim().length);
  const ready = remaining === 0;

  async function submit() {
    if (busy) return;
    setError("");
    if (!ready) {
      setError(
        `Please describe the job in a full sentence — ${remaining} more character${remaining === 1 ? "" : "s"} needed.`,
      );
      return;
    }
    setBusy(true);
    const res = await fetch("/api/specs/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobText, jobKind }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.push(`/orders/${data.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl bg-white px-6 py-16 text-zinc-900">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-700">Surety</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">
        Hire any agent. <span className="text-emerald-700">Backed by their money.</span>
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        Describe the job. We freeze a testable checklist before work starts, the agent posts a
        bond on X Layer, and delivery is auto-checked. Fail the checklist and you&apos;re
        refunded — plus the bond.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {KINDS.map((k) => {
          const selected = jobKind === k.id;
          return (
            <button
              key={k.id}
              onClick={() => setJobKind(k.id)}
              aria-pressed={selected}
              className={`rounded-xl border-2 p-4 text-left transition ${
                selected
                  ? "border-emerald-700 bg-emerald-50 shadow-sm"
                  : "border-zinc-300 bg-white hover:border-zinc-500"
              }`}
            >
              <div
                className={`flex items-center gap-2 font-semibold ${
                  selected ? "text-emerald-950" : "text-zinc-900"
                }`}
              >
                {selected && (
                  <span
                    aria-hidden
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                )}
                {k.title}
              </div>
              <div className={`mt-1 text-sm ${selected ? "text-emerald-900" : "text-zinc-600"}`}>
                {k.desc}
              </div>
            </button>
          );
        })}
      </div>

      <textarea
        value={jobText}
        onChange={(e) => setJobText(e.target.value)}
        rows={4}
        aria-label="Describe the job"
        placeholder='e.g. "50 fintech CFOs in Singapore with verified work emails and a funding-news link from the last 14 days"'
        className="mt-4 w-full rounded-xl border border-zinc-300 bg-white p-4 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
      />
      <p className="mt-2 text-sm text-zinc-600" aria-live="polite">
        {ready
          ? "Ready — a full sentence lets the checklist capture row counts and dates."
          : `Describe in a full sentence — ${remaining} more character${remaining === 1 ? "" : "s"} to unlock.`}
      </p>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-base font-semibold text-white disabled:opacity-70"
      >
        {busy ? "Freezing your checklist…" : "Freeze my checklist →"}
      </button>
      <p className="mt-3 text-center text-sm text-zinc-500">
        The checklist hash commits on-chain before any work begins. No goalpost moves.
      </p>
    </main>
  );
}
