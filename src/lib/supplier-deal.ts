// Supplier deal record and its timeline (HNK-24.T9), kept in the encrypted device store
// (HNK-24.T3) under the invoice's N. Pure data, no wasm: tests run it under Node.
//
// The offer code and the entry request code are interim copy-paste formats until the relay
// message schema (HNK-23.T1, C-04) exists. The entry request is not signed yet: the signed
// message from the financier node comes with HNK-23.T8.
import { NETWORK, shieldedPrefixes, type Network } from "./network.ts";

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
  /** IA port: the deal's address in the app (deal-ref.ts), made on this device; never N or the number. */
  ref?: string;
  /**
   * IA port (user feedback 2026-10-26 B): the buyer's mailbox, known when the buyer's key came
   * through the relay (the key's letter names its sender's mailbox and is signed by that key) or
   * when the supplier picked the buyer from contacts. "Send to the buyer" uses it: no card to paste.
   */
  buyer_mailbox?: string;
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
  letter_in?: { letter: string; pdf: string; at: number; /** Finding F10: the PDF stayed on another device (pdf empty). */ pdf_away?: { sha256: string; bytes: number } };
  /** T7: the assignment letter, its PDF check and the supplier's seal s0. */
  seal?: { letter: string; s0: string; sent?: number };
  /** HNK-26.T18: the verification bundle the financier sent once the repayment settled. */
  bundle?: string;
  /** HNK-26.T16: the financier's node said it paid the advance (`deal.advance`), not yet checked. */
  advance_notice?: { txid: string; advance_zat: number; at: number };
  /** T8: what the supplier received. */
  advance?: { txid: string; received_zat: number; matches: boolean };
}

export type StepKey = "signature" | "offer" | "entry" | "seal" | "advance";

