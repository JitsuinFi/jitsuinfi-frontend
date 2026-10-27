// When a page reads the public board again (judge run 2, finding 2): the board was read once per
// tab, so a deal posted, registered or settled after that read kept saying "not on the board yet".
// Now it is read again when a deal changes state on this device, when the person comes back to
// the tab, and at a modest interval while a deal is in flight (offered or signed, not settled).
// Reads stay spaced out so a burst of writes or tab switches is one request. Pure: tests run it
// under Node.

export type BoardReason = "first" | "change" | "visible" | "tick";

/** Least time between two reads, by what asks for one (ms). */
export const BOARD_GAP: Record<BoardReason, number> = { first: 0, change: 4_000, visible: 15_000, tick: 45_000 };

export interface BoardWatchState {
  /** When the board was last asked for (ms), or null before the first read. */
  lastAt: number | null;
  /** A read is on its way. */
  busy: boolean;
}

/** Whether to read the board now. A tick reads only while a deal is in flight. */
export function shouldReadBoard(s: BoardWatchState, reason: BoardReason, now: number, inFlight: boolean): boolean {
  if (s.busy) return false;
  if (s.lastAt === null) return true;
  if (reason === "first") return false;
  if (reason === "tick" && !inFlight) return false;
  return now - s.lastAt >= BOARD_GAP[reason];
}
