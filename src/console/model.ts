// The financier desk as data (HNK-34.T5): the deal's route, its tab, its seals and stamps, and the
// desk's big numbers, all derived from what the node already sends (/node/console/deals,
// /node/mail). Pure: tests run it under Node.
import { explain } from "../lib/explain.ts";

// ZEC amounts without the wasm bundle (core.ts): the console stays small.
export const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/\.?0+$/, "");
export const dueDay = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10);
export const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s);

export interface DealLike {
  n: string;
  invoice_id: string;
  advance_zat: number;
  state: string;
  stopped?: string;
  confirmations?: number | null;
  min_confirmations?: number;
  repayment?: string | null;
  settled_txid?: string | null;
  advance_txid?: string;
}

/** The deal's route (HNK-26.T16, SEQ-03): one station per state of the node's flow. */
export const ROUTE: Array<{ glyph: string; mark: string; label: string; states: string[] }> = [
  { glyph: "照", mark: "loupe", label: "Board checked", states: ["Check"] },
  { glyph: "署", mark: "pen", label: "Supplier signed the entry", states: ["AwaitSupplierSignature"] },
  { glyph: "登", mark: "board", label: "Entry on the board", states: ["Register", "AwaitConfirmation"] },
  { glyph: "印", mark: "seal", label: "Letter sealed by supplier and buyer", states: ["AwaitAssignment"] },
  { glyph: "金", mark: "coin", label: "Advance paid", states: ["Pay", "AwaitAdvanceConfirmation"] },
  { glyph: "済", mark: "done", label: "Done", states: ["Done"] },
];

export const WAITING: Record<string, string> = {
  Check: "Checking the board for this invoice.",
  AwaitSupplierSignature: "Waiting for the supplier to sign the board entry.",
  Register: "Posting the entry to the board.",
  AwaitConfirmation: "Entry posted; waiting for its confirmations.",
  AwaitAssignment: "Letter sent; waiting for the supplier's and the buyer's seals.",
  Pay: "Sealed by both. Your passkey approves the advance.",
  AwaitAdvanceConfirmation: "Advance sent; waiting for it to be mined.",
  Done: "Advance paid and mined. The buyer pays you at maturity.",
};

const LATE = ["Claimed", "Disputed", "Overdue"];
export const isLate = (d: DealLike) => d.state === "Done" && LATE.includes(d.repayment ?? "");
export const isSettled = (d: DealLike) => d.state === "Done" && (!!d.settled_txid || d.repayment === "Settled");
export const isDouble = (d: DealLike) => d.state === "Stopped" && (d.stopped ?? "").startsWith("DoubleFinanced");

/** Where on the route a deal is; -1 for a state the route does not know. */
export const stationOf = (d: DealLike) => ROUTE.findIndex((r) => r.states.includes(d.state));

/**
 * The 重 card's words (E2E audit 2026-10-25): whose entry came first on the board, from the node's
 * `stopped_order` (the stop's board positions matched on this node's commitment). A node from
 * before that field says only what holds in every order.
 */
export function doubleNote(order?: string | null): string {
  const proof = "No money left this node. Exhibit A proves it to anyone without showing the deal.";
  switch (order) {
    case "ours_first":
      return `Your entry was first on the board; the supplier also signed this invoice for another financier, whose entry came later. An invoice signed twice is not financed, so the deal stopped. ${proof}`;
    case "theirs_first":
      return `Another financier registered this invoice first; the supplier signed it for both of you. ${proof}`;
    case "others_only":
      return `The supplier signed this invoice for two other financiers; no entry of yours is on the board. ${proof}`;
    default:
      return `The supplier signed this invoice for more than one financier. ${proof}`;
  }
}

/**
 * The line under an accepted offer (E2E audit 2026-10-25): with a buyer-history mandate the node
 * sends the commitment opening only once the buyer's history passes (`opening` from /node/mail).
 */
export function acceptedLine(a: { advance_zat: number; min_confirmations: number }, opening?: string | null): string {
  const terms = `Accepted: ${zec(a.advance_zat)} ZEC after ${a.min_confirmations} confirmation${a.min_confirmations === 1 ? "" : "s"}.`;
  switch (opening) {
    case "awaiting_history":
      return `${terms} Waiting for the buyer's history; the supplier gets your commitment opening once it passes.`;
    case "sent_after_history":
      return `${terms} The buyer's history passed; the supplier has your commitment opening.`;
    case "sent":
      return `${terms} The supplier has your commitment opening.`;
    default:
      return `${terms} The supplier gets your commitment opening, after the buyer's history when your mandate asks for it.`;
  }
}

/** The station whose check found the stop: AlreadyFinanced at 照 (the board check), DoubleFinanced at 登 (the entry on the board). */
export function stopStation(stopped: string): number {
  return stopped.startsWith("DoubleFinanced") ? 2 : 0;
}

