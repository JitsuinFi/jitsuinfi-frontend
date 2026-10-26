// Invoices the buyer received (HNK-25.T1, BL-D22-07, BL-D1-02): kept in the buyer's encrypted
// device store (the same store as the history, HISTORY_ID) under "invoice:" + N, so they are still
// there after the tab is closed. Pure data, no wasm: tests run it under Node.

export interface BuyerInvoice {
  /** N of the invoice (hex). */
  n: string;
  invoice_id: string;
  amount_zat: number;
  due_date: number;
  /** Canonical invoice (base64url), as the supplier sent it. */
  invoice: string;
  /** Index k of the buyer key the invoice is addressed to. */
  key_index: number;
  /** The terms PDF matched the invoice's document hash when it was checked. */
  terms_checked: boolean;
  /** When the buyer first checked it (ms since epoch), for the newest-first order. */
  received_at: number;
  /** The buyer's signature on the invoice, once signed. */
  signature?: string;
  /** HNK-23.T7: the supplier's mailbox the invoice came from, for the reply. */
  reply_to?: string;
  /** When the signature went back to the supplier (ms since epoch). */
  signature_sent_at?: number;
  /**
   * HNK-26.T16: the assignment letter as the financier's node sent it (`deal.letter`, PDF in
   * base64), the supplier's seal (`deal.seal` index 0), and when the buyer sent its own seal.
   */
  assignment?: {
    letter?: string;
    pdf?: string;
    financier_pk?: string;
    financier_mailbox?: string;
    supplier_seal?: string;
    supplier_mailbox?: string;
    /** The buyer's own seal s1, and the financier's s2 that completes the letter (HNK-25.T4). */
    buyer_seal?: string;
    financier_seal?: string;
    sealed_at?: number;
  };
  /** HNK-26.T18: the verification bundle the financier sent once the repayment settled. */
  bundle?: string;
  /** HNK-26.T8: the history certificate issued for this invoice (its index) and to which financier. */
  history_cert?: { index: number; financier_pk: string };
  /**
   * IA port 2026-10-26: the invoice's address in the app (/buyer/invoices/<ref>, /buyer/pay/<ref>),
   * a random id made on this device (lib/deal-ref.ts), never the number or N.
   */
  ref?: string;
  /** IA port: the terms PDF that came with the sign request (base64), kept so the check needs no file. */
  terms_pdf?: { name: string; b64: string };
}

const PREFIX = "invoice:";

export function storeId(n: string): string {
  return PREFIX + n;
}

export function isInvoiceId(id: string): boolean {
  return id.startsWith(PREFIX);
}

/** A record for a checked invoice; an existing record keeps its first time and its signature. */
export function invoiceRecord(
  decoded: { nullifier: string; invoice_id: string; amount_zat: number; due_date: number },
  invoice: string,
  keyIndex: number,
  termsChecked: boolean,
  now: number,
  previous?: BuyerInvoice,
): BuyerInvoice {
  if (previous && previous.invoice !== invoice) throw new Error("another invoice is stored under this N");
  return {
    n: decoded.nullifier,
    invoice_id: decoded.invoice_id,
    amount_zat: decoded.amount_zat,
    due_date: decoded.due_date,
    invoice,
    key_index: keyIndex,
    terms_checked: termsChecked || (previous?.terms_checked ?? false),
    received_at: previous?.received_at ?? now,
    ...(previous?.signature ? { signature: previous.signature } : {}),
    ...(previous?.reply_to ? { reply_to: previous.reply_to } : {}),
    ...(previous?.signature_sent_at ? { signature_sent_at: previous.signature_sent_at } : {}),
    ...(previous?.assignment ? { assignment: previous.assignment } : {}),
    ...(previous?.bundle ? { bundle: previous.bundle } : {}),
    ...(previous?.history_cert ? { history_cert: previous.history_cert } : {}),
    ...(previous?.ref ? { ref: previous.ref } : {}),
    ...(previous?.terms_pdf ? { terms_pdf: previous.terms_pdf } : {}),
  };
}

export function withSignature(rec: BuyerInvoice, signature: string): BuyerInvoice {
  return { ...rec, signature };
}

/** Newest first. */
export function sortInvoices(list: BuyerInvoice[]): BuyerInvoice[] {
  return [...list].sort((a, b) => b.received_at - a.received_at);
}

export function invoiceStatus(rec: BuyerInvoice): string {
  if (rec.signature_sent_at) return "signed, sent to the supplier";
  if (rec.signature) return "signed";
  return rec.terms_checked ? "checked, not signed" : "terms PDF not checked";
}

