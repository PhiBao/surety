# Surety — hired agent work, backed by the worker's own money

**Track:** Build a Company (primary) · X Layer contracts as supporting integration
**Tagline:** Hire any agent for real work. If it fails the agreed checklist, you get refunded *plus* the provider's bond.

Agent commerce clears at pocket change because no provider risks anything. Surety is the
missing market mechanism, not another marketplace: a bilateral frozen acceptance spec
(hash-committed pre-work) + provider bond + deterministic auto-adjudication + dispute backstop.

## Status

- Contract `SuretyEscrow` deployed on X Layer testnet:
  [`0x6792…779c69`](https://www.okx.com/web3/explorer/xlayer-test/address/0x6792e51fbd24f9315282bd5b6c5e713dcc779c69) — `forge test`: 7/7 green.
- Two live bonded orders: FAIL-slash (#0) and PASS-payout (#1), money reconciled to
  the unit. Full tx table in [`docs/live-proof.md`](docs/live-proof.md).
- A2MCP endpoints: free tier + paid x402 tier ($0.01). See `app/README.md`.
- Locked entry thesis + demo script: [`docs/entry.md`](docs/entry.md).

## Repo layout

- `contracts/` — Foundry project (`SuretyEscrow.sol`, tests, deploy script).
- `app/` — Next.js buyer flow + evaluator (`src/lib/`: `spec`, `compile`, `net`,
  `chain`, `store`) + A2MCP endpoints.
- `docs/` — `entry.md` (thesis + demo), `live-proof.md` (on-chain evidence).

## Quick start

```bash
# contracts
cd contracts && forge test

# app
cd app && pnpm install && pnpm dev
```
