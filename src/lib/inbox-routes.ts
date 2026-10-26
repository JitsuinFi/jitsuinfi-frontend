// The inbox panel's letters (IA port, approved prototype 2026-10-26): what each kind of letter is
// called in plain words, its envelope's kanji, the action it carries and where that action leads.
// Acting on a letter that needs a page (a deal's station, the blank invoice) stamps 済 on the
// envelope, closes the panel and opens that page with the outcome on it ("Done · from your
// inbox"); a small action that needs no page (keep a settlement bundle) completes in the panel.
// Pure: tests run it under Node.
import type { Role } from "./account.ts";
import type { MessageType } from "./relay-message.ts";
import type { StationKey } from "./supplier-deal.ts";

/** Readable names for every letter kind (no type ids in the panel). */
export const LETTER_LABEL: Partial<Record<MessageType, string>> = {
  "invoice.sign_request": "Invoice to sign",
  "invoice.signature": "The buyer signed your invoice",
  "key.invoice_pk": "A buyer's key for your next invoice",
  "deal.decline": "A financier declined your offer",
  "deal.commitment_opening": "The financier asks for the board entry",
  "deal.entry_request": "The financier asks for the board entry",
  "deal.letter": "Assignment letter to read and seal",
  "deal.seal": "A seal on the assignment letter",
  "deal.advance": "The financier paid the advance",
  "deal.bundle": "Repaid and settled",
  "deal.reminder": "Due-date reminder",
  "history.request": "A financier asks for your history",
  "history.chain": "A buyer's history",
  "fund.receipt": "Deposit receipt",
  "fund.merkle_path": "Your units in the period's root",
  "fund.payout": "Withdrawal paid",
  "financier.invite": "Invitation to run a financier node",
};

export const LETTER_GLYPH: Partial<Record<MessageType, string>> = {
  "invoice.sign_request": "請",
  "invoice.signature": "買",
  "key.invoice_pk": "鍵",
  "deal.decline": "否",
  "deal.commitment_opening": "登",
  "deal.entry_request": "登",
  "deal.letter": "印",
  "deal.seal": "印",
  "deal.advance": "金",
  "deal.bundle": "済",
  "deal.reminder": "期",
  "history.request": "歴",
  "history.chain": "歴",
  "fund.receipt": "受",
  "fund.merkle_path": "認",
  "fund.payout": "払",
};

/** A letter's name: its plain label, or "A letter" for a kind this app does not name. */
export function letterLabel(type: string): string {
  return LETTER_LABEL[type as MessageType] ?? "A letter";
}

export function letterGlyph(type: string): string {
  return LETTER_GLYPH[type as MessageType] ?? "信";
}

/** Where an action leads: a page (a deal at one of its stations, or the blank invoice), or nowhere. */
export type Lead = { kind: "deal"; station: StationKey } | { kind: "new-invoice" } | { kind: "panel" };

export interface LetterAction {
  /** The button's words. */
  label: string;
  lead: Lead;
  /** The line beside the button: where it goes. */
  goes: string;
}

const STATION_WORD: Record<StationKey, string> = { signature: "照", offer: "署", entry: "登", seal: "印", advance: "金", settled: "済" };

const SUPPLIER: Partial<Record<MessageType, LetterAction>> = {
  "invoice.signature": { label: "Check and keep", lead: { kind: "deal", station: "offer" }, goes: "opens the deal" },
  "key.invoice_pk": { label: "Use for my next invoice", lead: { kind: "new-invoice" }, goes: "opens Write an invoice" },
  "deal.decline": { label: "Note and free the invoice", lead: { kind: "deal", station: "offer" }, goes: `opens the deal at ${STATION_WORD.offer}` },
  "deal.commitment_opening": { label: "Use this entry request", lead: { kind: "deal", station: "entry" }, goes: `opens the deal at ${STATION_WORD.entry}` },
  "deal.letter": { label: "Keep the letter", lead: { kind: "deal", station: "seal" }, goes: `opens the deal at ${STATION_WORD.seal}` },
  "deal.advance": { label: "Note the advance", lead: { kind: "deal", station: "advance" }, goes: `opens the deal at ${STATION_WORD.advance}` },
  "deal.bundle": { label: "Keep it", lead: { kind: "panel" }, goes: "done here; the deal shows 済" },
};

/** The action a role's panel offers for a letter kind, or null (the letter is shown, not acted on). */
export function letterAction(role: Role, type: string): LetterAction | null {
  if (role === "supplier") return SUPPLIER[type as MessageType] ?? null;
  return null; // part 2: the buyer's and the fund member's letters
}

/** The path an action leads to, given the deal's ref (for a deal lead), or null for the panel. */
export function leadPath(lead: Lead, ref?: string): { to: string; at?: StationKey } | null {
  if (lead.kind === "panel") return null;
  if (lead.kind === "new-invoice") return { to: "/supplier/invoices/new" };
  if (!ref) return { to: "/supplier/deal" };
  return { to: `/supplier/deal/${ref}`, at: lead.station };
}
