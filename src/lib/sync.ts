// Device sync of a role's working records (messy-state E2E 2026-10-27, finding F10): the same
// account on a second device (the same passkey, synced by iCloud or Google) sees the invoices,
// deals, keys handed out and contacts the first device holds, and can carry a deal on.
//
// Where it lives: the relay's one state per mailbox (`PUT/GET /api/mailbox/:id/state`, written and
// read by the owner only, at most 64 KiB + 48 sealed). The role's whole record set goes there as
// one blob; nothing else is added to the relay (no new endpoint).
//
// Format "JSY2" (version 2 of the state; version 1 was the buyer's history copy `{v:1, certs}`, still
// read: lib/buyer-history.ts `decodeBackup`):
//
//   sealed box (wasm mailboxSeal to the owner's own mailbox key)
//     └ "JSY2" | iv (12) | AES-256-GCM( gzip( JSON SyncState ) ), AAD "jitsuinfi-sync-v2:<role>"
//
//   SyncState = { v: 2, role, written_at, records: [{ id, at, doc }], held_back, slimmed }
//
// The inner key is HMAC-SHA-256(inbox PRF output, "jitsuin/<role>/sync/v1"): only a device that
// holds the passkey has it. The outer seal alone would not do: the mailbox key is public (it is on
// every contact card), so anyone, the relay included, could seal a state to it. With the inner AEAD
// the relay sees ciphertext, its size and when it changes; it cannot read, forge or edit a record.
// It can still hand back an older state of the owner's (a rollback): the merge below never lets an
// older record replace a newer one, so a rollback can hide a record from a new device but never
// erase or undo one on a device that has it.
//
// Each record carries `at`, the time of its last write on the device that wrote it (lib/store.ts,
// monotonic there). Merge: per record, the later `at` wins (ties: the larger canonical JSON, so
// every device picks the same), then a rule per kind puts back what may never be lost: a buyer's
// signature, the three seals, the letter and its PDF, the settlement bundle, a supplier's offer,
// entry and seal, the keys handed out, the units' withdraw tokens. A deletion is a tombstone with
// its own `at`. A record missing from the state is unknown, not deleted.
//
// Size: JSON is gzipped (CompressionStream). If it is still too large, the PDF bytes go first
// (their name, SHA-256 and size stay, and the record says the PDF is on another device), then the
// oldest finished records (settled deals and invoices), then the oldest of the rest; the count
// stays in `held_back`. A held-back record is still on the device that has it, and still synced
// once room is made. The buyer's history and the keys handed out are never held back.
//
// Pure, WebCrypto and CompressionStream only: tests run it under Node (`npm test`).
import { decodeBackup } from "./buyer-history.ts";
import type { Entry, Role } from "./store.ts";

export const SYNC_VERSION = 2;
const MAGIC = "JSY2";
/** What the relay keeps: 64 KiB + 48 sealed, so 64 KiB inside the seal. */
export const STATE_LIMIT = 65536;
/** Room for the magic, IV and GCM tag, with a margin. */
export const SYNC_BUDGET = STATE_LIMIT - 4 - 12 - 16 - 64;

/** Records that stay on this device: device-sync bookkeeping and drafts. */
export const localOnly = (id: string): boolean => id.startsWith("sync:") || id.startsWith("draft:");
/**
 * Records the sync carries but never writes into this device's store: the buyer's history chain
 * is restored on the key screen once the board was read to check it (NextKey.tsx), as before.
 */
export const remoteOnly = (id: string): boolean => id === HISTORY;
const HISTORY = "history";
/** The buyer's invoice keys handed out (NextKey.tsx): k, to whom, when. Merged as a set. */
export const KEYS_GIVEN = "keys:given";

export interface SyncState {
  v: 2;
  role: Role;
  /** When the device that wrote this state wrote it (ms). */
  written_at: number;
  records: Entry[];
  /** Records left out for room (they stay on the device that has them). */
  held_back: number;
  /** Records whose PDF bytes were left out for room. */
  slimmed: number;
}

/** A PDF left out of the state: its name (if any), SHA-256 and size, so the page can name it. */
export interface Away {
  sha256: string;
  bytes: number;
}

