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
  if (rec.signature) return "signed";
  return rec.terms_checked ? "checked, not signed" : "terms PDF not checked";
}
