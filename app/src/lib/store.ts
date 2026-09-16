import { promises as fs } from "node:fs";
import path from "node:path";
import type { AcceptanceSpec } from "./spec";

/**
 * Minimal order store. JSON-file backed: honest, reviewable, sufficient for
 * the judged demo. Swap for Postgres before any real volume (see README).
 */

export type OrderStatus =
  | "spec"
  | "open"
  | "bonded"
  | "delivered"
  | "passed"
  | "failed"
  | "disputed"
  | "resolved"
  | "refunded";

export interface Bid {
  provider: string;
  price: string;
  bond: string;
  eta: string;
  at: string;
}

export interface StoredOrder {
  id: string;
  jobText: string;
  spec: AcceptanceSpec;
  specHash: string;
  status: OrderStatus;
  bids: Bid[];
  delivery?: { rows: Record<string, unknown>[]; hash: string; at: string };
  verdict?: {
    pass: boolean;
    unverifiable: boolean;
    evidence: string[];
    at: string;
    logUri: string;
  };
  chain?: { orderId: string; txs: Record<string, string>; settleTx?: string; settleUrl?: string };
  createdAt: string;
}

const DATA_DIR = process.env.SURETY_DATA_DIR ?? path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

async function readAll(): Promise<Record<string, StoredOrder>> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(all: Record<string, StoredOrder>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(all, null, 2));
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  return (await readAll())[id] ?? null;
}

export async function saveOrder(order: StoredOrder): Promise<void> {
  const all = await readAll();
  all[order.id] = order;
  await writeAll(all);
}

export async function listOrders(): Promise<StoredOrder[]> {
  return Object.values(await readAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function newId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