// ---------- canonical JSON ----------
/** JSON with sorted keys, so two devices compare and pick records the same way. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(x) ?? "null";
}

// ---------- merge ----------
type Doc = Record<string, unknown>;
const isObj = (x: unknown): x is Doc => !!x && typeof x === "object" && !Array.isArray(x);
const HEX64 = /^[0-9a-f]{64}$/i;

/** Which merge rule a record id takes. */
export function kindOf(id: string): "invoice" | "deal" | "contact" | "keys" | "wallet" | "plain" {
  if (id.startsWith("invoice:")) return "invoice";
  if (HEX64.test(id)) return "deal";
  if (id.startsWith("contact:")) return "contact";
  if (id === KEYS_GIVEN) return "keys";
  if (id === "fund:wallet") return "wallet";
  return "plain";
}

/** `w`'s fields, with each of `fields` taken from `l` where `w` has none. */
function fill(w: Doc, l: Doc, fields: readonly string[]): Doc {
  const out = { ...w };
  for (const f of fields) if (out[f] === undefined && l[f] !== undefined) out[f] = l[f];
  return out;
}

/** A PDF field pair: bytes win over a note that they are on another device. */
function pdfBytes(out: Doc, l: Doc, bytes: string, away: string): void {
  if (!out[bytes] && l[bytes]) {
    out[bytes] = l[bytes];
    delete out[away];
  }
}

const union = <T>(a: T[] | undefined, b: T[] | undefined, key: (x: T) => string): T[] | undefined => {
  if (!a && !b) return undefined;
  const seen = new Map<string, T>();
  for (const x of [...(a ?? []), ...(b ?? [])]) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
};

const smaller = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? (a < b ? a : b) : (a ?? b));

/** The buyer's invoice: the newer record, with every signature, seal, letter and bundle either side has. */
function mergeInvoice(w: Doc, l: Doc): Doc {
  if (w.invoice !== l.invoice) return w; // another invoice under one N cannot happen; the newer stands
  const out = fill(w, l, ["signature", "signature_sent_at", "reply_to", "bundle", "history_cert", "terms_pdf"]);
  if (isObj(out.terms_pdf) && isObj(l.terms_pdf)) {
    const t = { ...out.terms_pdf };
    pdfBytes(t, l.terms_pdf, "b64", "away");
    out.terms_pdf = t;
  }
  if (isObj(w.assignment) || isObj(l.assignment)) {
    const wa = isObj(w.assignment) ? w.assignment : {};
    const la = isObj(l.assignment) ? l.assignment : {};
    // the seals go with the letter they seal: a different letter keeps the winner's alone
    const a = !wa.letter || !la.letter || wa.letter === la.letter ? fill(wa, la, ["letter", "pdf", "pdf_away", "financier_pk", "financier_mailbox", "supplier_seal", "supplier_mailbox", "buyer_seal", "financier_seal", "sealed_at"]) : { ...wa };
    if (a.letter === la.letter) pdfBytes(a, la, "pdf", "pdf_away");
    out.assignment = a;
  }
  out.terms_checked = !!w.terms_checked || !!l.terms_checked;
  if (typeof w.received_at === "number" && typeof l.received_at === "number") out.received_at = Math.min(w.received_at, l.received_at);
  const seen = union(w.reminders_seen as string[] | undefined, l.reminders_seen as string[] | undefined, String);
  if (seen) out.reminders_seen = seen.sort();
  out.ref = smaller(w.ref, l.ref);
  return out;
}