export type At = "done" | "now" | "wait" | "later" | "stop" | "cut";

/** Each station's mark: passed, the financier's action, in progress, later, stopped here, not reached. */
export function stations(d: DealLike): At[] {
  const at = stationOf(d);
  const stop = d.state === "Stopped" ? stopStation(d.stopped ?? "") : -1;
  return ROUTE.map((_, i) => {
    if (d.state === "Stopped") return i < stop ? "done" : i === stop ? "stop" : "cut";
    if (d.state === "Done") return "done";
    return i < at ? "done" : i === at ? (d.state === "Pay" ? "now" : "wait") : "later";
  });
}

/** The tab of a deal's folder: its kind (colour of the mark) and one short line. */
export function tabOf(d: DealLike): { kind: "act" | "wait" | "stop" | "late" | "done"; line: string; glyph: string } {
  const at = stationOf(d);
  if (d.state === "Stopped") return { kind: "stop", line: "Stopped", glyph: isDouble(d) ? "重" : "止" };
  if (d.state === "Pay") return { kind: "act", line: "Pay advance", glyph: "金" };
  if (isLate(d)) return { kind: "late", line: d.repayment!, glyph: d.repayment === "Claimed" ? "待" : "滞" };
  if (isSettled(d)) return { kind: "done", line: "Settled", glyph: "済" };
  if (d.state === "Done") return { kind: "done", line: d.repayment ? `Repayment ${d.repayment.toLowerCase()}` : "Advance paid", glyph: "済" };
  const glyph = at >= 0 ? ROUTE[at].glyph : "待";
  if (d.state === "AwaitConfirmation" && d.confirmations != null && d.min_confirmations) return { kind: "wait", line: `${d.confirmations} of ${d.min_confirmations} blocks`, glyph };
  if (d.state === "AwaitAssignment") return { kind: "wait", line: "Awaiting seals", glyph };
  if (d.state === "AwaitAdvanceConfirmation") return { kind: "wait", line: "Advance mining", glyph };
  return { kind: "wait", line: (WAITING[d.state] ?? d.state).replace(/\.$/, ""), glyph };
}

/** The three seal boxes of the letter: supplier and buyer once the letter is sealed (past 印), the financier's with the advance. */
export function seals(d: DealLike): [boolean, boolean, boolean] {
  if (d.state === "Stopped") return [false, false, false];
  const both = stationOf(d) >= 4;
  const mine = d.state === "AwaitAdvanceConfirmation" || d.state === "Done" || !!d.advance_txid;
  return [both, both, mine];
}

/** The big stamp that lands on the letter: settled, financed twice, or repayment overdue. */
export function bigStamp(d: DealLike): { glyph: string; word: string } | null {
  if (isSettled(d)) return { glyph: "済", word: "SETTLED" };
  if (isDouble(d)) return { glyph: "重", word: "TWICE" };
  if (d.state === "Done" && (d.repayment === "Overdue" || d.repayment === "Disputed")) return { glyph: "滞", word: d.repayment.toUpperCase() };
  return null;
}

export interface MailLike {
  offer?: { ok: boolean; accepted?: unknown; mandate?: { verdict: string } };
}

/** The desk's big numbers. */
export function totals(deals: DealLike[] | null, mail: MailLike[] | null) {
  const waiting = (mail ?? []).filter((m) => m.offer?.ok && !m.offer.accepted);
  const paid = (deals ?? []).filter((d) => !!d.advance_txid);
  return {
    offers: mail ? waiting.length : null,
    breaking: mail ? waiting.filter((m) => m.offer?.mandate?.verdict === "breaks").length : null,
    route: deals ? deals.filter((d) => d.state !== "Done" && d.state !== "Stopped").length : null,
    advanced: deals ? paid.reduce((s, d) => s + d.advance_zat, 0) : null,
    advancedDeals: paid.length,
    settled: deals ? deals.filter(isSettled).length : null,
  };
}

/** A refused offer in plain words, with the node's own phrase kept when the words differ from it. */
export function refusal(problem: string): { text: string; raw: string | null } {
  const said = explain(problem);
  if (said === problem) return { text: `Refused by the node: ${problem}. Nothing was saved.`, raw: null };
  return { text: `Refused by the node. ${said} Nothing was saved.`, raw: problem };
}

/** The 16 characters of an invite code, as four groups for the key tag (· for the ones not typed yet). */
export function tagGroups(code: string): Array<string | null> {
  const raw = code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 16);
  return [0, 1, 2, 3].map((i) => {
    const part = raw.slice(i * 4, i * 4 + 4);
    return part ? part.padEnd(4, "·") : null;
  });
}

/** "4 min ago" for a scan time in seconds since the epoch. */
export function agoSec(t: number, now = Date.now()): string {
  const s = Math.max(0, now / 1000 - t);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
