// The Zcash network of this build, in one place (HNK-26.T19, BL-D0-04): `VITE_NETWORK=main` at
// build time switches every label and address check to mainnet; anything else is testnet. The
// node takes `NETWORK` from its environment and the CLI reads it from the viewing key, so the
// three never mix networks silently. Pure: tests run it under Node.

export type Network = "test" | "main";

const env = (import.meta as { env?: Record<string, string | undefined> }).env;

export const NETWORK: Network = env?.VITE_NETWORK === "main" ? "main" : "test";

export const NET = {
  test: { label: "Zcash testnet", short: "Testnet", noun: "testnet", addressHint: "utest1…" },
  main: { label: "Zcash mainnet", short: "Mainnet", noun: "mainnet", addressHint: "u1…" },
}[NETWORK];

/** Shielded address prefixes of a network: unified, or Sapling. */
export function shieldedPrefixes(net: Network = NETWORK): string[] {
  return net === "main" ? ["u1", "zs1"] : ["utest1", "ztestsapling1"];
}
