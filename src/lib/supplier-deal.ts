// Supplier deal record and its timeline (HNK-24.T9), kept in the encrypted device store
// (HNK-24.T3) under the invoice's N. Pure data, no wasm: tests run it under Node.
//
// The offer code and the entry request code are interim copy-paste formats until the relay
// message schema (HNK-23.T1, C-04) exists. The entry request is not signed yet: the signed
// message from the financier node comes with HNK-23.T8.

export interface SupplierDeal {
  /** N of the invoice (hex): the store id. */
  n: string;
  invoice_id: string;
  /** Buyer's per-invoice key `invoice_pk(k)` (hex), part of the supplier key derivation. */
  buyer_pk: string;
  supplier_pk: string;
  amount_zat: number;
  due_date: number;
  /** Canonical invoice (base64url). */
  invoice: string;
  /** Creation time (ms since epoch), for the newest-first order. */
  created_at: number;
  /** HNK-23.T7: the sign request went to the buyer's mailbox (its `mailbox_pk`), at this time (ms). */
  sign_request?: { to: string; at: number };
  /** T4: the buyer's signature, checked with `bundleBuild`. */
  buyer_signature?: string;
  /** HNK-26.T6: financiers that declined this invoice, newest last; the offer is cleared so it can go to another. */
  declined?: Array<{ financier_pk: string; reason: string; at: number }>;
  /** T5: the offer sent to one financier. */
  offer?: { financier_pk: string; advance_zat: number; supplier_address: string; sent?: { to: string; at: number } };
  /** T6: the financier's request for the board entry, sent after it checked the board (SEQ-03). */
  entry_request?: EntryRequest;
  /** T6: the signed register entry for that financier's commitment. */
  entry?: { memo: string; commitment: string; tagged: boolean; discount: number; tenor: number; sent?: number };
  /** HNK-26.T16: the letter and its PDF (base64) as the financier's node sent them (`deal.letter`). */
  letter_in?: { letter: string; pdf: string; at: number };
  /** T7: the assignment letter, its PDF check and the supplier's seal s0. */
  seal?: { letter: string; s0: string; sent?: number };
  /** HNK-26.T16: the financier's node said it paid the advance (`deal.advance`), not yet checked. */
  advance_notice?: { txid: string; advance_zat: number; at: number };
  /** T8: what the supplier received. */
  advance?: { txid: string; received_zat: number; matches: boolean };
}

export type StepKey = "signature" | "offer" | "entry" | "seal" | "advance";

export const STEPS: ReadonlyArray<{ key: StepKey; label: string; action: string }> = [
  { key: "signature", label: "Buyer signed", action: "check the buyer's signature" },
  { key: "offer", label: "Offered", action: "offer it to one financier" },
  { key: "entry", label: "Board entry signed", action: "sign the board entry" },
  { key: "seal", label: "Letter sealed", action: "read and seal the letter" },
  { key: "advance", label: "Advance received", action: "check the advance" },
];

/** What to do for `step`, as shown under a deal ("Next: …"). */
export function actionOf(step: StepKey): string {
  return STEPS.find((s) => s.key === step)!.action;
}

/** What to do next for `d`, or `null` when complete. The entry waits for the financier's request. */
export function nextAction(d: SupplierDeal): string | null {
  const step = nextStep(d);
  if (step === "entry" && !d.entry_request) return "wait for the financier's entry request";
  return step ? actionOf(step) : null;
}

function done(d: SupplierDeal, k: StepKey): boolean {
  switch (k) {
    case "signature":
      return d.buyer_signature !== undefined;
    case "offer":
      return d.offer !== undefined;
    case "entry":
      return d.entry !== undefined;
    case "seal":
      return d.seal !== undefined;
    case "advance":
      return d.advance?.matches === true;
  }
}

/** The first step not done yet, or `null` when the deal is complete. */
export function nextStep(d: SupplierDeal): StepKey | null {
  return STEPS.find((s) => !done(d, s.key))?.key ?? null;
}

/** Each step as done, next (the one to do now) or later. */
export function timeline(d: SupplierDeal): Array<{ key: StepKey; label: string; state: "done" | "next" | "later" }> {
  const next = nextStep(d);
  let reached = false;
  return STEPS.map((s) => {
    if (s.key === next) reached = true;
    const state = done(d, s.key) && !reached ? "done" : s.key === next ? "next" : "later";
    return { key: s.key, label: s.label, state };
  });
}

