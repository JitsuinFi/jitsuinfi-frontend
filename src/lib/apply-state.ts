// A would-be financier's application on this browser (HNK-26.T25; nav audit 2026-10-25): sent
// sets jitsuin.apply.sent (an ISO time, src/pages/ApplyPage.tsx), and opening the provider's
// invite sets jitsuin.apply.opened. Between the two, the app reminds the applicant to check for the
// invite. Pure: tests run it under Node.

export const APPLY_SEED = "jitsuin.apply.seed";
export const APPLY_SENT = "jitsuin.apply.sent";
export const APPLY_OPENED = "jitsuin.apply.opened";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "25 October 2026" for an ISO time; null when it is not one. */
export function sentDay(iso: string): string | null {
  const d = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The application waiting for its invite, from this browser's storage; null when none waits. */
export function waitingApplication(get: (key: string) => string | null): { day: string } | null {
  let sent: string | null;
  let opened: string | null;
  try {
    sent = get(APPLY_SENT);
    opened = get(APPLY_OPENED);
  } catch {
    return null;
  }
  if (!sent || opened) return null;
  const day = sentDay(sent);
  return day ? { day } : null;
}

/** This browser's localStorage reader, or one that finds nothing where storage is blocked. */
export function storageGet(): (key: string) => string | null {
  try {
    const st = localStorage;
    return (k) => st.getItem(k);
  } catch {
    return () => null;
  }
}
