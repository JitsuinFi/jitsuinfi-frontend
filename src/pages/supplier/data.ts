// The supplier's records (HNK-24.T3, T9; IA port 2026-10-26): every deal in the encrypted device
// store under its N, each with an opaque ref for its address (lib/deal-ref.ts); the buyer keys that
// arrived through the relay, waiting for an invoice; the board's word on each offered deal; and,
// for this tab only, the PDF each invoice was written with, so "Send to the buyer" does not ask
// for it again. Every page and the inbox read and write here; a write tells every open page.
import { useEffect, useReducer, useState } from "react";
import { useStoreVersion } from "../../app/store-change";
import { account } from "../../lib/app-session";
import { useLiveBoard } from "../../app/board-live";
import { boardStatus } from "../../lib/buyer-invoices";
import { contactId, type Contact } from "../../lib/contact";
import { daysToDate, json, wasm } from "../../lib/core";
import { newRef, withRefs } from "../../lib/deal-ref";
import { sortDeals, type SupplierDeal } from "../../lib/supplier-deal";

export type Deal = SupplierDeal & { ref: string };

const HEX64 = /^[0-9a-f]{64}$/i;

// ---------- change notices ----------
let version = 0;
const listeners = new Set<() => void>();
/** Something in the store changed: every open supplier page reads it again. */
export function changed(): void {
  version++;
  listeners.forEach((f) => f());
}
/** Grows on every notice: one of this module's own, or any write to the supplier's store (the inbox's too). */
function useVersion(): string {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  const stored = useStoreVersion("supplier");
  return `${version}:${stored}`;
}

export function store() {
  const s = account.current?.store;
  if (!s || account.current?.role !== "supplier") throw new Error("sign in as supplier first");
  return s;
}

export async function save(d: SupplierDeal): Promise<void> {
  await store().put(d.n, d);
  changed();
}

/** Every deal, newest first, each with its ref (a deal made before refs gets one now, saved once). */
export async function loadDeals(): Promise<Deal[]> {
  const s = store();
  // the store also keeps contacts ("contact:" ids) and arrived keys ("buyerkey:"); deals are stored under their N
  const all = sortDeals((await s.list<SupplierDeal>()).filter((r) => HEX64.test(r.id)).map((r) => r.doc));
  const { deals, changed: fresh } = withRefs(all);
  for (const d of fresh) await s.put(d.n, d);
  return deals;
}

export async function dealByN(n: string): Promise<Deal | undefined> {
  const d = await store().get<SupplierDeal>(n);
  if (!d) return undefined;
  if (d.ref) return d as Deal;
  const withRef = { ...d, ref: newRef() };
  await store().put(d.n, withRef);
  return withRef;
}

/** The deals, read again whenever the store changes. `null` until the first read. */
export function useDeals(): Deal[] | null {
  const v = useVersion();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadDeals().then(
      (d) => live && setDeals(d),
      () => live && setDeals([]),
    );
    return () => void (live = false);
  }, [v]);
  return deals;
}

// ---------- the board's word on each offered deal (HNK-25.T7, BL-D25-09) ----------
// Read again when a deal changes state, on return to the tab, and while a deal is in flight
// (judge run 2, finding 2: app/board-live.ts); each deal's line is worked out from the last read.
let boardSays: Record<string, string> = {};
const saidFrom = new WeakMap<object, Map<string, string>>();

/** What the board said about `d` ("On the board: …"), or "" when not read or not offered. */
export function boardLine(d: SupplierDeal): string {
  return d.buyer_signature && d.offer ? (boardSays[d.n] ?? "") : "";
}

/** 済: the financier's settlement bundle is here, or the board shows the deal settled. */
export const isSettled = (d: SupplierDeal) => !!d.bundle || (boardSays[d.n] ?? "").startsWith("On the board: settled");

/** Reads the live board for the offered deals; pages redraw when a new read lands. */
export function useBoard(deals: SupplierDeal[] | null): void {
  const offered = !!deals?.some((d) => d.buyer_signature && d.offer);
  const b = useLiveBoard("supplier", !!deals?.some((d) => d.buyer_signature && d.offer && !d.bundle));
  if (!b || !deals || !offered) return;
  // one line per deal and board read (a deal's record is replaced on every write)
  let memo = saidFrom.get(b);
  if (!memo) saidFrom.set(b, (memo = new Map()));
  const next: Record<string, string> = {};
  for (const d of deals) {
    if (!(d.buyer_signature && d.offer)) continue;
    const k = `${d.n}:${d.bundle ? "b" : ""}:${d.seal ? "s" : ""}`;
    let line = memo.get(k);
    if (line === undefined) memo.set(k, (line = statusOnBoard(d, b.json) ?? ""));
    next[d.n] = line;
  }
  boardSays = next;
}