export const STEPS: ReadonlyArray<{ key: StepKey; label: string; action: string }> = [
  { key: "signature", label: "Buyer signed", action: "check the buyer's signature" },
  { key: "offer", label: "Offered", action: "offer it to one financier" },
  { key: "entry", label: "Public record signed", action: "sign the public record" },
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

// ---------- the deal route on the supplier's desk (HNK-34.T5) ----------
// Six stations: the five steps, then 済, the settlement. A step to do now either is the
// supplier's move ("next") or waits on someone else ("wait": the buyer's signature after the
// sign request went out, the financier's entry request, the advance). 済 is done once the
// financier's settlement bundle is here or the board shows the deal settled; until then it waits
// after the advance, and is later before that.

export type StationKey = StepKey | "settled";
/** The stations in order; the deal route's ?at= is one of them. */
export const STATION_KEYS: readonly StationKey[] = ["signature", "offer", "entry", "seal", "advance", "settled"];
export const isStation = (x: unknown): x is StationKey => STATION_KEYS.includes(x as StationKey);
export type StationState = "done" | "next" | "wait" | "later";

/** What the supplier does next, and whether it waits on someone else; `null` when complete. */
export function nextMove(d: SupplierDeal): { text: string; wait: boolean } | null {
  const step = nextStep(d);
  if (step === "signature" && d.sign_request) return { text: "wait for the buyer to sign in their inbox", wait: true };
  if (step === "signature") return { text: "send it to the buyer to sign", wait: false };
  if (step === "entry" && !d.entry_request) return { text: "wait for the financier's entry request", wait: true };
  if (step === "advance" && !d.advance_notice && !d.advance) return { text: "wait for the advance, then check it", wait: true };
  return step ? { text: actionOf(step), wait: false } : null;
}

/** The six stations of `d`; `settled`: the bundle is here or the board shows the deal settled. */
export function route(d: SupplierDeal, settled: boolean): Array<{ key: StationKey; label: string; state: StationState }> {
  const wait = nextMove(d)?.wait ?? false;
  const steps: Array<{ key: StationKey; label: string; state: StationState }> = timeline(d).map((s) => ({ ...s, state: s.state === "next" && wait ? "wait" : s.state }));
  steps.push({ key: "settled", label: "Settled", state: settled ? "done" : nextStep(d) === null ? "wait" : "later" });
  return steps;
}

/**
 * Where a deal stands once the supplier has nothing left to do (HNK-34 E2E, finding 2): the
 * advance is in and the buyer pays the financier at maturity ("repayment"), or the deal is
 * settled. `null` while one of the five steps is still open. "Complete" is said only when settled.
 */
export function standing(d: SupplierDeal, settled: boolean): "repayment" | "settled" | null {
  if (settled) return "settled";
  return nextStep(d) === null ? "repayment" : null;
}

/**
 * The deal's place in a long ledger (long-list.ts): "move" when the supplier acts next, "wait"
 * while someone else does (the buyer's signature, the financier, the repayment), "done" once settled.
 */
export function dealStage(d: SupplierDeal, settled: boolean): "move" | "wait" | "done" {
  if (settled) return "done";
  const m = nextMove(d);
  return m && !m.wait ? "move" : "wait";
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

/** The invoice number rule of jitsuin-core (`Invoice::validate`): 1 – 32 bytes, each printable ASCII without the space (0x21 – 0x7e). */
const INVOICE_ID = /^[\x21-\x7e]{1,32}$/;

/**
 * Why the number written in No. on the blank 請求書 cannot be used, as a sentence that says where
 * and what (user feedback 2026-10-26: a bare "invoice number: 1–32 characters" did not say where);
 * null when it is a good number for a new invoice on this device.
 */
export function invoiceNumberProblem(deals: SupplierDeal[], written: string): string | null {
  const id = written.trim();
  if (!id) return "Write the invoice number in No. on the sheet (1–32 characters).";
  if (id.length > 32) return `The invoice number in No. on the sheet has ${id.length} characters: shorten it to 32 or fewer.`;
  if (!INVOICE_ID.test(id)) return "The invoice number in No. on the sheet takes plain letters, digits and signs such as - / _ only: no spaces or accented letters.";
  if (invoiceIdTaken(deals, id)) return `Invoice number ${id} is already used on this device: write another one in No. on the sheet.`;
  return null;
}

/** A number to prefill No. on the blank sheet: TES-INV-<yyyymmdd>-<n>, the first n not yet used on this device. */
export function suggestInvoiceNumber(deals: SupplierDeal[], day: Date): string {
  const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
  for (let n = 1; ; n++) {
    const id = `TES-INV-${ymd}-${n}`;
    if (!invoiceIdTaken(deals, id)) return id;
  }
}

/** A shielded receiving address for the advance on this build's network (HNK-26.T19): unified or Sapling. */
export function looksShielded(address: string, net: Network = NETWORK): boolean {
  const a = address.trim();
  return /^[0-9a-z]+$/.test(a) && shieldedPrefixes(net).some((p) => a.startsWith(p) && a.length >= p.length + 20);
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

/**
 * HNK-34 E2E: the outcome of the action the supplier just took, kept on the desk until they move
 * on. `n` is the deal it belongs to, or "" for the blank sheet (Write an invoice). `inbox`: it was
 * taken in the mailbox, away from the desk's work, so the desk brings it into view once.
 */
export interface Outcome {
  n: string;
  glyph: string;
  title: string;
  text: string;
  /** The action came back refused by someone else (a declined offer). */
  warn?: boolean;
  inbox?: boolean;
}

/**
 * Judge run 2026-10-26: what the desk showing deal `open` (null: the blank sheet) draws of `o`, and
 * whether it scrolls it into view. An outcome for another deal draws nothing.
 */
export function outcomeOn(o: Outcome | null, open: string | null): { outcome: Outcome; reveal: boolean } | null {
  if (!o || o.n !== (open ?? "")) return null;
  return { outcome: o, reveal: o.inbox === true };
}

/**
 * A station's label under the route by its state (IA port part 2, 2026-10-26, from part 1's phone
 * screenshots): the past tense only once done; the next station is named as the move ("Offer
 * next"), a waiting one by what it waits for, a later one as a plain noun, so the label under the
 * next station never reads as done.
 */
const STATION_LABEL: Record<StationState, Record<StationKey, string>> = {
  done: { signature: "Buyer signed", offer: "Offered", entry: "Public record signed", seal: "Letter sealed", advance: "Advance received", settled: "Settled" },
  next: { signature: "Check signature", offer: "Offer next", entry: "Sign entry next", seal: "Seal next", advance: "Check advance", settled: "Settle" },
  wait: { signature: "Buyer signs", offer: "Offer waits", entry: "Entry request waits", seal: "Letter waits", advance: "Advance waits", settled: "Repayment waits" },
  later: { signature: "Buyer's signature", offer: "Offer", entry: "Public record", seal: "Letter seal", advance: "Advance", settled: "Settlement" },
};
export function stationLabel(k: StationKey, state: StationState): string {
  return STATION_LABEL[state][k];
}

// ---------- the advance at 金 (judge run 2, finding 6) ----------
// The financier's advance notice (its letter, kept from the inbox) names the amount and the
// transaction; the supplier is asked only to confirm that the wallet received it. A different
// amount is still recorded as it is ("Advance differs").

export interface AdvancePrefill {
  /** What the notice says was paid, and in which transaction. */
  zat: number;
  txid: string;
  at: number;
  /** The advance the offer asked for. */
  agreedZat: number;
  /** The notice names the amount that was asked for. */
  asAgreed: boolean;
}

/** The amount and transaction to confirm, from the financier's notice; null without a notice. */
export function advancePrefill(d: Pick<SupplierDeal, "advance_notice" | "offer">): AdvancePrefill | null {
  const n = d.advance_notice;
  if (!n || !d.offer) return null;
  return { zat: n.advance_zat, txid: n.txid, at: n.at, agreedZat: d.offer.advance_zat, asAgreed: n.advance_zat === d.offer.advance_zat };
}

/** What is recorded when the wallet received `receivedZat` in `txid`, against the offer. */
export function advanceRecord(d: Pick<SupplierDeal, "offer">, receivedZat: number, txid: string): NonNullable<SupplierDeal["advance"]> {
  if (!d.offer) throw new Error("no offer on this deal");
  if (!Number.isSafeInteger(receivedZat) || receivedZat <= 0) throw new Error("write the amount your wallet received, in ZEC (more than 0)");
  return { txid, received_zat: receivedZat, matches: receivedZat === d.offer.advance_zat };
}

// ---------- the advance asked, prefilled (mobile E2E 2026-10-27, finding 7; DS-MOB F3) ----------

/** The share of the invoice a supplier asks by default when the financier names none. */
export const DEFAULT_ADVANCE_RATIO = 0.9;

/**
 * What the phone's bottom bar offers on the offer form (mobile E2E 3): with no address saved on
 * this device and none typed yet, scanning the wallet's QR comes first; once an address is in
 * (or one is saved for a tap), the bar sends the offer.
 */
export function offerBar(saved: string | null, typed: string): "scan" | "send" {
  return !saved && !typed.trim() ? "scan" : "send";
}

/**
 * The advance to prefill on the offer form: the financier's typical ratio from its directory
 * listing when it gives one, else DEFAULT_ADVANCE_RATIO; never above the invoice nor the
 * mandate's maximum. The supplier can change it.
 */
export function advanceSuggestion(amountZat: number, mandate?: { max_zat?: number; advance_ratio?: number }): number {
  const ratio = mandate?.advance_ratio && mandate.advance_ratio > 0 && mandate.advance_ratio <= 1 ? mandate.advance_ratio : DEFAULT_ADVANCE_RATIO;
  let zat = Math.floor(amountZat * ratio);
  if (mandate?.max_zat && mandate.max_zat > 0) zat = Math.min(zat, mandate.max_zat);
  return Math.max(0, Math.min(zat, amountZat));
}

/** The due presets on Write (DS-MOB F3): days after the issue date. */
export const DUE_PRESETS = [30, 60, 90] as const;

/** The ISO date `days` after the ISO date `issued` (UTC days, as the sheet's dates are). */
export function dueIn(issued: string, days: number): string {
  const t = Date.parse(`${issued}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error("write the issue date first");
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}