/** The supplier's deal: the newer record, with every step either side reached. */
function mergeDeal(w: Doc, l: Doc): Doc {
  if (w.invoice !== l.invoice) return w;
  const out = fill(w, l, ["buyer_mailbox", "sign_request", "buyer_signature", "entry_request", "entry", "letter_in", "seal", "bundle", "advance_notice", "advance"]);
  const declined = union(w.declined as Doc[] | undefined, l.declined as Doc[] | undefined, (d) => `${d.financier_pk}:${d.at}`);
  if (declined) out.declined = declined.sort((a, b) => Number(a.at) - Number(b.at));
  // an offer comes back only if that financier has not declined since it was sent (a decline clears it)
  if (!out.offer && isObj(l.offer)) {
    const lo = l.offer;
    const sentAt = isObj(lo.sent) ? Number(lo.sent.at) : 0;
    if (!(declined ?? []).some((d) => d.financier_pk === lo.financier_pk && Number(d.at) >= sentAt)) out.offer = lo;
  }
  if (isObj(out.offer) && isObj(l.offer) && out.offer.financier_pk === l.offer.financier_pk) out.offer = fill(out.offer, l.offer, ["sent"]);
  if (isObj(out.letter_in) && isObj(l.letter_in) && out.letter_in.letter === l.letter_in.letter) {
    const li = { ...out.letter_in };
    pdfBytes(li, l.letter_in, "pdf", "pdf_away");
    out.letter_in = li;
  }
  if (isObj(out.seal) && isObj(l.seal)) out.seal = fill(out.seal, l.seal, ["sent"]);
  if (isObj(out.entry) && isObj(l.entry)) out.entry = fill(out.entry, l.entry, ["sent"]);
  out.ref = smaller(w.ref, l.ref);
  out.created_at = Math.min(Number(w.created_at ?? Infinity), Number(l.created_at ?? Infinity));
  if (!Number.isFinite(out.created_at)) delete out.created_at;
  return out;
}

/** The member's wallet: holdings by leaf (a payout's new leaf replaces the old one of its deposit), payouts by transaction. */
function mergeWallet(w: Doc, l: Doc): Doc {
  const wh = (w.holdings as Doc[] | undefined) ?? [];
  const lh = (l.holdings as Doc[] | undefined) ?? [];
  const leaves = new Set(wh.map((h) => h.leaf_id));
  const deposits = new Set(wh.map((h) => h.deposit_txid).filter(Boolean));
  const holdings = [...wh, ...lh.filter((h) => !leaves.has(h.leaf_id) && !(h.deposit_txid && deposits.has(h.deposit_txid)))];
  const payouts = union(w.payouts as Doc[] | undefined, l.payouts as Doc[] | undefined, (p) => `${p.txid}:${p.units}`) ?? [];
  return { ...fill(w, l, ["fund"]), holdings, payouts };
}

/** The keys handed out: every (k, to) either side holds, first time kept. */
function mergeKeys(w: Doc, l: Doc): Doc {
  const all = [...((w.given as Doc[]) ?? []), ...((l.given as Doc[]) ?? [])];
  const by = new Map<string, Doc>();
  for (const g of all) {
    const k = `${g.k}:${g.to}`;
    const was = by.get(k);
    if (!was || Number(g.at) < Number(was.at)) by.set(k, g);
  }
  return { given: [...by.values()].sort((a, b) => Number(a.k) - Number(b.k) || Number(a.at) - Number(b.at)) };
}

/**
 * Merges one record as two devices hold it. The later `at` wins; for an equal `at`, the larger
 * canonical JSON (every device picks the same). The kind's rule then puts back what may not be lost.
 */
export function mergeEntry(a: Entry | undefined, b: Entry | undefined): Entry {
  if (!a) return b!;
  if (!b) return a;
  const ca = canonical(a.doc);
  const cb = canonical(b.doc);
  if (a.at === b.at && ca === cb) return a;
  const aWins = a.at !== b.at ? a.at > b.at : ca > cb;
  const [w, l] = aWins ? [a, b] : [b, a];
  const at = Math.max(a.at, b.at);
  const kind = kindOf(w.id);
  // a deletion stands, except of the keys handed out (only added to)
  if (w.doc === null || l.doc === null || !isObj(w.doc) || !isObj(l.doc)) {
    if (kind === "keys" && isObj(l.doc)) return { id: w.id, at, doc: l.doc };
    return { id: w.id, at, doc: w.doc };
  }
  switch (kind) {
    case "invoice":
      return { id: w.id, at, doc: mergeInvoice(w.doc, l.doc) };
    case "deal":
      return { id: w.id, at, doc: mergeDeal(w.doc, l.doc) };
    case "contact":
      return { id: w.id, at, doc: l.doc.verified_at && !w.doc.verified_at && w.doc.mailbox_pk === l.doc.mailbox_pk ? { ...w.doc, verified_at: l.doc.verified_at } : w.doc };
    case "keys":
      return { id: w.id, at, doc: mergeKeys(w.doc, l.doc) };
    case "wallet":
      return { id: w.id, at, doc: mergeWallet(w.doc, l.doc) };
    default:
      return { id: w.id, at, doc: w.doc };
  }
}

