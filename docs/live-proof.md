# Live proof — X Layer testnet (chain 1952)

Contract: `SuretyEscrow` at
[`0x6792e51fbd24f9315282bd5b6c5e713dcc779c69`](https://www.okx.com/web3/explorer/xlayer-test/address/0x6792e51fbd24f9315282bd5b6c5e713dcc779c69)
Settlement token: test USDG `0xA78E…eEC1` (OKX faucet; 6 decimals).
Price 3.00 / bond 1.00 / fee 4%. Buyer `0x4Ba1…1D73`, provider `0x895F…e532`.

## Order #0 — FAIL → buyer refunded + bond slashed

| Step | Tx |
|---|---|
| createOrder (spec `0x0303…1971`) | [`0x4f3e…242b12`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x4f3e7e56e2e11ece3513a9956efdb90a9b180493e11b3b9e68c42abba0242b12) |
| postBond | [`0x01df…173dc`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x01df673fd67c8c23433850a5315dc6dcd802145746dc698db76d81fa7c3173dc) |
| submitDelivery | [`0x4469…74b14`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x44696ef73704401c867c20f22373c3e88bc988c051283359651ca4ad00474b14) |
| adjudicate(false) | [`0x6655…f1e46`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x665502a851707440988947b31b19094a8c5a3e682425aef550000b711d9f1e46) |

Balance check: buyer 4.80 → **8.80** (+3.00 price +1.00 bond). Provider 1.20, bond gone.

## Order #1 — PASS → provider paid, bond returned, fee taken

| Step | Tx |
|---|---|
| createOrder (spec `0x1f74…22e1`) | [`0xab01…470f73`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xab01eb93348da3e1fc65b518da470f60d392513c684d949b99749078a1470f73) |
| postBond | [`0x37b6…4dadf`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x37b69e698b369e85a478b187e6de8074cd60caa99830c5459399bee91534dadf) |
| submitDelivery | [`0x9401…bbe15`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x9401f6e77dc9e269fcd4e8d778ca79c6113f53ad86b88ada8d4b6625293bbe15) |
| adjudicate(true) via app settle route | [`0xa492…8240`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xa49297aaf8cab1a6340c240d3ca2fa715a86486e40f38e5e24a7857b42b08240) |

Evaluator: 6/6 checks green (5 rows in 4–6, schema, 0 dupes, emails, 5/5 URLs 200, dates ≤14d).
Balance check: provider 0.20 → **4.08** (+3.00 +1.00 −0.12 fee). Buyer +0.12 fee received (5.92).

Money reconciles to the unit on both paths. Demo uses these two orders.
