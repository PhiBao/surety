import { parseAbi } from "viem";

/**
 * X Layer wiring. Testnet first; mainnet only after the full PASS + FAIL loop
 * is explorer-verifiable on testnet.
 */

export const XLAYER_TESTNET = {
  id: 1952,
  name: "X Layer Testnet",
  rpc: "https://xlayertestrpc.okx.com/terigon",
  explorer: "https://www.okx.com/web3/explorer/xlayer-test",
  /** Paxos USDG on X Layer testnet (Paxos docs). */
  usdg: "0xF0863D7A29a55d0c4263c11bFac754312ff078DF" as `0x${string}`,
} as const;

export const ESCROW_ADDRESS = "0x6792e51fbd24f9315282bd5b6c5e713dcc779c69" as `0x${string}`;

/** Minimal ABI subset the app needs (read + adjudicate + state). */
export const ESCROW_ABI = parseAbi([
  "function stateOf(uint256) view returns (uint8)",
  "function adjudicate(uint256,bool,string)",
  "function nextOrderId() view returns (uint256)",
]);

export function txUrl(hash: string): string {
  return `${XLAYER_TESTNET.explorer}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${XLAYER_TESTNET.explorer}/address/${addr}`;
}
