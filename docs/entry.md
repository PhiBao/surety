# Surety — locked winning entry (Build a Company)

> Cannot-change constraint respected: this is the approved provider-bond concept,
> sharpened for the Builder Kit judging. No track change, no concept change.

## One line

**Hire any agent for real work — backed by the worker's own money.**

## 30-second pitch (use verbatim in video + form)

Agent marketplaces clear at pocket change because no provider risks anything:
OKX.AI has done $9k total volume and reviews are 99.5% positive — reputation is free,
so it's worthless. Surety flips it: the buyer and agent agree a frozen, testable
checklist *before* work starts; the agent posts a bond of its own money on X Layer;
delivery is auto-checked against the checklist. Pass → agent paid + bond back.
Fail → buyer refunded **plus the bond**. No dispute needed for the common case.

## Track compliance (Build a Company)

- [ ] A2MCP paid endpoint live (x402, OKX Payment SDK) — provider surface
- [ ] A2A listing published on OKX.AI — listing URL in submission
- [ ] End-to-end workflow demoed: describe → frozen spec → bonded bid → escrow → verdict → receipt
- [ ] X Layer contracts as supporting integration: testnet address + explorer links
      (mainnet if stable before 25 Sep)
- [ ] Submission: public repo + README, 2–4 min video, live link, declaration

## What judges see (proof, not claims)

1. Spec hash committed on-chain BEFORE work (no goalpost moves — show the tx).
2. Buyer escrow + provider bond locked (two txs, explorer links).
3. Delivery hash committed (third tx).
4. Evaluator log: "47/50 URLs 200, 3 dead → FAIL" (published, deterministic).
5. Slash tx: buyer refunded + $50 bond (fourth tx, clicked live in video).
6. PASS control run: provider paid + bond returned minus 4% fee.
7. OKX AI listing URL + `curl -i` showing HTTP 402 challenge on the paid endpoint.

## Beachhead (explicitly narrow)

Only checkable deliverables: **lead lists, data enrichment, factual research with
dated source URLs**. No design, copy, branding, video — taste is out of scope and
saying so is a trust signal.

## Demo script (2:30)

0:00 hook — "Agent commerce clears at $0.40 because no agent risks anything.
Watch one lose $50." 0:20 problem — $9k GMV + 99.5% reviews on screen.
0:40 interaction — paste "50 fintech CFOs, verified emails, funding news ≤14d".
1:00 surprise — frozen checklist appears; hash commits on-chain.
1:20 proof — bonded $50 bid vs unbonded bid; pick bonded.
1:50 verdict — delivery with 3 dead emails; log scrolls; FAIL.
2:20 payoff — slash confirms; buyer refunded + $50; explorer clicked live.
2:45 differentiation — "Marketplaces escrow money. We bond correctness."

Reliability: pre-funded wallets, pinned PASS + FAIL vectors, recorded fallback take.
No live faucet, no unpinned model output on the critical path.

## Kill-validated assumptions (running in parallel, no code)

1. 10 ASPs: "post a $50 bond to bid on a $500 job?" — need ≥3 yes.
2. 5 SMB buyers: "pay ≥20% premium for bonded delivery?" — need ≥1 strong yes + reason.
3. 5 hand-brokered bonded jobs — need ≥1 unprompted repeat.
