"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { StoredOrder } from "@/lib/store";
import type { AcceptanceSpec, Row } from "@/lib/spec";

/**
 * Build a sample delivery that satisfies THIS spec (row count midpoint,
 * required fields, resolvable URLs, well-formed emails, fresh dates).
 * Used by the "Load PASS sample" button — no more 2-row mismatch.
 */
function buildPassSample(spec: AcceptanceSpec): Row[] {
  const count = spec.assertions.find((a) => a.type === "rowCount");
  const n =
    count && count.type === "rowCount"
      ? Math.min(count.max, Math.max(count.min, Math.round((count.min + count.max) / 2)))
      : 5;
  const today = new Date().toISOString().slice(0, 10);
  const rows: Row[] = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      name: `Sample Person ${i}`,
      key: `sample-${i}`,
      email: `surety.sample.${i}@gmail.com`, // gmail: real MX records, clearly a sample
      company: `Example Company ${i}`,
      claim: `Sample claim ${i}`,
      field: "employees",
      value: `${100 + i}`,
      source_url: "https://example.com",
      source_date: today,
    });
  }
  return rows;
}

const FAIL_SAMPLE: Row[] = [{ name: "Nobody", email: "not-an-email", company: "X" }];

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [error, setError] = useState("");
  const [bid, setBid] = useState({ provider: "", price: "", bond: "" });
  const [deliveryText, setDeliveryText] = useState("");
  const [settleInfo, setSettleInfo] = useState("");
  const [chainLink, setChainLink] = useState({ chainOrderId: "", createTx: "" });

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

  async function settleOnchain() {
    setError("");
    setSettleInfo("");
    const res = await fetch(`/api/orders/${id}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Settle failed.");
    else setSettleInfo(`Settled on X Layer testnet: ${data.url}`);
    await load();
  }

  if (!order) return <main className="mx-auto max-w-2xl bg-zinc-950 px-6 py-16 text-zinc-100">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl bg-zinc-950 px-6 py-12 text-zinc-100">
      <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Surety
      </a>
      <h1 className="mt-2 text-2xl font-bold text-white">Order {order.id}</h1>
      <StatusPill status={order.status} />
      <p className="mt-3 text-zinc-400">{order.jobText}</p>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-white">Frozen checklist</h2>
        <p className="mt-1 break-all font-mono text-xs text-zinc-500">spec hash {order.specHash}</p>
        <ul className="mt-3 space-y-2">
          {order.spec.assertions.map((a, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-200">
              <span className="text-emerald-400">✓</span>
              <AssertionText a={a} />
            </li>
          ))}
        </ul>
        {order.status === "spec" && (
          <button
            onClick={() => act("confirm-spec")}
            className="mt-4 w-full rounded-xl bg-emerald-400 py-2.5 font-semibold text-zinc-950 hover:bg-emerald-300"
          >
            Both sides agree — open for bonded bids →
          </button>
        )}
      </section>

      {(order.status === "open" || order.status === "bonded") && (
        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="font-semibold text-white">Bonded bids</h2>
          {order.bids.length === 0 && <p className="mt-2 text-sm text-zinc-500">No bids yet.</p>}
          {order.bids.map((b, i) => (
            <div
              key={i}
              className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-zinc-800/70 p-3 text-sm text-zinc-100"
            >
              <span>
                <strong className="text-white">{b.provider}</strong>
                <span className="text-zinc-300">
                  {" "}
                  · {b.price} · bond <strong className="text-emerald-300">{b.bond}</strong>
                </span>
              </span>
              {order.status === "open" && (
                <button
                  onClick={() => act("accept-bid", { index: i })}
                  className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  Accept
                </button>
              )}
            </div>
          ))}
          {order.status === "open" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <input
                value={bid.provider}
                onChange={(e) => setBid({ ...bid, provider: e.target.value })}
                placeholder="Agent name"
                aria-label="Agent name"
                className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
              <input
                value={bid.price}
                onChange={(e) => setBid({ ...bid, price: e.target.value })}
                placeholder="Price e.g. $200"
                aria-label="Price"
                className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
              <input
                value={bid.bond}
                onChange={(e) => setBid({ ...bid, bond: e.target.value })}
                placeholder="Bond e.g. $50"
                aria-label="Bond"
                className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
              <button
                onClick={() => act("bid", bid)}
                className="col-span-3 rounded-lg border border-zinc-600 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-400"
              >
                Place bonded bid
              </button>
            </div>
          )}
        </section>
      )}

      {order.status === "bonded" && (
        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="font-semibold text-white">Submit delivery (JSON rows)</h2>
          <div className="mt-2 flex gap-2 text-sm">
            <button
              onClick={() => order && setDeliveryText(JSON.stringify(buildPassSample(order.spec), null, 2))}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500"
            >
              Load PASS sample (matches this checklist)
            </button>
            <button
              onClick={() => setDeliveryText(JSON.stringify(FAIL_SAMPLE, null, 2))}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500"
            >
              Load FAIL sample
            </button>
          </div>
          <textarea
            value={deliveryText}
            onChange={(e) => setDeliveryText(e.target.value)}
            rows={8}
            aria-label="Delivery JSON rows"
            placeholder='[{"name": "...", "email": "...", ...}]'
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-500"
          />
          <button
            onClick={deliver}
            className="mt-2 w-full rounded-xl bg-emerald-400 py-2.5 font-semibold text-zinc-950 hover:bg-emerald-300"
          >
            Deliver + auto-check →
          </button>
        </section>
      )}

      {(order.status === "passed" || order.status === "failed" || order.status === "disputed") &&
        order.verdict && (
          <section
            className={`mt-4 rounded-xl border p-5 ${
              order.status === "passed"
                ? "border-emerald-800 bg-emerald-950"
                : order.status === "failed"
                  ? "border-red-900 bg-red-950/60"
                  : "border-amber-800 bg-amber-950/50"
            }`}
          >
            <h2
              className={`text-lg font-bold ${
                order.status === "passed"
                  ? "text-emerald-300"
                  : order.status === "failed"
                    ? "text-red-300"
                    : "text-amber-300"
              }`}
            >
              {order.status === "passed" && "✓ PASS — provider paid, bond returned"}
              {order.status === "failed" && "✗ FAIL — buyer refunded + bond paid out"}
              {order.status === "disputed" && "⚠ Needs human review — checks couldn't run cleanly"}
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {order.verdict.evidence.map((e, i) => (
                <li key={i} className="font-mono text-xs text-zinc-300">
                  • {e}
                </li>
              ))}
            </ul>
            <p className="mt-3 break-all font-mono text-xs text-zinc-500">
              delivery {order.delivery?.hash} · {order.verdict.at}
            </p>
            {order.chain?.settleUrl ? (
              <a
                href={order.chain.settleUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-emerald-400 underline hover:text-emerald-300"
              >
                View settlement on X Layer testnet ↗
              </a>
            ) : order.chain?.orderId ? (
              <button
                onClick={settleOnchain}
                className="mt-3 w-full rounded-xl bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-300"
              >
                Settle verdict on-chain (order #{order.chain.orderId}) →
              </button>
            ) : (
              <div className="mt-3 rounded-lg bg-zinc-800/60 p-3">
                <p className="text-xs text-zinc-400">Link the on-chain order to enable settlement:</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    value={chainLink.chainOrderId}
                    onChange={(e) => setChainLink({ ...chainLink, chainOrderId: e.target.value })}
                    placeholder="Chain order id (e.g. 2)"
                    aria-label="Chain order id"
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                  />
                  <input
                    value={chainLink.createTx}
                    onChange={(e) => setChainLink({ ...chainLink, createTx: e.target.value })}
                    placeholder="Create tx hash (optional)"
                    aria-label="Create transaction hash"
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                  />
                  <button
                    onClick={() => act("link-chain", chainLink)}
                    className="col-span-2 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                  >
                    Link on-chain order →
                  </button>
                </div>
              </div>
            )}
            {settleInfo && <p className="mt-2 break-all font-mono text-xs text-emerald-400">{settleInfo}</p>}
          </section>
        )}

      {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="mt-2 inline-block rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
      {status}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssertionText({ a }: { a: any }) {
  switch (a.type) {
    case "rowCount":
      return (
        <span>
          {a.min}–{a.max} rows delivered
        </span>
      );
    case "schemaConforms":
      return <span>every row has {a.requiredFields.join(", ")}</span>;
    case "dedupe":
      return <span>no duplicates on “{a.keyField}”</span>;
    case "urlResolves":
      return (
        <span>
          {a.sampleSize} sampled “{a.urlField}” URLs resolve (HTTP 200)
        </span>
      );
    case "emailPlausible":
      return (
        <span>
          {a.sampleSize} sampled “{a.emailField}” emails well-formed
        </span>
      );
    case "datePresent":
      return (
        <span>
          every “{a.dateField}” present and ≤ {a.maxAgeDays} days old
        </span>
      );
    default:
      return <span>{a.type}</span>;
  }
}
