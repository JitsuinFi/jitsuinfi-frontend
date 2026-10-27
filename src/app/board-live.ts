// The live board for the role pages (judge run 2, finding 2; lib/board-watch.ts says when): one
// copy per tab, read on the first page that needs it, again after a write to the role's store
// (a deal changed state), when the tab becomes visible again, and every 45 s while a deal is in
// flight. Every page using it redraws when a new read lands.
import { useEffect, useReducer } from "react";
import { loadBoard, type BoardData } from "../lib/board";
import { shouldReadBoard, type BoardReason, type BoardWatchState } from "../lib/board-watch";
import { onStoreChange, type Role } from "../lib/store";

let board: BoardData | null = null;
const state: BoardWatchState = { lastAt: null, busy: false };
const listeners = new Set<() => void>();
let inFlightPages = 0;

/** Reads the board now (unless a read is on its way); every page redraws when it lands. */
export async function refreshBoard(): Promise<BoardData | null> {
  if (state.busy) return board;
  state.busy = true;
  state.lastAt = Date.now();
  try {
    const b = await loadBoard((u, i) => fetch(u, i)).catch(() => null);
    if (b) {
      board = b;
      listeners.forEach((f) => f());
    }
    return b;
  } finally {
    state.busy = false;
  }
}

function ask(reason: BoardReason): void {
  if (shouldReadBoard(state, reason, Date.now(), inFlightPages > 0)) void refreshBoard();
}

/** The board as last read in this tab; `inFlight`: a deal on this page waits for the board. */
export function useLiveBoard(role: Role, inFlight: boolean): BoardData | null {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    ask("first");
    const offStore = onStoreChange((c) => c.role === role && ask("change"));
    const vis = () => document.visibilityState === "visible" && ask("visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      listeners.delete(bump);
      offStore();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [role]);
  useEffect(() => {
    if (!inFlight) return;
    inFlightPages++;
    const t = window.setInterval(() => document.visibilityState === "visible" && ask("tick"), 15_000);
    return () => {
      inFlightPages--;
      window.clearInterval(t);
    };
  }, [inFlight]);
  return board;
}