export interface Merged {
  /** Every record after the merge, by id. */
  records: Entry[];
  /** What this device writes into its store (changed by the merge, never `remoteOnly`). */
  toLocal: Entry[];
}

/** Merges this device's records with the state's; the same inputs give the same result on every device. */
export function mergeAll(local: readonly Entry[], remote: readonly Entry[]): Merged {
  const L = new Map(local.filter((e) => !localOnly(e.id)).map((e) => [e.id, e]));
  const R = new Map(remote.filter((e) => !localOnly(e.id)).map((e) => [e.id, e]));
  const ids = [...new Set([...L.keys(), ...R.keys()])].sort();
  const records: Entry[] = [];
  const toLocal: Entry[] = [];
  for (const id of ids) {
    const m = mergeEntry(L.get(id), R.get(id));
    records.push(m);
    const l = L.get(id);
    if (!remoteOnly(id) && (!l || l.at !== m.at || canonical(l.doc) !== canonical(m.doc))) toLocal.push(m);
  }
  return { records, toLocal };
}

// ---------- the PDF bytes, left out for room ----------
const b64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

async function away(b64: string): Promise<Away> {
  let bin = "";
  try {
    bin = atob(b64);
  } catch {
    bin = b64;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { sha256: Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join(""), bytes: b64Bytes(b64) };
}

/** The record without its PDF bytes (name, SHA-256 and size kept); the same record when it has none. */
export async function slim(e: Entry): Promise<Entry> {
  if (!isObj(e.doc)) return e;
  const d: Doc = { ...e.doc };
  let did = false;
  if (isObj(d.terms_pdf) && typeof d.terms_pdf.b64 === "string" && d.terms_pdf.b64) {
    d.terms_pdf = { name: d.terms_pdf.name, b64: "", away: await away(d.terms_pdf.b64) };
    did = true;
  }
  if (isObj(d.assignment) && typeof d.assignment.pdf === "string" && d.assignment.pdf) {
    d.assignment = { ...d.assignment, pdf: "", pdf_away: await away(d.assignment.pdf) };
    did = true;
  }
  if (isObj(d.letter_in) && typeof d.letter_in.pdf === "string" && d.letter_in.pdf) {
    d.letter_in = { ...d.letter_in, pdf: "", pdf_away: await away(d.letter_in.pdf) };
    did = true;
  }
  return did ? { ...e, doc: d } : e;
}

/** Whether a document's PDF bytes are on another device only (left out of the state). */
export const pdfAway = (x: { b64?: string; away?: Away } | { pdf?: string; pdf_away?: Away } | undefined): boolean => !!x && ("away" in x ? !!x.away && !x.b64 : "pdf_away" in x ? !!x.pdf_away && !x.pdf : false);

// ---------- encoding ----------
const enc = new TextEncoder();
const dec = new TextDecoder();

async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const s = new Blob([new Uint8Array(b)]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export const gzip = (b: Uint8Array) => pipe(b, new CompressionStream("gzip"));
export const gunzip = (b: Uint8Array) => pipe(b, new DecompressionStream("gzip"));

/** The inner key: HMAC-SHA-256(inbox, "jitsuin/<role>/sync/v1") as a non-extractable AES-GCM key. `inbox` is not changed. */
export async function syncKey(inbox: Uint8Array, role: Role): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const raw = new Uint8Array(inbox);
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    const h = await subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    bytes = new Uint8Array(await subtle.sign("HMAC", h, enc.encode(`jitsuin/${role}/sync/v1`)));
    return await subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
    bytes?.fill(0);
  }
}

