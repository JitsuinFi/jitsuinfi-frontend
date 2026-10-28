// The inbox panel's letters (IA port, approved prototype 2026-10-26): what each kind of letter is
// called in plain words, its envelope's kanji, the action it carries and where that action leads.
// Acting on a letter that needs a page (a deal's station, the blank invoice) stamps 済 on the
// envelope, closes the panel and opens that page with the outcome on it ("Done · from your
// inbox"); a small action that needs no page (keep a settlement bundle) completes in the panel.
// Part 2: the buyer's letters lead to the open invoice, its slip under Pay or History; the fund
// member's to Units. A kind can read differently per role (the buyer's "Letter to seal").
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
  "deal.commitment_opening": "The financier asks you to register the invoice",
  "deal.entry_request": "The financier asks you to register the invoice",
  "deal.letter": "Financing letter to read and seal",
  "deal.seal": "A seal on the financing letter",
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

/** What the same kind is called in the buyer's and the fund member's inbox. */
const ROLE_LABEL: Partial<Record<Role, Partial<Record<MessageType, string>>>> = {
  buyer: {
    "invoice.sign_request": "Invoice to sign",
    "deal.letter": "Letter to seal",
    "deal.seal": "Seal on the letter",
    "deal.reminder": "Due-date reminder",
    "history.request": "History request",
    "deal.bundle": "Repaid and settled",
  },
  member: {
    "fund.receipt": "Deposit receipt",
    "fund.merkle_path": "Path for your units",
    "fund.payout": "Payout",
  },
};

/**
 * A letter's name: its plain label (for `role`, when given), or "A letter" for a kind this app
 * does not name. A fund path names its period: "Path for period 3".
 */
export function letterLabel(type: string, role?: Role | null, body?: Record<string, unknown>): string {
  if (role === "member" && type === "fund.merkle_path" && typeof body?.period === "number") return `Path for period ${body.period}`;
  return (role ? ROLE_LABEL[role]?.[type as MessageType] : undefined) ?? LETTER_LABEL[type as MessageType] ?? "A letter";
}

export function letterGlyph(type: string): string {
  return LETTER_GLYPH[type as MessageType] ?? "信";
}

/**
 * Where an action leads: a page (a deal at one of its stations, the blank invoice; the buyer's open
 * invoice, its slip, History; the member's Units), or nowhere (it completes in the panel).
 */
export type Lead =
  | { kind: "deal"; station: StationKey }
  | { kind: "new-invoice" }
  | { kind: "invoice" }
  | { kind: "slip" }
  | { kind: "history" }
  | { kind: "units" }
  | { kind: "panel" };

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
  "deal.commitment_opening": { label: "Use this request", lead: { kind: "deal", station: "entry" }, goes: `opens the deal at ${STATION_WORD.entry}` },
  "deal.letter": { label: "Keep the letter", lead: { kind: "deal", station: "seal" }, goes: `opens the deal at ${STATION_WORD.seal}` },
  "deal.advance": { label: "Note the advance", lead: { kind: "deal", station: "advance" }, goes: `opens the deal at ${STATION_WORD.advance}` },
  // mobile E2E 2, finding 7: the deal opens at 済, where "Check it on Verify" is on screen 1
  "deal.bundle": { label: "Keep it", lead: { kind: "deal", station: "settled" }, goes: `opens the deal at ${STATION_WORD.settled}` },
};

const BUYER: Partial<Record<MessageType, LetterAction>> = {
  "invoice.sign_request": { label: "Open the invoice", lead: { kind: "invoice" }, goes: "lays it on Invoices" },
  "deal.letter": { label: "Keep the letter", lead: { kind: "invoice" }, goes: "opens it on Invoices" },
  // the supplier's seal opens the letter to seal; the financier's opens the slip (the handler says which)
  "deal.seal": { label: "Keep the seal", lead: { kind: "invoice" }, goes: "opens the letter, or its slip on Pay" },
  "history.request": { label: "Send my history", lead: { kind: "history" }, goes: "updates History" },
  "deal.reminder": { label: "Open the slip", lead: { kind: "slip" }, goes: "opens its slip on Pay" },
  "deal.bundle": { label: "Keep it", lead: { kind: "panel" }, goes: "done here; the slip shows 済" },
};

const MEMBER: Partial<Record<MessageType, LetterAction>> = {
  "fund.receipt": { label: "Keep it", lead: { kind: "units" }, goes: "adds a slip on Units" },
  "fund.merkle_path": { label: "Keep it", lead: { kind: "units" }, goes: "checks the slip on Units" },
  "fund.payout": { label: "Keep it", lead: { kind: "units" }, goes: "records it on Units" },
};

const ACTIONS: Record<Role, Partial<Record<MessageType, LetterAction>>> = { supplier: SUPPLIER, buyer: BUYER, member: MEMBER };

/** The action a role's panel offers for a letter kind, or null (the letter is shown, not acted on). */
export function letterAction(role: Role, type: string): LetterAction | null {
  return ACTIONS[role][type as MessageType] ?? null;
}

/**
 * The path an action leads to, given the record's ref (a deal, or a buyer's invoice), or null for
 * the panel. Without a ref a deal lead opens the Deal tab, an invoice or slip lead its section.
 */
export function leadPath(lead: Lead, ref?: string): { to: string; at?: StationKey } | null {
  switch (lead.kind) {
    case "panel":
      return null;
    case "new-invoice":
      return { to: "/supplier/invoices/new" };
    case "invoice":
      return { to: ref ? `/buyer/invoices/${ref}` : "/buyer/invoices" };
    case "slip":
      return { to: ref ? `/buyer/pay/${ref}` : "/buyer/pay" };
    case "history":
      return { to: "/buyer/history" };
    case "units":
      return { to: "/member/units" };
    case "deal":
      return ref ? { to: `/supplier/deal/${ref}`, at: lead.station } : { to: "/supplier/deal" };
  }
}

// ---------- letters waiting on a ledger (user test 2026-10-27) ----------
// An invoice waiting in the inbox was found only behind the bell. The role's ledger (the buyer's
// Invoices, the supplier's Invoices, the fund member's Units) now lists the letters whose action
// leads into that section as rows at its top, running the same action as the panel.

/** The kinds of lead each role's ledger shows as "Waiting for you" rows. */
const LEDGER_LEADS: Record<Role, ReadonlyArray<Lead["kind"]>> = {
  buyer: ["invoice"],
  supplier: ["deal", "new-invoice"],
  member: ["units"],
};

/** Whether a letter of `type` shows as a waiting row on `role`'s ledger. */
export function onLedger(role: Role, type: string): boolean {
  const a = letterAction(role, type);
  return !!a && LEDGER_LEADS[role].includes(a.lead.kind);
}
