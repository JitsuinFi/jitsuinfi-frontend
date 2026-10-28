// The buyer's records (HNK-25.T1, T2, T6, T7; IA port part 2, 2026-10-26): the invoices addressed
// to the buyer's keys in the encrypted device store under "invoice:" + N, each with an opaque ref
// for its address (lib/deal-ref.ts: /buyer/invoices/<ref>, /buyer/pay/<ref>); the history chain
// (HISTORY_ID) with its sealed copy at the relay; the board's word on each signed invoice; and the
// next invoice key as last shown in this tab. Every section and the inbox read and write here; a
// write tells every open page.
//
// No master stays in this tab: every action that needs a key is a stamp (one passkey touch,
// `account.stamp()`) passed to a jitsuin-wasm `*Bytes` function, which zeroes it. The buyer salt is
// unchanged (`jitsuin/buyer/master/v1`), so old buyer keys stay the same.
import { useEffect, useReducer, useState } from "react";
import { useStoreVersion } from "../../app/store-change";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { remoteRecord, syncNow } from "../../lib/device-sync";
import { KEYS_GIVEN } from "../../lib/sync";
import { account } from "../../lib/app-session";
import type { BoardData } from "../../lib/board";
import { refreshBoard, useLiveBoard } from "../../app/board-live";
import { decodeBackup, emptyHistory, encodeBackup, HISTORY_ID, localNextIndex, type HistoryDoc } from "../../lib/buyer-history";
import { keysFloor, type GivenKeys } from "../../lib/key-match";
import { boardStatus, isInvoiceId, sortInvoices, storeId, type BuyerInvoice } from "../../lib/buyer-invoices";
import { json, wasm } from "../../lib/core";
import { newRef, withRefs } from "../../lib/deal-ref";
import { keyMissText, type KeyMiss } from "../../lib/key-match";
import { draft, RelayError, send } from "../../lib/relay";
import { encodeMessage } from "../../lib/relay-message";
import { BUYER_CHANGED } from "../../app/DueReminder";
import { contactId, senderWords, type Contact } from "../../lib/contact";
import { readablePrint } from "../../lib/print";

export type Inv = BuyerInvoice & { ref: string };

// ---------- change notices ----------
let version = 0;
const listeners = new Set<() => void>();
/** Something in the store changed: every open buyer page reads it again. */
export function changed(): void {
  version++;
  listeners.forEach((f) => f());
  dispatchEvent(new Event(BUYER_CHANGED)); // the shell's count on Pay
}
/** Grows on every notice: one of this module's own, or any write to the buyer's store (the inbox's too). */
export function useVersion(): string {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  const stored = useStoreVersion("buyer");
  return `${version}:${stored}`;
}

export function store() {
  const s = account.current?.store;
  if (!s || account.current?.role !== "buyer") throw new Error("sign in as buyer first");
  return s;
}

// ---------- invoices ----------
/** Every invoice on this device, newest first, each with its ref (one made before refs gets one now, saved once). */
export async function loadInvoices(): Promise<Inv[]> {
  const s = store();
  const all = sortInvoices((await s.list<BuyerInvoice>()).filter((r) => isInvoiceId(r.id)).map((r) => r.doc));
  const { deals, changed: fresh } = withRefs(all);
  for (const d of fresh) await s.put(storeId(d.n), d);
  return deals;
}

export async function invoiceByN(n: string): Promise<Inv | undefined> {
  const r = await store().get<BuyerInvoice>(storeId(n));
  if (!r) return undefined;
  if (r.ref) return r as Inv;
  const withRef = { ...r, ref: newRef() };
  await store().put(storeId(n), withRef);
  return withRef;
}

