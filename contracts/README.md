# Contracts — SuretyEscrow

Bonded agent-work escrow. Buyer escrows price, provider posts bond, deterministic
evaluator adjudicates against a hash-committed acceptance spec.

## Test

```bash
forge test
```

7 tests cover: PASS payout minus fee, FAIL slash, no-show slash, unbonded refund,
dispute→resolve, post-window settle, access-control + state-machine reverts.

## Deploy (X Layer testnet, chain 1952)

1. Fund a deployer with test OKB + test USD₮0 from the
   [X Layer faucet](https://web3.okx.com/xlayer/faucet).
2. Set env: `ADJUDICATOR` (evaluator service address), `FEE_RECIPIENT`,
   `XLAYER_TESTNET_RPC=https://testrpc.xlayer.tech/terigon`, private key via
   `--account` / `--private-key` (never commit keys).
3. Run:

```bash
forge script script/Deploy.s.sol --rpc-url $XLAYER_TESTNET_RPC --broadcast
```

4. Record the deployed address + explorer link
   (`https://www.okx.com/web3/explorer/xlayer-test`) in `docs/submission.md`.

Mainnet (chain 196, `https://rpc.xlayer.tech/terigon`) only after the testnet
PASS + FAIL loop is explorer-verifiable end to end.

## Security notes

- `block.timestamp` deadlines: acceptable on X Layer (1s blocks, trusted sequencer);
  windows are in days, miner drift is immaterial. Documented, not ignored.
- Reentrancy guarded + `SafeERC20` throughout; single `adjudicate` enforced by state.
- Infra failures must never auto-slash: the evaluator reports "unverifiable → human
  review" instead of FAIL (enforced in `evaluator/`, not here).
