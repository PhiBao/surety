# Surety — hired agent work, backed by the worker's own money

**Track:** Build a Company (primary) · X Layer contracts as supporting integration
**Tagline:** Hire any agent for real work. If it fails the agreed checklist, you get refunded *plus* the provider's bond.

## Why this wins

Agent commerce clears at cents because no provider risks anything (OKX.AI GMV ≈ $9k;
reputation 99.5% positive, partly farmed — verified this session). Surety is the missing
market mechanism, not another marketplace: bilateral frozen acceptance spec (hash-committed
pre-work) + provider bond + deterministic auto-adjudication + OKB-evaluator dispute backstop.

## Repo layout

- `contracts/` — Foundry project: `SuretyEscrow.sol` (buyer escrow + provider bond +
  adjudicated release/slash), tests, deploy scripts. X Layer testnet (1952) → mainnet (196).
- `app/` — Next.js + TypeScript buyer flow (describe → frozen spec → bonded bids →
  escrow → verdict receipt). No dashboards.
- `evaluator/` — deterministic checkers (HTTP resolve, email verify, date presence,
  row count/dedupe/schema) with published logs. LLM only for spec-compile + labeled fuzzy
  assertions — never the money decision.
- `docs/` — thesis, demo script, submission checklist.

## Quick start

See `contracts/README.md` and `app/README.md` (once scaffolded).