/** HNK-25.T5 (BL-D25-02): financed invoices (letter sealed by all three) not settled yet, due within `days` (or past due), soonest first. */
export function dueSoon(list: BuyerInvoice[], today: number, days = 7): Array<{ rec: BuyerInvoice; days_left: number }> {
  return list
    .filter((r) => r.assignment?.financier_seal && !r.bundle && r.due_date - today <= days)
    .map((rec) => ({ rec, days_left: rec.due_date - today }))
    .sort((a, b) => a.days_left - b.days_left);
}

/** What the board says, in words, from `bundleOnBoard` (HNK-25.T7, BL-D25-09). */
export function boardStatus(b: { register: { status: string }; settled: { on_time: boolean } | null }): string {
  if (b.settled) return b.settled.on_time ? "settled on time" : "settled late";
  switch (b.register.status) {
    case "Registered":
      return "financed, registered on the board";
    case "DoubleFinanced":
      return "registered for more than one financier";
    default:
      return "not on the board yet";
  }
}

/** What this invoice waits for next, from the buyer's side (HNK-34.T5): the ledger tag and the open sheet. */
export type BuyerAction = "sign" | "send" | "wait-letter" | "seal" | "wait-financier" | "pay" | "settled";

export function nextAction(rec: BuyerInvoice): BuyerAction {
  const a = rec.assignment;
  if (rec.bundle) return "settled";
  if (a?.financier_seal) return "pay";
  if (a?.buyer_seal) return "wait-financier";
  if (a?.letter && a.supplier_seal) return "seal";
  if (!rec.signature) return "sign";
  if (!rec.signature_sent_at && rec.reply_to) return "send";
  return "wait-letter";
}

/**
 * The invoice's place in a long list (long-list.ts, IA port): "move" when the buyer acts next
 * (sign, send, seal, pay), "wait" while the supplier or the financier does, "done" once settled.
 */
export function buyerStage(rec: BuyerInvoice): "move" | "wait" | "done" {
  const a = nextAction(rec);
  if (a === "settled") return "done";
  return a === "wait-letter" || a === "wait-financier" ? "wait" : "move";
}

/** A 払込票 payment slip exists for the invoice: all three seals hold on this device, or it is settled. */
export function hasSlip(rec: BuyerInvoice): boolean {
  return !!rec.assignment?.financier_seal || !!rec.bundle;
}

/** The slips in Pay's order: the ones to pay, soonest due first, then the paid ones, newest due first. */
export function slipOrder(list: BuyerInvoice[]): BuyerInvoice[] {
  const open = list.filter((r) => hasSlip(r) && !r.bundle).sort((a, b) => a.due_date - b.due_date);
  const paid = list.filter((r) => !!r.bundle).sort((a, b) => b.due_date - a.due_date);
  return [...open, ...paid];
}

/** How many of the letter's three seals (supplier, buyer, financier) this device holds. */
export function sealCount(rec: BuyerInvoice): number {
  const a = rec.assignment;
  return [a?.supplier_seal, a?.buyer_seal, a?.financier_seal].filter(Boolean).length;
}

/** The route stations 受 署 送 印 払 this device can vouch for: checked, signed, sent, sealed, settled. */
export function routeDone(rec: BuyerInvoice): [boolean, boolean, boolean, boolean, boolean] {
  return [rec.terms_checked, !!rec.signature, !!rec.signature_sent_at, !!rec.assignment?.buyer_seal, !!rec.bundle];
}

export interface BuyerTotals {
  /** Invoices waiting for the buyer's signature, its sending, or the buyer's seal. */
  toAct: number;
  /** Financed invoices (all three seals) not settled yet, and what they add up to. */
  toPay: { count: number; zat: number };
  /** Financed invoices that fell due or settled. */
  due: number;
  /** Of those, settled on time on the board; null without board data. */
  onTime: number | null;
}

/** The buyer's big numbers, from this device's invoices and, when read, their board status. */
export function buyerTotals(list: BuyerInvoice[], board: Record<string, string | null> | null, today: number): BuyerTotals {
  const acts = list.map(nextAction);
  const pay = list.filter((_, i) => acts[i] === "pay");
  const financed = list.filter((r) => r.assignment?.financier_seal);
  return {
    toAct: acts.filter((a) => a === "sign" || a === "send" || a === "seal").length,
    toPay: { count: pay.length, zat: pay.reduce((n, r) => n + r.amount_zat, 0) },
    due: financed.filter((r) => r.bundle || r.due_date <= today).length,
    onTime: board ? financed.filter((r) => board[r.n] === "settled on time").length : null,
  };
}
