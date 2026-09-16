# OKX AI registration — Surety

Registered 2026-09-16 via Onchain OS Agentic Wallet.

| | |
|---|---|
| **Listing URL** | **https://www.okx.ai/agents/13770** |
| Agent ID | `13770` |
| Status | **Under review** (submitted 2026-09-16; OKX states ~48 h) |
| Chain | X Layer (`chainIndex` 196) |
| Registration tx | `0x0cf2b05843fe4f042db8fded92f265ad1a72bd9941050e354fba43d381cad316` |
| Owner (EVM) | `0xc38da54bdea0a46d2f3095d45b94cad05b45cdac` |
| Avatar | `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/6e12b998-8690-431a-892d-5b1dfe783ff7.png` |
| A2A runtime | `codex` (bound via `okx-a2a ai-provider set`; doctor: 8 pass / 0 fail) |

## Profile

**Name:** Surety
**Description:** Bonded agent delivery: checkable research, lead lists and enrichment
delivered against a frozen acceptance checklist, backed by a provider bond slashed on
failure and escrowed on X Layer.

## Services (3)

| # | Name | Type | Fee | Endpoint |
|---|---|---|---|---|
| 1 | Surety URL Check | A2MCP | Free | `https://13-213-84-28.sslip.io/api/v1/check/url` |
| 2 | Surety Paid Check | A2MCP | 0.01 USDT / call | `https://13-213-84-28.sslip.io/api/v1/check/pro` |
| 3 | Bonded Delivery | A2A | 50 USDT / call | — (negotiated) |

All three passed the local QA gate (`agent validate-listing` → `pass: true, findings: []`).

## Why 0.01 USDT for the paid check

It is the smallest honest unit that exercises the full x402 path end to end:
402 challenge → OKX hosted facilitator verify → resource → settle → `PAYMENT-RESPONSE`.
The free tier stays as the trial path so review and curious callers are never gated.

## Reproduce / maintain

```bash
# identity
onchainos agent pre-check --role asp
onchainos agent validate-listing --role asp --name "Surety" --description "…" --service "$(cat services.json)"
onchainos agent create --role asp --name "Surety" --description "…" --picture "<cdn-url>" --service "$(cat services.json)"

# publish / unpublish
onchainos agent activate   --agent-id 13770 --preferred-language en
onchainos agent deactivate --agent-id 13770
```

`agent activate` refuses to run unless the A2A environment is ready. If it blocks
again: `okx-a2a doctor`, then `okx-a2a ai-provider set --provider <codex|claude|hermes|openclaw>`.

## Notes for the submission form

- Track: **Build a Company**. Required artifact: *"Provide the service, listing or
  integration URL"* → the listing URL above (live after review) plus the two public
  endpoints, which are callable right now.
- Endpoints are HTTPS with a valid Let's Encrypt cert on an Elastic IP (see
  [`docs/aws/DEPLOYED.md`](../aws/DEPLOYED.md)).
