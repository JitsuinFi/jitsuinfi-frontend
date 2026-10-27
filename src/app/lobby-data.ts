// What the lobby's office prints from the board (HNK-34.T1): TES-INV-0003's fingerprint N and the
// blocks it was registered at. The test invoice of the kit (src/lib/kit.ts) was registered for
// financier A at block 4 509 299, and registered again at block 4 509 521: the second financing the
// board catches. Read from the board copy bundled with the app (src/lib/board.ts BOARD_COPY, the
// published testnet snapshot), whose memos jitsuin-wasm decodes; nothing here is made up.
// Also the rooms' copy (the directory, the pins, the next-room row at the end of a public page).
import { CONSOLE_DEMO_URL } from "../lib/hosts.ts";

/** The rooms of the app, as parts of the lobby's office. */
export type Room = "supplier" | "buyer" | "financier" | "outsider" | "member" | "verify" | "try" | "rates";
/** The order an invoice lives the rooms in: the lobby's tour walks it. */
export const ORDER: readonly Room[] = ["supplier", "buyer", "financier", "outsider", "member", "verify", "try", "rates"];

export interface RoomCopy {
  /** An app path, or (`ext`) a page on another host, opened in a new tab. */
  to: string;
  ext?: boolean;
  kanji: string;
  title: string;
  short: string;
  text: string;
}

export const ROOMS: Record<Room, RoomCopy> = {
  try: { to: "/try", kanji: "試", title: "Try to double-finance", short: "Try", text: "Sell one invoice twice and watch it fail. No wallet needed." },
  verify: { to: "/verify", kanji: "証", title: "Verify", short: "Verify", text: "Check a deal or catch a double financing." },
  outsider: { to: "/outsider", kanji: "外", title: "What outsiders see", short: "Outsiders", text: "Only what the public board shows. Nothing about the parties." },
  rates: { to: "/rates", kanji: "価", title: "Rate index", short: "Rates", text: "Market prices from the board, no parties." },
  supplier: { to: "/supplier", kanji: "売", title: "Supplier", short: "Supplier", text: "Issue an invoice and get it financed once." },
  buyer: { to: "/buyer", kanji: "買", title: "Buyer", short: "Buyer", text: "Sign, acknowledge and pay with keys from your passkey." },
  member: { to: "/member", kanji: "資", title: "Fund member", short: "Fund", text: "See what the fund holds for you." },
  // the financier's counter is its node's console, on the console's own host: the demo console here
  financier: { to: CONSOLE_DEMO_URL, ext: true, kanji: "融", title: "Financier", short: "Financier", text: "Finance invoices provably not financed elsewhere. The demo console opens in your browser ↗" },
};

/** The rooms open to anyone, in the order the lobby's directory lists them: a visitor's walk. */
export const PUBLIC_WALK: readonly Room[] = ["try", "verify", "outsider", "rates"];

/** The lobby itself, as the last stop of the walk. */
export const LOBBY: Omit<RoomCopy, "short"> = { to: "/app", kanji: "登", title: "Back to the lobby", text: "The registry office: every room of the app." };

/** The room after `room` on the walk; the lobby after the last one. */
export function nextRoom(room: Room): Omit<RoomCopy, "short"> {
  const i = PUBLIC_WALK.indexOf(room);
  return i >= 0 && i < PUBLIC_WALK.length - 1 ? ROOMS[PUBLIC_WALK[i + 1]] : LOBBY;
}

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