function statusOnBoard(d: SupplierDeal, boardJson: string): string | null {
  try {
    const bundle =
      d.bundle ??
      wasm.bundleBuild(
        JSON.stringify({
          invoice: d.invoice,
          buyer_signature: d.buyer_signature,
          ...(d.seal ? { assignment: d.seal.letter, seals: [d.seal.s0], with_settlement: true } : {}),
        }),
      );
    return `On the board: ${boardStatus(json<{ register: { status: string }; settled: { on_time: boolean } | null }>(wasm.bundleOnBoard(bundle, boardJson)))}`;
  } catch {
    return null;
  }
}

/** The invoice's own issue date and terms hash, read from its canonical bytes. */
export function invoiceFacts(d: SupplierDeal): { issued: string; terms: string } {
  try {
    const f = json<{ issue_date: number; terms_hash: string }>(wasm.invoiceDecode(d.invoice));
    return { issued: daysToDate(f.issue_date), terms: f.terms_hash };
  } catch {
    return { issued: "", terms: "" };
  }
}

// ---------- the PDF each invoice was written with, for this tab ----------
const pdfs = new Map<string, File>();
export const keepPdf = (n: string, f: File) => void pdfs.set(n, f);
export const pdfOf = (n: string) => pdfs.get(n);

// ---------- buyer keys that arrived through the relay (HNK-25.T2, BL-D22-01) ----------
/**
 * A buyer's invoice key that came in a letter: the letter was signed by that key and names the
 * buyer's mailbox, so the invoice written for it can go back to that mailbox with no card to paste.
 */
export interface ArrivedKey {
  invoice_pk: string;
  mailbox_pk: string;
  at: number;
}
const KEY_PREFIX = "buyerkey:";

export async function keepArrivedKey(k: ArrivedKey): Promise<void> {
  await store().put(KEY_PREFIX + k.invoice_pk, k);
  changed();
}

export async function dropArrivedKey(invoicePk: string): Promise<void> {
  await store().delete(KEY_PREFIX + invoicePk);
  changed();
}

export interface Book {
  keys: ArrivedKey[];
  contacts: Array<Contact & { verified_at?: number }>;
}

/** The arrived keys (newest first) and the contacts, read again whenever the store changes. */
export function useBook(): Book | null {
  const v = useVersion();
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => store().list<unknown>())
      .then(
        (all) => {
          if (!live) return;
          const keys = all.filter((r) => r.id.startsWith(KEY_PREFIX)).map((r) => r.doc as ArrivedKey);
          keys.sort((a, b) => b.at - a.at);
          const contacts = all.filter((r) => r.id.startsWith("contact:")).map((r) => r.doc as Contact & { verified_at?: number });
          setBook({ keys, contacts });
        },
        () => live && setBook({ keys: [], contacts: [] }),
      );
    return () => void (live = false);
  }, [v]);
  return book;
}

/** The contact whose mailbox this is, if the supplier keeps their card. */
export function contactFor(book: Book | null, mailboxPk: string | undefined): (Contact & { verified_at?: number }) | undefined {
  return mailboxPk ? book?.contacts.find((c) => contactId(c) === `contact:${mailboxPk}`) : undefined;
}

// ---------- the Deal tab remembers the last deal opened (its ref, never the number) ----------
const LAST = "jitsuin.supplier.deal";
export function rememberDeal(ref: string): void {
  try {
    localStorage.setItem(LAST, ref);
  } catch {
    /* blocked storage: the tab opens the first deal */
  }
}
export function lastDeal(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

// ---------- the last advance address used here (judge run 2, finding 7) ----------
// Kept in the encrypted device store (not in plain browser storage), offered as a suggestion on
// the next offer; the supplier still decides (a new address per deal keeps deals unlinkable).
const ADDRESS_ID = "pref:advance-address";

export async function lastAddress(): Promise<string | null> {
  return (await account.current?.store?.get<{ address: string }>(ADDRESS_ID).catch(() => undefined))?.address ?? null;
}

export async function rememberAddress(address: string): Promise<void> {
  await account.current?.store?.put(ADDRESS_ID, { address, at: Date.now() });
}
