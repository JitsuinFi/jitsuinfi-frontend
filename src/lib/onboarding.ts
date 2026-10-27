// The Ready step after sign-up (AccountPage "You're set"): shown over the role screen the sign-up
// started on, until it is left. Audit 2026-10-27, finding 1: it is left by its own buttons and by
// any move to another screen (a tab, a nav link, the brand, the system Back), so a tab never
// changes the address without changing the page. Pure: tests run it under Node.

let on = false;
const listeners = new Set<() => void>();

export const onboarding = {
  /** Whether the Ready step is showing (or about to, while the new session starts). */
  get on(): boolean {
    return on;
  },
  set(v: boolean): void {
    if (on === v) return;
    on = v;
    listeners.forEach((f) => f());
  },
  /** Called whenever the step starts or ends; returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

/** A tab or nav link was pressed, or the screen changed: the Ready step ends. */
export function leaveOnboarding(): void {
  onboarding.set(false);
}

/**
 * The shell saw the address change from `from` to `to`: a move to another screen ends the Ready
 * step; the same address (a repaint, a search change on the same screen) keeps it.
 */
export function onScreenChange(from: string | null, to: string): void {
  if (from !== null && from !== to) leaveOnboarding();
}
