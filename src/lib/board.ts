// Board data for every screen (HNK-28.T1, HNK-30.T7, W-23): the live board the financier node
// scans, reached through /api/board on this origin. When the node does not answer, the last live
// board this browser saw (kept in localStorage; the board is public data), else the copy bundled
// with the site. Every screen says which one it used.
import { NET } from "./network.ts";

export const LIVE_BOARD = "/api/board";
/** Same-origin copy shipped with the site (testnet, up to the block below). */
export const BOARD_COPY = { url: "/demo/board-testnet-4511024.json", upToHeight: 4511024, taken: "2026-10-20" } as const;
const KEPT = "jitsuin.board.last";

export interface BoardData {
  /** `[{txid, height, tx_index, output_index, memo}]`, as `jitsuin verify --save-board` writes. */
  json: string;
  source: "live" | "kept" | "copy";
  tip: number;
  /** Seconds since the epoch of the scan (live, kept) or of the copy. */
  at: number;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Storage for the last live board; `null` where the browser blocks it. */
export interface Keep {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultKeep(): Keep | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function loadBoard(f: Fetch, keep: Keep | null = defaultKeep()): Promise<BoardData> {
  try {
    const r = await f(LIVE_BOARD, { credentials: "same-origin" });
    if (r.ok) {
      const j = (await r.json()) as { entries?: unknown[]; tip?: number; scanned_at?: number };
      if (Array.isArray(j.entries) && typeof j.tip === "number" && typeof j.scanned_at === "number") {
        const b: BoardData = { json: JSON.stringify(j.entries), source: "live", tip: j.tip, at: j.scanned_at };
        try {
          keep?.setItem(KEPT, JSON.stringify({ json: b.json, tip: b.tip, at: b.at }));
        } catch {
          /* storage full or blocked: nothing kept */
        }
        return b;
      }
    }
  } catch {
    /* the node is down or unreachable */
  }
  try {
    const k = keep?.getItem(KEPT);
    if (k) {
      const v = JSON.parse(k) as { json: string; tip: number; at: number };
      if (typeof v.json === "string" && typeof v.tip === "number" && v.tip > BOARD_COPY.upToHeight) return { ...v, source: "kept" };
    }
  } catch {
    /* unreadable: fall through to the copy */
  }
  const r = await f(BOARD_COPY.url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`board data answered ${r.status}`);
  return { json: await r.text(), source: "copy", tip: BOARD_COPY.upToHeight, at: Date.parse(`${BOARD_COPY.taken}T00:00:00Z`) / 1000 };
}

/** One line for the screen: where the board data came from. */
export function boardLine(b: BoardData, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now / 1000 - b.at) / 60));
  const age = mins < 120 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  if (b.source === "live") return `${NET.label} board, live scan up to block ${b.tip} (${age})`;
  if (b.source === "kept") return `Last live board this browser saw, up to block ${b.tip} (${age}): the node did not answer`;
  return `Bundled copy of the ${NET.noun} board up to block ${b.tip} (${BOARD_COPY.taken}): the node did not answer`;
}
