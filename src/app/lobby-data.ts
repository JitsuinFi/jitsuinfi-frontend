// What the lobby's office prints from the board (HNK-34.T1): TES-INV-0003's fingerprint N and the
// blocks it was registered at. The test invoice of the kit (src/lib/kit.ts) was registered for
// financier A at block 4 509 299, and registered again at block 4 509 521: the second financing the
// board catches. Read from the board copy bundled with the app (src/lib/board.ts BOARD_COPY, the
// published testnet snapshot), whose memos jitsuin-wasm decodes; nothing here is made up.

/** The rooms of the app, as parts of the lobby's office. */
export type Room = "supplier" | "buyer" | "financier" | "outsider" | "member" | "verify" | "try" | "rates";
/** The order an invoice lives the rooms in: the lobby's tour walks it. */
export const ORDER: readonly Room[] = ["supplier", "buyer", "financier", "outsider", "member", "verify", "try", "rates"];

export interface Twice {
  /** N, hex. */
  n: string;
  /** Heights of every register entry with this N, in order: the first counts, the rest are refused. */
  heights: number[];
}

/**
 * The register entries that share the N of the entry `txid`. `describe` is jitsuin-wasm's
 * boardMemoDescribe. Null when the entry is not on this board.
 */
export function twiceOf(boardJson: string, describe: (memo: string) => string, txid: string): Twice | null {
  const list = JSON.parse(boardJson) as Array<{ txid: string; height: number; memo: string }>;
  const seen = list.flatMap((e) => {
    try {
      const d = JSON.parse(describe(e.memo)) as { kind: string; nullifier?: string };
      return d.kind.startsWith("Register") && d.nullifier ? [{ txid: e.txid, height: e.height, n: d.nullifier }] : [];
    } catch {
      return [];
    }
  });
  const mine = seen.find((e) => e.txid === txid);
  if (!mine) return null;
  const heights = seen.filter((e) => e.n === mine.n).map((e) => e.height);
  return { n: mine.n, heights: [...new Set(heights)].sort((a, b) => a - b) };
}

/** N as the figures draw it: "N 56ed…8450". */
export const nShort = (hex: string): string => `N ${hex.slice(0, 4)}…${hex.slice(-4)}`;

/** A block height as the board prints it: "4 509 299". */
export const blockText = (h: number): string => h.toLocaleString("en-US").replace(/,/g, " ");