const aad = (role: Role) => enc.encode(`jitsuinfi-sync-v2:${role}`);

async function seal(state: SyncState, key: CryptoKey, zipped?: Uint8Array): Promise<Uint8Array> {
  const z = zipped ?? (await gzip(enc.encode(JSON.stringify(state))));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(state.role) }, key, new Uint8Array(z)));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(enc.encode(MAGIC), 0);
  out.set(iv, 4);
  out.set(ct, 16);
  return out;
}

/** Done records are the first to make room: a settled deal or invoice (it has its bundle). */
const finished = (e: Entry) => isObj(e.doc) && !!e.doc.bundle;
const keep = (e: Entry) => e.id === HISTORY || e.id === KEYS_GIVEN;

export interface Encoded {
  bytes: Uint8Array;
  /** The records in it (after PDF bytes were left out), for "is the relay's copy already this?". */
  state: SyncState;
}

/**
 * The state for `records`, sealed with `key`, within `budget` bytes (gzip first, then without PDF
 * bytes, then without the oldest finished records, then without the oldest others). Throws only
 * when the history and the keys handed out alone do not fit.
 */
export async function encodeState(role: Role, records: readonly Entry[], key: CryptoKey, now: number, budget = SYNC_BUDGET): Promise<Encoded> {
  let list = records.filter((e) => !localOnly(e.id));
  let slimmed = 0;
  let held = 0;
  const attempt = async () => {
    const state: SyncState = { v: SYNC_VERSION, role, written_at: now, records: list, held_back: held, slimmed };
    const z = await gzip(enc.encode(JSON.stringify(state)));
    return { state, z, fits: z.length <= budget };
  };
  let a = await attempt();
  if (!a.fits) {
    const out: Entry[] = [];
    for (const e of list) {
      const s = await slim(e);
      if (s !== e) slimmed++;
      out.push(s);
    }
    list = out;
    a = await attempt();
  }
  // oldest finished first, then oldest of the rest; never the history or the keys handed out
  const order = list
    .filter((e) => !keep(e))
    .sort((x, y) => Number(finished(y)) - Number(finished(x)) || x.at - y.at)
    .map((e) => e.id);
  while (!a.fits && order.length) {
    const drop = new Set(order.splice(0, Math.max(1, Math.ceil(order.length / 10))));
    list = list.filter((e) => !drop.has(e.id));
    held += drop.size;
    a = await attempt();
  }
  if (!a.fits) throw new Error("your history and keys alone are larger than the relay keeps");
  return { bytes: await seal(a.state, key, a.z), state: a.state };
}

/**
 * The state from the relay's bytes (opened from the seal). A version 1 buyer history copy is read
 * as the history record (written at 0, so any record of this device is newer). Throws when the
 * bytes are altered or sealed under another key.
 */
export async function decodeState(role: Role, bytes: Uint8Array, key: CryptoKey): Promise<SyncState> {
  if (dec.decode(bytes.slice(0, 4)) !== MAGIC) {
    if (role !== "buyer") throw new Error("the relay's copy of your records is not readable");
    const h = decodeBackup(bytes);
    return { v: SYNC_VERSION, role, written_at: 0, records: [{ id: HISTORY, at: 0, doc: h }], held_back: 0, slimmed: 0 };
  }
  const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(4, 16), additionalData: aad(role) }, key, bytes.slice(16));
  const s = JSON.parse(dec.decode(await gunzip(new Uint8Array(plain)))) as SyncState;
  if (s.v !== SYNC_VERSION || s.role !== role || !Array.isArray(s.records)) throw new Error("the relay's copy of your records is not readable");
  for (const r of s.records) if (typeof r?.id !== "string" || typeof r.at !== "number") throw new Error("the relay's copy of your records is not readable");
  return s;
}

/** Whether `state` already holds exactly `records` (then nothing is sent). */
export function sameRecords(a: readonly Entry[], b: readonly Entry[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: readonly Entry[]) => canonical([...l].sort((x, y) => (x.id < y.id ? -1 : 1)));
  return key(a) === key(b);
}
