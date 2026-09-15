"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { StoredOrder } from "@/lib/store";

const PASS_SAMPLE = JSON.stringify(
  [
    { name: "A. Tan", email: "a.tan@fintechone.sg", company: "FinTech One", source_url: "https://example.com", source_date: new Date().toISOString().slice(0, 10) },
    { name: "B. Lim", email: "b.lim@paylabs.sg", company: "PayLabs", source_url: "https://example.com", source_date: new Date().toISOString().slice(0, 10) },
  ],
  null,
  2,
);

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [error, setError] = useState("");
  const [bid, setBid] = useState({ provider: "", price: "", bond: "" });
  const [deliveryText, setDeliveryText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) setOrder(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Action failed.");
    else setOrder(data);
  }

  async function deliver() {
    setError("");
    let rows: unknown;
    try {
      rows = JSON.parse(deliveryText);
    } catch {
      setError("Delivery must be valid JSON (an array of rows).");
      return;
    }
    const res = await fetch(`/api/orders/${id}/deliver`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Delivery failed.");
    await load();
  }

  if (!order) return <main className="mx-auto max-w-2xl px-6 py-16">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <a href="/" className="text-sm text-zinc-500">← Surety</a>
      <h1 className="mt-2 text-2xl font-bold">Order {order.id}</h1>
      <StatusPill status={order.status} />
      <p className="mt-3 text-zinc-600">{order.jobText}</p>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Frozen checklist</h2>
        <p className="mt-1 font-mono text-xs text-zinc-500">spec hash {order.specHash}</p>
        <ul className="mt-3 space-y-2">
          {order.spec.assertions.map((a, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-emerald-700">✓</span>
              <AssertionText a={a} />
            </li>
          ))}
        </ul>
        {order.status === "spec" && (
          <button
            onClick={() => act("confirm-spec")}
            className="mt-4 w-full rounded-xl bg-zinc-900 py-2.5 font-semibold text-white"
          >
            Both sides agree — open for bonded bids →
          </button>
        )}
      </section>

      {(order.status === "open" || order.status === "bonded") && (
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold">Bonded bids</h2>
          {order.bids.length === 0 && <p className="mt-2 text-sm text-zinc-500">No bids yet.</p>}
          {order.bids.map((b, i) => (
            <div key={i} className="mt-2 flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm">
              <span>
                <strong>{b.provider}</strong> · {b.price} · bond <strong>{b.bond}</strong>
              </span>
              {order.status === "open" && (
                <button
                  onClick={() => act("accept-bid", { index: i })}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white"
                >
                  Accept
                </button>
              )}
            </div>
          ))}
          {order.status === "open" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <input value={bid.provider} onChange={(e) => setBid({ ...bid, provider: e.target.value })} placeholder="Agent name" className="rounded-lg border border-zinc-300 p-2 text-sm" />
              <input value={bid.price} onChange={(e) => setBid({ ...bid, price: e.target.value })} placeholder="Price e.g. $200" className="rounded-lg border border-zinc-300 p-2 text-sm" />
              <input value={bid.bond} onChange={(e) => setBid({ ...bid, bond: e.target.value })} placeholder="Bond e.g. $50" className="rounded-lg border border-zinc-300 p-2 text-sm" />
              <button onClick={() => act("bid", bid)} className="col-span-3 rounded-lg border border-zinc-300 py-2 text-sm font-semibold">
                Place bonded bid
              </button>
            </div>
          )}
        </section>
      )}

      {order.status === "bonded" && (
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold">Submit delivery (JSON rows)</h2>
          <div className="mt-2 flex gap-2 text-sm">
            <button onClick={() => setDeliveryText(PASS_SAMPLE)} className="rounded-lg border border-zinc-300 px-3 py-1.5">
              Load PASS sample
            </button>
            <button
              onClick={() => setDeliveryText(JSON.stringify([{ name: "Nobody", email: "not-an-email", company: "X" }], null, 2))}
              className="rounded-lg border border-zinc-300 px-3 py-1.5"
            >
              Load FAIL sample
            </button>
          </div>
          <textarea
            value={deliveryText}
            onChange={(e) => setDeliveryText(e.target.value)}
            rows={8}
            placeholder='[{"name": "...", "email": "...", ...}]'
            className="mt-2 w-full rounded-lg border border-zinc-300 p-3 font-mono text-xs"
          />
          <button onClick={deliver} className="mt-2 w-full rounded-xl bg-emerald-700 py-2.5 font-semibold text-white">
            Deliver + auto-check →
          </button>
        </section>
      )}

      {(order.status === "passed" || order.status === "failed" || order.status === "disputed") && order.verdict && (
        <section
          className={`mt-4 rounded-xl border p-5 ${
            order.status === "passed" ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
          }`}
        >
          <h2 className="text-lg font-bold">
            {order.status === "passed" && "✓ PASS — provider paid, bond returned"}
            {order.status === "failed" && "✗ FAIL — buyer refunded + bond paid out"}
            {order.status === "disputed" && "⚠ Needs human review — checks couldn't run cleanly"}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {order.verdict.evidence.map((e, i) => (
              <li key={i} className="font-mono text-xs">• {e}</li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-xs text-zinc-500">
            delivery {order.delivery?.hash} · {order.verdict.at}
          </p>
        </section>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="mt-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
      {status}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssertionText({ a }: { a: any }) {
  switch (a.type) {
    case "rowCount":
      return <span>{a.min}–{a.max} rows delivered</span>;
    case "schemaConforms":
      return <span>every row has {a.requiredFields.join(", ")}</span>;
    case "dedupe":
      return <span>no duplicates on “{a.keyField}”</span>;
    case "urlResolves":
      return <span>{a.sampleSize} sampled “{a.urlField}” URLs resolve (HTTP 200)</span>;
    case "emailPlausible":
      return <span>{a.sampleSize} sampled “{a.emailField}” emails well-formed</span>;
    case "datePresent":
      return <span>every “{a.dateField}” present and ≤ {a.maxAgeDays} days old</span>;
    default:
      return <span>{a.type}</span>;
  }
}
