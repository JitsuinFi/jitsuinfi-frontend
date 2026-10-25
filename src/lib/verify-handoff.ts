// A settled deal's bundle carried to the Verify page's in-tray (nav audit 2026-10-25): kept in
// memory for the next Verify page in this tab, never in the address (a bundle can be long, and the
// address ends up in history and logs). Taken once.

let held: string | null = null;

/** Hands `code` to the next Verify page opened in this tab. */
export function handToVerify(code: string): void {
  held = code.trim() || null;
}

/** The code handed over, once; null when there is none. */
export function takeForVerify(): string | null {
  const c = held;
  held = null;
  return c;
}
