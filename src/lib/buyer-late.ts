// "If you pay late" on the buyer's payment slip and ledger (BL buyer-late): where a financed
// invoice stands against its due date, and the facts the system really holds about paying late.
// Pure data, no wasm: tests run it under Node.
//
// Every line below is checked against the code that makes it true (no overclaim, vault W-15):
// - late or on time is the financier's flag in the two-signature `settled` entry on the board,
//   set from the day (UTC) of the block that mined the covering payment: on time when that day
//   is not after the due date (jitsuin-flow `settlement::settle`, jitsuin-wasm `financierSettle`).
//   There is no grace period for the late mark.
// - an invoice joins the buyer's history chain only when the financier asked for the history
//   (`history.request`, a history certificate for this invoice: `history_cert`); a history check
//   then shows it as paid on time, paid late, open, or defaulted, and the chain cannot leave an
//   invoice out (jitsuin-board `verify_history`: gaps, forks and an undisclosed successor fail).
// - defaulted: not settled once the checking financier's grace period after the due date has
//   passed (`today > due + grace`, 7 days by default, node `mandate.grace()`); a JitsuinFi node
//   accepts no default in a history it checks and wants a share paid on time (80 % by default),
//   node `history::standard`.
// - the assignment letter the buyer sealed says the buyer pays the financier the amount by the due
//   date, nobody else (node `deals::letter_pdf`); its seals check offline (Verify page), and past
//   the due date the node keeps a repayment evidence file anyone can recheck (JTSE).

import type { BuyerInvoice } from "./buyer-invoices";

/** Days before the due date from which the slip warns. */
export const WARN_DAYS = 7;
/** The grace period a JitsuinFi node uses unless the financier sets another (node `mandate.grace()`). */
export const DEFAULT_GRACE_DAYS = 7;
/** The on-time share a JitsuinFi node wants unless the financier sets another (node `mandate.on_time_pct()`). */
export const DEFAULT_ON_TIME_PCT = 80;

export type LateState =
  /** Not financed (nothing to pay a financier yet), or more than a week before the due date. */
  | { kind: "none" }
  /** Financed, not settled, the due date within `WARN_DAYS` (0 = due today). */
  | { kind: "due-soon"; days_left: number }
  /** Financed, not settled, past the due date; `defaulted` once the default grace period passed. */
  | { kind: "overdue"; days_over: number; defaulted: boolean }
  | { kind: "paid-on-time" }
  | { kind: "paid-late" }
  /** Settled (the bundle is on this device), but the board was not read: on time or late unknown. */
  | { kind: "paid" };

/**
 * Where `rec` stands on `today` (days since the epoch). `board` is the invoice's board status as
 * the page words it (`boardStatus`: "settled on time", "settled late", ...), or null unread.
 */
export function lateState(rec: Pick<BuyerInvoice, "due_date" | "bundle" | "assignment">, today: number, board: string | null = null, grace = DEFAULT_GRACE_DAYS): LateState {
  if (board === "settled on time") return { kind: "paid-on-time" };
  if (board === "settled late") return { kind: "paid-late" };
  if (rec.bundle) return { kind: "paid" };
  if (!rec.assignment?.financier_seal) return { kind: "none" };
  const left = rec.due_date - today;
  if (left > WARN_DAYS) return { kind: "none" };
  if (left >= 0) return { kind: "due-soon", days_left: left };
  return { kind: "overdue", days_over: -left, defaulted: -left > grace };
}

/** The paid slip's status in the phone's bar (mobile E2E 4): on time or late when the board says so. */
export function paidWords(s: LateState): string {
  return s.kind === "paid-on-time" ? "Paid on time" : s.kind === "paid-late" ? "Paid late" : "Paid";
}

/**
 * Milliseconds until the on-time cut-off: the end of the due date in UTC, the last day a mined
 * payment counts as on time. Negative once it has passed.
 */
export function msToCutoff(dueDate: number, nowMs: number): number {
  return (dueDate + 1) * 86_400_000 - nowMs;
}