/** Writes the record under N (the update sees the one kept, if any); a new record gets its ref. */
export async function saveInvoice(update: (previous: BuyerInvoice | undefined) => BuyerInvoice, n: string): Promise<Inv> {
  const s = store();
  const prev = await s.get<BuyerInvoice>(storeId(n));
  const next = update(prev);
  const withRef = (next.ref ? next : { ...next, ref: prev?.ref ?? newRef() }) as Inv;
  await s.put(storeId(n), withRef);
  changed();
  return withRef;
}

/** The invoices, read again whenever the store changes: `null` until the first read, "blocked" without a store. */
export function useInvoices(): Inv[] | "blocked" | null {
  const v = useVersion();
  const [list, setList] = useState<Inv[] | "blocked" | null>(null);
  useEffect(() => {
    let live = true;
    if (!account.current?.store) {
      setList("blocked");
      return;
    }
    void loadInvoices().then(
      (d) => live && setList(d),
      () => live && setList([]),
    );
    return () => void (live = false);
  }, [v]);
  return list;
}

// ---------- who sent each invoice (mobile E2E 2026-10-27, B-14) ----------

/** The supplier of each invoice in words ("@name", or not in contacts with its fingerprint), by N; read again on every store change. */
export function useSenders(list: BuyerInvoice[]): Record<string, string> {
  const v = useVersion();
  const [names, setNames] = useState<Record<string, string>>({});
  const key = list.map((r) => `${r.n}:${r.reply_to ?? r.assignment?.supplier_mailbox ?? ""}`).join(",");
  useEffect(() => {
    let live = true;
    const store = account.current?.store;
    void (async () => {
      const out: Record<string, string> = {};
      for (const r of list) {
        const mb = r.reply_to ?? r.assignment?.supplier_mailbox;
        const c = mb && store ? await store.get<Contact>(contactId({ mailbox_pk: mb } as Contact)).catch(() => undefined) : undefined;
        let print = "";
        try {
          print = readablePrint(json<{ supplier_pk: string }>(wasm.invoiceDecode(r.invoice)).supplier_pk);
        } catch {
          print = "";
        }
        out[r.n] = senderWords(c, print);
      }
      if (live) setNames(out);
    })();
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);
  return names;
}

// ---------- the board's word on each signed invoice (HNK-25.T7, BL-D25-09) ----------
// Read again when a deal changes state, on return to the tab, and while a deal is in flight
// (judge run 2, finding 2: app/board-live.ts).

/** The board as last read in this tab (null before); `inFlight`: an invoice waits for the board. */
export function useBoard(inFlight = false): BoardData | null {
  return useLiveBoard("buyer", inFlight);
}

/** Reads the board now (Show my next invoice key). */
export async function readBoard(): Promise<BoardData | null> {
  return refreshBoard();
}

/** An invoice the board still has news for: signed, not settled on this device. */
export const awaitsBoard = (list: readonly BuyerInvoice[]) => list.some((r) => !!r.signature && !r.bundle);

/** What the board says about each signed invoice ("financed, registered on the board", "settled on time"…), or null unread. */
export function statusesOf(list: readonly BuyerInvoice[], b: BoardData | null): Record<string, string | null> | null {
  return b ? Object.fromEntries(list.map((r) => [r.n, onBoard(r, b.json)])) : null;
}

/** The settlement bundle when the financier sent it, else the invoice, letter and seals this device holds. */
function onBoard(rec: BuyerInvoice, boardJson: string): string | null {
  if (!rec.signature) return null;
  try {
    const a = rec.assignment;
    const bundle =
      rec.bundle ??
      wasm.bundleBuild(
        JSON.stringify({
          invoice: rec.invoice,
          buyer_signature: rec.signature,
          ...(a?.letter ? { assignment: a.letter, seals: [a.supplier_seal, a.buyer_seal, a.financier_seal].filter(Boolean), with_settlement: true } : {}),
        }),
      );
    return boardStatus(json<{ register: { status: string }; settled: { on_time: boolean } | null }>(wasm.bundleOnBoard(bundle, boardJson)));
  } catch {
    return null;
  }
}

// ---------- keys: one passkey touch each ----------
/** How far the key search looks past the newest index this device knows of. */
const LOOKAHEAD = 8;

/**
 * The newest history index this device knows of: its own chain, the chain's relay copy (another
 * device with this passkey may have issued newer certificates and handed out a later key: user
 * test 2026-10-27), and the next key shown in this tab. The relay copy is read once per account in
 * this tab, before the passkey touch, so no master waits on the network; a copy that cannot be
 * read counts as none.
 */
async function newestIndex(): Promise<number> {
  const local = localNextIndex(await loadHistory());
  const fp = account.current?.fingerprint ?? "";
  if (relayLength?.fp !== fp) {
    const remote = await relayHistory().catch(() => null);
    relayLength = { fp, n: remote ? localNextIndex(remote) : 0 };
  }
  // finding F10: the invoices and keys handed out that the other devices synced here
  const used = keysFloor(await loadInvoices().catch(() => []), await loadGiven());
  // the key last shown in this tab can only widen the search
  return Math.max(local, relayLength.n, used, keyInfo?.k ?? 0);
}
let relayLength: { fp: string; n: number } | null = null;

/** Why an invoice is not for this account: the key it names and the keys checked (lib/key-match.ts). */
export class KeyMissError extends Error {
  readonly miss: KeyMiss;
  constructor(miss: KeyMiss) {
    super(keyMissText(miss));
    this.miss = miss;
  }
}

/**
 * One passkey touch: finds the history index of the key `invoice` is addressed to, then runs
 * `use` with a fresh copy of the master for that index. The master is zeroed afterwards. Throws
 * `KeyMissError` when no key of this account up to the newest known index (+ LOOKAHEAD) matches.
 */
export async function withInvoiceIndex<T>(invoice: string, use: (master: Uint8Array, k: number) => T): Promise<T> {
  const buyerPk = json<{ buyer_pk: string }>(wasm.invoiceDecode(invoice)).buyer_pk;
  const limit = (await newestIndex()) + LOOKAHEAD;
  const m = await account.stamp();
  const mine: KeyMiss["mine"] = [];
  try {
    for (let k = 0; k <= limit; k++) {
      const pk = json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk;
      if (pk === buyerPk) return use(m.slice(), k);
      mine.push({ k, pk });
    }
    throw new KeyMissError({ invoiceKey: buyerPk, mine, demo: !!account.current?.demo });
  } finally {
    m.fill(0);
  }
}

/** One passkey touch: the history index of the key `invoice` is addressed to, or why there is none. */
export async function findKey(invoice: string): Promise<{ k: number } | { miss: KeyMiss }> {
  try {
    return { k: await withInvoiceIndex(invoice, (_m, k) => k) };
  } catch (e) {
    if (e instanceof KeyMissError) return { miss: e.miss };
    throw e;
  }
}

/** One passkey touch: the history index of the key `invoice` is addressed to, or null. */
export async function findKeyIndex(invoice: string): Promise<number | null> {
  const r = await findKey(invoice);
  return "k" in r ? r.k : null;
}

/** Sends the signature on invoice N to the supplier's mailbox and notes when. */
export async function sendSignature(n: string, signature: string, replyTo: string): Promise<void> {
  if (!account.current) throw new Error("sign in first");
  const me = myIdentity();
  const header = { ...draft("invoice.signature", { role: "buyer", mailbox_pk: me.mailbox_pk }, replyTo, relayDeps, { n, body: { buyer_signature: signature } }) };
  await send(replyTo, await encodeMessage(header), relayDeps);
  await saveInvoice((prev) => {
    if (!prev) throw new Error("check the invoice first");
    return { ...prev, reply_to: replyTo, signature_sent_at: Date.now() };
  }, n);
}

// ---------- the history chain ----------
// This tab only: the history check found the board ahead of this device, so issuing is blocked.
export const chainState = { successorOnBoard: false };

export async function loadHistory(): Promise<HistoryDoc> {
  return (await account.current?.store?.get<HistoryDoc>(HISTORY_ID)) ?? emptyHistory();
}

export async function saveHistory(h: HistoryDoc): Promise<void> {
  await store().put(HISTORY_ID, h);
  changed();
  await syncNow().catch(() => undefined); // checked again on the next key check
}

/**
 * HNK-25.T2 (BL-D26-03): the chain's sealed copy at the relay, for another device with this
 * passkey. Finding F10: it is the history record of the role's synced state (lib/sync.ts); written
 * again here, so this device's chain is the newest and goes to the relay as it is.
 */
export async function backupHistory(h: HistoryDoc): Promise<void> {
  if (!account.current) return;
  await store().put(HISTORY_ID, h);
  await syncNow();
}

/** The chain as the relay holds it now (a fresh read), or null when it holds none. */
export async function relayHistory(): Promise<HistoryDoc | null> {
  if (!account.current) return null;
  const r = await remoteRecord(HISTORY_ID);
  // through the same check as the version 1 copy: base64url certificates only
  return r?.doc ? decodeBackup(encodeBackup(r.doc as HistoryDoc)) : null;
}

// ---------- the invoice keys handed out (finding F10) ----------
/** The keys this account gave to suppliers, from every device (synced as one record). */
export async function loadGiven(): Promise<GivenKeys> {
  return (await account.current?.store?.get<GivenKeys>(KEYS_GIVEN).catch(() => undefined)) ?? { given: [] };
}

/** Notes that key #k went to `to` (a supplier's mailbox, or "copied" for a key copied by hand). */
export async function noteGiven(k: number, to: string): Promise<void> {
  const g = await loadGiven();
  if (g.given.some((x) => x.k === k && x.to === to)) return;
  await store().put(KEYS_GIVEN, { given: [...g.given, { k, to, at: Date.now() }] });
}

/** Why the relay copy of the history could not be read, in a calm sentence (HNK-34 E2E). */
export function backupProblem(e: unknown): string {
  if (e instanceof RelayError) {
    if (e.status === undefined) return "The relay could not be reached.";
    if (e.status >= 500) return `The relay had a problem on its side (${e.status}).`;
    return `The relay refused to hand it over (${e.status}).`;
  }
  return "The copy on the relay could not be opened.";
}

/** The N of every register entry on the board (decoded only; signatures are not checked here). */
export function registeredNs(boardJson: string): Set<string> {
  const out = new Set<string>();
  for (const r of json<Array<{ memo: string }>>(boardJson)) {
    try {
      const d = json<{ kind: string; nullifier?: string }>(wasm.boardMemoDescribe(r.memo));
      if (d.kind !== "Settled" && d.nullifier) out.add(d.nullifier);
    } catch {
      /* not a JitsuinFi memo */
    }
  }
  return out;
}

// ---------- the next invoice key, as last shown in this tab ----------
export type Note = { kind: "ok" | "warn" | "bad"; title?: string; text: string };
export interface KeyInfo {
  /** The identity key (hex: it signs the history; shown as its readable print). */
  id: string;
  /** The history index of the next invoice key, and the key itself (hex, copied whole for the supplier). */
  k: number;
  next: string;
  notes: Note[];
  /** Certificates anchored on the board, when the board was read. */
  anchored: number | null;
}
let keyInfo: KeyInfo | null = null;
const keyListeners = new Set<() => void>();
export function setKeyInfo(k: KeyInfo | null): void {
  keyInfo = k;
  keyListeners.forEach((f) => f());
}
/** The key shown last in this tab, outside React. */
export function keyInfoNow(): KeyInfo | null {
  return keyInfo;
}
export function useKeyInfo(): KeyInfo | null {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    keyListeners.add(bump);
    return () => void keyListeners.delete(bump);
  }, []);
  return keyInfo;
}

/** Base64 of bytes, and back (PDFs kept in the encrypted store). */
export const toB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
