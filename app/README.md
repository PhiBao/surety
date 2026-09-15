# Surety app — buyer flow + evaluator + A2MCP endpoints

Next.js + TypeScript. Guided flow, no dashboards:
describe → frozen checklist → bonded bids → delivery → verdict receipt → on-chain settle.

## Run

```bash
pnpm install
pnpm dev      # or: pnpm build && pnpm start -p 3207
```

Deterministic core lives in `src/lib/`:

- `spec.ts` — acceptance-spec model, canonical hashing, deterministic evaluation.
  Infra failures yield `unverifiable` (human review), never auto-FAIL.
- `compile.ts` — rule-based spec compiler (reproducible by design, no LLM on the
  money path).
- `net.ts` — shared URL (HEAD→GET fallback) and email (format + MX) evidence.
- `chain.ts` — X Layer testnet wiring (escrow address, USDT0, explorer links).
- `store.ts` — JSON-file order store. **Demo-grade persistence: use Postgres before
  any real volume, and host with persistent disk (not serverless).**

## API

| Route | Purpose |
|---|---|
| `POST /api/specs/compile` | `{ jobText, jobKind }` → frozen spec + `specHash` |
| `PATCH /api/orders/[id]` | `confirm-spec` · `bid` · `accept-bid` · `link-chain` |
| `POST /api/orders/[id]/deliver` | `{ rows }` → deterministic verdict |
| `POST /api/orders/[id]/settle` | adjudicates the **linked** on-chain order id |
| `GET /api/v1/check/url?url=` | A2MCP **free** endpoint (listed trial path) |
| `GET /api/v1/check/pro?url=` | A2MCP **paid** x402 endpoint ($0.01, exact, X Layer) |

## Env (server-side only, never `NEXT_PUBLIC_*`)

```bash
ADJUDICATOR_KEY=0x…  # testnet adjudicator; rotates to evaluator service pre-mainnet
OKX_API_KEY=… OKX_SECRET_KEY=… OKX_PASSPHRASE=…  # x402 facilitator (paid tier)
```

## Demo honesty

On-chain escrow/bond moves are real (X Layer testnet). The web flow is a
**demo relay**: off-chain state transitions mirror on-chain ones. Mainnet path is
direct wallet signing + `setAdjudicator` rotation to the evaluator service.