/** The countdown in words: "3 d 14 h", "5 h 20 min", "40 min". */
export function countdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${min} min`;
  return `${min} min`;
}

export interface LateLine {
  /** The hanko on the line. */
  glyph: string;
  text: string;
}

export interface LateFacts {
  /** A history certificate was issued for this invoice: it is part of the buyer's history chain. */
  inHistory: boolean;
  /** "0.0006 ZEC" */
  amount: string;
  /** "2026-10-28" */
  due: string;
  /** The first day a history check counts the invoice as defaulted, with the default grace period. */
  defaultFrom: string;
}

/** The slip's lines for `s`; empty for "none". */
export function lateLines(s: LateState, f: LateFacts): LateLine[] {
  const letter: LateLine = {
    glyph: "証",
    text: `The financier holds the assignment letter you sealed: your written acknowledgment that you pay it ${f.amount} by ${f.due}. Its seals check offline, so the financier can show it to anyone, a collector or a court included.`,
  };
  const rules: LateLine = f.inHistory
    ? {
        glyph: "規",
        text: `Financiers set rules (内規) for the histories they accept: a JitsuinFi node refuses a history with an invoice left unpaid past its grace period, and wants a share paid on time (${DEFAULT_ON_TIME_PCT}% unless the financier sets another). A late mark can make your next invoices harder to finance.`,
      }
    : { glyph: "規", text: "Each financier accepts or declines every offer by hand, and this one sees how you paid it." };
  switch (s.kind) {
    case "due-soon":
      return [
        f.inHistory
          ? { glyph: "歴", text: "A late mark stays in your payment history for good. Every financier you show your history to sees it: the chain cannot hide or skip an invoice." }
          : { glyph: "歴", text: "This invoice is not in your history chain (this financier did not ask for it), but its settled entry on the public board says on time or late, under your seal and the financier's, and cannot be changed." },
        letter,
        rules,
      ];
    case "overdue":
      return [
        f.inHistory
          ? { glyph: "遅", text: "Due date passed: this invoice will be marked late in your history when it is paid." }
          : { glyph: "遅", text: "Due date passed: its settled entry on the public board will say late when it is paid." },
        ...(f.inHistory
          ? [
              s.defaulted
                ? { glyph: "滞", text: `Until it is paid, a history check counts it as defaulted: the ${DEFAULT_GRACE_DAYS}-day grace period a JitsuinFi node uses unless the financier sets another has passed, and the node refuses a history with a default.` }
                : { glyph: "滞", text: `Still unpaid on ${f.defaultFrom}, a history check counts it as defaulted until it is paid (after the ${DEFAULT_GRACE_DAYS}-day grace period a JitsuinFi node uses unless the financier sets another), and the node refuses a history with a default.` },
            ]
          : []),
        { ...letter, text: `${letter.text} Past the due date its node also keeps an evidence file of what you paid, which anyone can recheck.` },
      ];
    case "paid-on-time":
      return [{ glyph: "済", text: f.inHistory ? "Paid on time: the board's settled entry says on time, and so does your history." : "Paid on time: the board's settled entry says on time." }];
    case "paid-late":
      return [{ glyph: "遅", text: f.inHistory ? "Paid late: the board's settled entry says late, and your history shows it to every financier you show it to." : "Paid late: the board's settled entry says late." }];
    case "paid":
      return [{ glyph: "済", text: "Settled. Whether on time or late shows once the board is read." }];
    default:
      return [];
  }
}

/** The ledger's short line for `s`, or null for "none". */
export function ledgerLine(s: LateState): { glyph: string; text: string; tone: "soon" | "over" | "ok" | "late" } | null {
  switch (s.kind) {
    case "due-soon":
      return { glyph: "期", text: s.days_left === 0 ? "due today · a late mark stays" : `${s.days_left} day${s.days_left === 1 ? "" : "s"} left · a late mark stays`, tone: "soon" };
    case "overdue":
      return { glyph: "遅", text: "due date passed · marked late when paid", tone: "over" };
    case "paid-on-time":
      return { glyph: "済", text: "paid on time", tone: "ok" };
    case "paid-late":
      return { glyph: "遅", text: "paid late", tone: "late" };
    default:
      return null;
  }
}

/**
 * The reminder lines for the app (the shell and the buyer's caption): every invoice due within
 * `WARN_DAYS` or past its due date and not settled on this device, soonest first.
 */
export interface Reminder {
  n: string;
  invoice_id: string;
  amount_zat: number;
  state: Extract<LateState, { kind: "due-soon" | "overdue" }>;
}

export function reminders(list: Array<Pick<BuyerInvoice, "n" | "invoice_id" | "amount_zat" | "due_date" | "bundle" | "assignment">>, today: number): Reminder[] {
  const out: Reminder[] = [];
  for (const r of [...list].sort((a, b) => a.due_date - b.due_date)) {
    const s = lateState(r, today);
    if (s.kind === "due-soon" || s.kind === "overdue") out.push({ n: r.n, invoice_id: r.invoice_id, amount_zat: r.amount_zat, state: s });
  }
  return out;
}

/** One reminder in words. */
export function reminderText(r: Pick<Reminder, "invoice_id" | "state">, amount: string): string {
  const s = r.state;
  if (s.kind === "overdue") return `${r.invoice_id}: ${amount}, ${s.days_over} day${s.days_over === 1 ? "" : "s"} past its due date. It will be marked late when paid.`;
  return `${r.invoice_id}: ${amount} ${s.days_left === 0 ? "due today" : `due in ${s.days_left} day${s.days_left === 1 ? "" : "s"}`}.`;
}

/**
 * The count on the buyer's Pay tab (IA port 2026-10-26): the invoices due within `WARN_DAYS` or
 * past their due date and not settled on this device; 0 shows no badge.
 */
export function payBadge(list: Parameters<typeof reminders>[0], today: number): number {
  return reminders(list, today).length;
}

// ---------- the financier's reminder letters (judge run 3, finding 1) ----------
// The financier's node sends `deal.reminder` at three milestones (node `reminder::MILESTONES`):
// "d-7", "d-1" and "d+1", once each. A reminder only says "open the slip", so it is handled once
// the buyer saw that slip at or after its milestone, or once the invoice is settled on this
// device (its bundle is kept; the node sends no reminder once the repayment is pending or
// settled). A later milestone is news again: its letter counts until the slip is seen once more.

/** The node's milestones, as days from the due date (node `reminder::MILESTONES`). */
export const REMINDER_MILESTONES: ReadonlyArray<readonly [string, number]> = [
  ["d-7", -7],
  ["d-1", -1],
  ["d+1", 1],
];

/** The milestones reached on `today` (days since the epoch) for an invoice due on `dueDate`. */
export function milestonesReached(dueDate: number, today: number): string[] {
  return REMINDER_MILESTONES.filter(([, off]) => today >= dueDate + off).map(([m]) => m);
}

/**
 * What the invoice's `reminders_seen` becomes when the buyer opens its slip on `today`: the
 * milestones reached by then and those of the reminder letters in the inbox, added to the ones
 * seen before. Null when nothing new is seen (nothing to write).
 */
export function slipSeen(seen: readonly string[] | undefined, dueDate: number, today: number, inInbox: readonly unknown[] = []): string[] | null {
  const known = new Set(REMINDER_MILESTONES.map(([m]) => m));
  const was = new Set(seen ?? []);
  const add = [...milestonesReached(dueDate, today), ...inInbox.filter((m): m is string => typeof m === "string" && known.has(m))].filter((m) => !was.has(m));
  if (!add.length) return null;
  const all = new Set([...was, ...add]);
  return REMINDER_MILESTONES.map(([m]) => m).filter((m) => all.has(m));
}

/** A reminder for `milestone` is handled: the invoice is settled here, or its slip was seen at that milestone. */
export function reminderHandled(rec: Pick<BuyerInvoice, "bundle" | "reminders_seen">, milestone: unknown): boolean {
  if (rec.bundle) return true;
  const seen = rec.reminders_seen ?? [];
  // a reminder without a milestone (not one this app knows): seeing the slip once is enough
  return typeof milestone === "string" && REMINDER_MILESTONES.some(([m]) => m === milestone) ? seen.includes(milestone) : seen.length > 0;
}
