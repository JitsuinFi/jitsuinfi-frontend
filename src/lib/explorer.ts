// The block explorer every txid link of the app opens (wave 6: testnet.zcashexplorer.app was ~53k
// blocks behind and answered 404/403; blockexplorer.one answered 200 with confirmations). One
// constant, so a change of explorer is one line. Pure: tests run it under Node.
import { NETWORK } from "./network.ts";

export const EXPLORER_TX = `https://blockexplorer.one/zcash/${NETWORK === "main" ? "mainnet" : "testnet"}/tx/`;

/** A transaction on the explorer of this build's network. */
export function txUrl(txid: string): string {
  return `${EXPLORER_TX}${encodeURIComponent(txid)}`;
}