/** Deals newest first. */
export function sortDeals(deals: SupplierDeal[]): SupplierDeal[] {
  return [...deals].sort((a, b) => b.created_at - a.created_at || a.invoice_id.localeCompare(b.invoice_id));
}

/** True when `invoice_id` is already used by one of `deals` (a reused id is refused, P-03). */
export function invoiceIdTaken(deals: SupplierDeal[], invoiceId: string): boolean {
  const id = invoiceId.trim();
  return deals.some((d) => d.invoice_id === id);
}

/** A shielded receiving address for the advance: unified (u1 / utest1) or Sapling (zs / ztestsapling). */
export function looksShielded(address: string): boolean {
  return /^(u1|utest1|zs1|ztestsapling1)[0-9a-z]{20,}$/.test(address.trim());
}

const OFFER_PREFIX = "jitsuin-offer-v1:";

export interface Offer {
  invoice: string;
  buyer_signature: string;
  financier_pk: string;
  advance_zat: number;
  supplier_address: string;
}

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(code: string): string {
  const s = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s.padEnd(Math.ceil(s.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Offer as one copy-paste code (interim until the relay, HNK-23). */
export function encodeOffer(o: Offer): string {
  return OFFER_PREFIX + b64url(JSON.stringify({ v: 1, ...o }));
}

export function decodeOffer(code: string): Offer {
  const c = code.trim();
  if (!c.startsWith(OFFER_PREFIX)) throw new Error("not a JitsuinFi offer code");
  const j = JSON.parse(unb64url(c.slice(OFFER_PREFIX.length))) as Partial<Offer> & { v?: number };
  if (j.v !== 1 || !j.invoice || !j.buyer_signature || !j.financier_pk || !j.supplier_address || !(Number(j.advance_zat) > 0)) {
    throw new Error("incomplete offer code");
  }
  return {
    invoice: j.invoice,
    buyer_signature: j.buyer_signature,
    financier_pk: j.financier_pk,
    advance_zat: Number(j.advance_zat),
    supplier_address: j.supplier_address,
  };
}

const ENTRY_REQUEST_PREFIX = "jitsuin-entry-request-v1:";
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * The financier asks for the board entry once the board shows no entry for N (SEQ-03 part 4).
 * It carries the commitment opening (salt), the classes and the buyer history tag, if any.
 */
export interface EntryRequest {
  n: string;
  financier_pk: string;
  salt: string;
  /** Discount and tenor classes (0 – 7), both or neither. */
  discount?: number;
  tenor?: number;
  history_tag?: string;
}

function isClass(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 7;
}

/** Entry request as one copy-paste code (interim until the signed relay message, HNK-23.T8). */
export function encodeEntryRequest(r: EntryRequest): string {
  return ENTRY_REQUEST_PREFIX + b64url(JSON.stringify({ v: 1, ...r }));
}

export function decodeEntryRequest(code: string): EntryRequest {
  const c = code.trim();
  if (!c.startsWith(ENTRY_REQUEST_PREFIX)) throw new Error("not a JitsuinFi entry request code");
  const j = JSON.parse(unb64url(c.slice(ENTRY_REQUEST_PREFIX.length))) as Partial<EntryRequest> & { v?: number };
  const hex = (x: unknown): x is string => typeof x === "string" && HEX64.test(x);
  if (j.v !== 1 || !hex(j.n) || !hex(j.financier_pk) || !hex(j.salt)) throw new Error("incomplete entry request code");
  if ((j.discount === undefined) !== (j.tenor === undefined)) throw new Error("entry request: both classes, or neither");
  if (j.discount !== undefined && !(isClass(j.discount) && isClass(j.tenor))) throw new Error("entry request: classes from 0 to 7");
  if (j.history_tag !== undefined && !hex(j.history_tag)) throw new Error("entry request: bad history tag");
  const r: EntryRequest = { n: j.n, financier_pk: j.financier_pk, salt: j.salt };
  if (j.discount !== undefined) {
    r.discount = j.discount;
    r.tenor = j.tenor;
  }
  if (j.history_tag !== undefined) r.history_tag = j.history_tag;
  return r;
}

/** Why `r` does not belong to `d`: another invoice, or not the financier `d` was offered to. */
export function entryRequestProblems(d: SupplierDeal, r: EntryRequest): string[] {
  return [
    r.n === d.n ? null : "the request is for another invoice (N differs)",
    d.offer && r.financier_pk === d.offer.financier_pk ? null : "the request comes from another financier than the one you offered to",
  ].filter((p): p is string => p !== null);
}
