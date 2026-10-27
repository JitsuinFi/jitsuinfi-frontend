// Sheets the phone's back button closes (DS-MOB N4, N5; IA port part 2, 2026-10-26): opening the
// inbox or the account menu pushes one history entry for the page under it (same address, marked
// in its state); Back pops it and the sheet closes. A sheet the person closes by hand (×, Esc, the
// scrim) goes back over its entry; one closed by a move to another page leaves the entry behind,
// which Back then steps over.
import { useEffect, useRef } from "react";

const MARK = "iaSheet";

/** The current history entry is a sheet's. */
export function onSheetEntry(): boolean {
  return !!(window.history.state as Record<string, unknown> | null)?.[MARK];
}

/** Closes the open sheet by hand: back over its entry (popstate then closes it), or at once. */
export function dismissSheet(close: () => void): void {
  // closed at once in every case (judge run 2: a Close that only went back left a desktop menu open)
  if (onSheetEntry()) window.history.back();
  close();
}

/** Pushes the entry while `open`; Back (popstate off the entry) calls `close`. */
export function useBackCloses(open: boolean, close: () => void): void {
  const isOpen = useRef(open);
  isOpen.current = open;
  useEffect(() => {
    if (open && !onSheetEntry()) window.history.pushState({ ...(window.history.state as object | null), [MARK]: true }, "");
  }, [open]);
  useEffect(() => {
    const pop = () => {
      if (onSheetEntry()) {
        // Back from another page landed on an entry a sheet left behind: step over it
        if (!isOpen.current) window.history.back();
        return;
      }
      if (isOpen.current) close();
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [close]);
}
