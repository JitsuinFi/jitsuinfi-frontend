// Buyer screen (HNK-10.T3 crucial, HNK-06.T5 QR; HNK-22.T4): keys from a passkey, sign the
// invoice, seal the letter, issue the history certificate, and pay at maturity by QR.
//
// Opens in a buyer session. No master stays in this tab: every action that needs a key is a stamp
// (one passkey touch, `account.stamp()`) passed to a jitsuin-wasm `*Bytes` function, which zeroes
// it. The buyer salt is unchanged (`jitsuin/buyer/master/v1`), so old buyer keys stay the same.
//
// The invoice number `k` is never typed (HNK-25.T2, P-09): the next one comes from the history
// certificates kept in the encrypted deal store, checked against board data when given (wasm
// `historyNext`); for an invoice already in hand, `k` is found from the key it is addressed to.
// React since HNK-31.T9.
//
// Laid out since HNK-34.T5 from the approved sample (design-samples/internal/buyer.html): the
// caption holds who you are, the big numbers and the invoice ledger; the open invoice lies on the
// desk as paper (請求書, or the 債権譲渡通知書 once a letter is in hand) with its three seals, the
// checks as lines that tick, and the 払込票 payment slip whose QR exists only when payProblems()
// is empty. One set of codes stands behind the sheet: every step reads the same invoice and
// letter. History is a chain of certificates anchored to the public board, a request a branch.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Banner, Button, CodeBlock, TrustedSvg, useOut } from "../app/ui";
import { myIdentity, myMailbox, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { checkInvoice, type CheckResult } from "../lib/buyer-check";
import { letterChecks, letterProblems, payProblems, type LetterCheck } from "../lib/buyer-letter";
import { append, certFields, decodeBackup, dropTail, emptyHistory, encodeBackup, freeable, head, HISTORY_ID, localNextIndex, reconcile, type CertFields, type HistoryDoc } from "../lib/buyer-history";
import { boardStatus, buyerTotals, invoiceRecord, invoiceStatus, isInvoiceId, nextAction, routeDone, sealCount, sortInvoices, storeId, withSignature, type BuyerAction, type BuyerInvoice } from "../lib/buyer-invoices";
import { DEFAULT_GRACE_DAYS, lateState, ledgerLine, msToCutoff, reminders, reminderText } from "../lib/buyer-late";
import { daysToDate, fileHash, json, today, wasm, zatToZec } from "../lib/core";
import { NET } from "../lib/network";
import { discard, draft, loadState, RelayError, saveState, send, type Received } from "../lib/relay";
import { encodeMessage, signingBytes, verifyHeader, type Header } from "../lib/relay-message";
import { Page } from "../app/AppShell";
import { LatePanel } from "./BuyerLate";
import { MailboxCard, takeContact, type InboxAction } from "./MailboxCard";
import "./role-paper.css";
import "./buyer.css";

// This tab only: the history check found the board ahead of this device, so issuing is blocked.
let successorOnBoard = false;

// This tab only: sign requests opened from the inbox, by N: who to answer, and the relay message to
// remove once the signature is sent (it stays until then, so its PDF is not lost).
const pending = new Map<string, { replyTo: string; relayId: string }>();

async function loadHistory(): Promise<HistoryDoc> {
  return (await account.current?.store?.get<HistoryDoc>(HISTORY_ID)) ?? emptyHistory();
}

async function saveHistory(h: HistoryDoc): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("sign in as buyer first");
  await store.put(HISTORY_ID, h);
  await backupHistory(h).catch(() => undefined); // checked again on the next key check
}

/** HNK-25.T2 (BL-D26-03): the chain's sealed copy at the relay, for another device with this passkey. */
async function backupHistory(h: HistoryDoc): Promise<void> {
  const s = account.current;
  if (!s) return;
  await myMailbox();
  await saveState(s.inbox, encodeBackup(h), relayDeps);
}

async function relayHistory(): Promise<HistoryDoc | null> {
  const s = account.current;
  if (!s) return null;
  await myMailbox();
  const b = await loadState(s.inbox, relayDeps);
  return b ? decodeBackup(b) : null;
}

/** Why the relay copy of the history could not be read, in a calm sentence (HNK-34 E2E). */
function backupProblem(e: unknown): string {
  if (e instanceof RelayError) {
    if (e.status === undefined) return "The relay could not be reached.";
    if (e.status >= 500) return `The relay had a problem on its side (${e.status}).`;
    return `The relay refused to hand it over (${e.status}).`;
  }
  return "The copy on the relay could not be opened.";
}

/** The N of every register entry on the board (decoded only; signatures are not checked here). */
function registeredNs(boardJson: string): Set<string> {
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

/** How far `findIndex` looks past the next index for an invoice addressed to an older key. */
const LOOKAHEAD = 8;

/**
 * One passkey touch: finds the history index of the key `invoice` is addressed to, then runs
 * `use` with a fresh copy of the master for that index. The master is zeroed afterwards.
 */
async function withInvoiceIndex<T>(invoice: string, use: (master: Uint8Array, k: number) => T): Promise<T> {
  const buyerPk = json<{ buyer_pk: string }>(wasm.invoiceDecode(invoice)).buyer_pk;
  const limit = localNextIndex(await loadHistory()) + LOOKAHEAD;
  const m = await account.stamp();
  try {
    for (let k = 0; k <= limit; k++) {
      if (json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk === buyerPk) return use(m.slice(), k);
    }
    throw new Error("this invoice is not addressed to one of your invoice keys");
  } finally {
    m.fill(0);
  }
}

/** One passkey touch: the history index of the key `invoice` is addressed to, or null. */
async function findKeyIndex(invoice: string): Promise<number | null> {
  try {
    return await withInvoiceIndex(invoice, (_m, k) => k);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("this invoice is not addressed")) return null;
    throw e;
  }
}

// Received invoices in the encrypted device store (BL-D22-07): saved once the invoice is known to
// be addressed to one of the buyer's keys, again with the signature.
async function loadInvoices(): Promise<BuyerInvoice[]> {
  const store = account.current?.store;
  if (!store) return [];
  return sortInvoices((await store.list<BuyerInvoice>()).filter((r) => isInvoiceId(r.id)).map((r) => r.doc));
}

async function saveInvoice(update: (previous: BuyerInvoice | undefined) => BuyerInvoice, n: string): Promise<void> {
  const store = account.current?.store;
  if (!store) return;
  await store.put(storeId(n), update(await store.get<BuyerInvoice>(storeId(n))));
}

/** Sends the signature on invoice N to the supplier's mailbox and removes the request it answers. */
async function sendSignature(n: string, signature: string, replyTo: string): Promise<void> {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  const me = myIdentity();
  const header = { ...draft("invoice.signature", { role: "buyer", mailbox_pk: me.mailbox_pk }, replyTo, relayDeps, { n, body: { buyer_signature: signature } }) };
  await send(replyTo, await encodeMessage(header), relayDeps);
  await saveInvoice((prev) => {
    if (!prev) throw new Error("check the invoice first");
    return { ...prev, reply_to: replyTo, signature_sent_at: Date.now() };
  }, n);
  const p = pending.get(n);
  if (p) {
    pending.delete(n);
    await discard(s.inbox, p.relayId, relayDeps).catch(() => undefined); // expires anyway
  }
}

type Area = HTMLInputElement & HTMLTextAreaElement;
const v = (r: RefObject<Area | null>) => r.current!.value.trim();
const setValue = (r: RefObject<Area | null>, value: string) => {
  r.current!.value = value;
};
const scrollTo = (r: RefObject<HTMLElement | null>) => r.current?.scrollIntoView({ behavior: "smooth", block: "start" });
const short = (x: string, a = 10, b = 8) => (x.length > a + b + 1 ? `${x.slice(0, a)}…${x.slice(-b)}` : x);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * CSS custom properties written through the CSSOM (CSP-safe, no style attributes): every element
 * under `root` with `data-v="--name:value;--other:value"` gets them after each render.
 */
function useVars(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>("[data-v]").forEach((el) => {
      for (const pair of el.dataset.v!.split(";")) {
        const at = pair.indexOf(":");
        if (at > 0) el.style.setProperty(pair.slice(0, at), pair.slice(at + 1));
      }
    });
  });
}

/** A file field as a pill: the chosen file's name (also when the inbox puts a file in it), and Choose. */
function FilePill({ label, empty, inputRef }: { label: string; empty: string; inputRef: RefObject<HTMLInputElement | null> }): ReactNode {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const el = inputRef.current!;
    const on = () => setName(el.files?.[0]?.name ?? null);
    el.addEventListener("change", on);
    return () => el.removeEventListener("change", on);
  }, [inputRef]);
  return (
    <label className="rp-file">
      <input type="file" aria-label={label} ref={inputRef} />
      <span>{name ?? empty}</span>
      <b aria-hidden="true">Choose</b>
    </label>
  );
}

/** One check that ticks: held, failed, or not run yet. */
function Check({ ok, label, text, i }: { ok: boolean | null; label: string; text: string; i: number }): ReactNode {
  return (
    <li className={ok === true ? "is-ok" : ok === false ? "is-bad" : undefined} data-v={`--d:${i === 0 ? 0 : 100 + (i - 1) * 67}ms`}>
      <i aria-hidden="true">
        <svg viewBox="0 0 16 16">{ok === false ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : <path d="M3.5 8.4l2.9 2.8L12.5 5" />}</svg>
      </i>
      <b>{label}</b>
      <span>{text}</span>
    </li>
  );
}

function Verdict({ kind, glyph, title, text, land = true }: { kind: "ok" | "warn" | "bad"; glyph: string; title: string; text: ReactNode; land?: boolean }): ReactNode {
  return (
    <p className={`rp-verdict is-${kind}${land ? " is-land" : ""}`} role={kind === "bad" ? "alert" : "status"}>
      <span className="rp-hanko" lang="ja" aria-hidden="true">
        {glyph}
      </span>
      <b>{title}</b>
      <span>{text}</span>
    </p>
  );
}

/** A seal circle on a document: dashed until pressed. */
function Seal({ g, lbl, on, press, label, wait }: { g: string; lbl: string; on: boolean; press?: boolean; label: string; wait?: boolean }): ReactNode {
  return (
    <div className={wait && !on ? "is-wait" : undefined}>
      <span className="by-seal-lbl" lang="ja">
        {lbl}
      </span>
      <span className={`by-seal${on ? " is-on" : ""}${on && press ? " is-press" : ""}`} data-g={g} role="img" aria-label={label} lang="ja" />
      <small>{label}</small>
    </div>
  );
}

/** The signature for the supplier: sent once through the mailbox, or shown to copy. */
function SendSignature({ n, sig, replyTo, sent }: { n: string; sig: string; replyTo: string | undefined; sent: () => void }): ReactNode {
  const out = useOut();
  const [done, setDone] = useState(false);
  if (!replyTo) return <CodeBlock label="Your signature: send it to the supplier" value={sig} filename="buyer.signature.txt" />;
  return (
    <>
      {done ? null : (
        <div className="actions">
          <Button
            onClick={async () => {
              try {
                await sendSignature(n, sig, replyTo);
                setDone(true); // sent once; a second copy would only repeat it
                out.show(<Banner kind="ok" title="Signature sent" text="Sealed to the supplier's mailbox. The supplier offers the invoice to a financier next." glyph="送" />);
                sent();
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Send signature to the supplier
          </Button>
        </div>
      )}
      {out.el}
    </>
  );
}

/**
 * HNK-25.T2 (BL-D22-01): the next invoice key goes to a supplier through the relay, signed with
 * that very key (one more passkey touch), so the supplier knows it comes from its holder.
 */
function ShareKey({ k, invoicePk }: { k: number; invoicePk: string }): ReactNode {
  const card = useRef<HTMLTextAreaElement>(null);
  const out = useOut();
  const [copied, setCopied] = useState(false);
  return (
    <details className="by-share" open>
      <summary>Give this key to the supplier</summary>
      <div>
        <p className="hint">Give this key to the supplier for your next invoice. Each invoice uses a different key, so the public board cannot link your invoices.</p>
        {/* HNK-34 E2E (finding 4): the whole key, so it can also be handed over by hand: the
            supplier's "Buyer key" field takes these 64 hex characters */}
        <div className="by-keyhex">
          <span className="by-keyhex-k">{`Your invoice key #${k}`}</span>
          <code className="by-keyhex-v">
            {invoicePk}
          </code>
          <Button
            secondary
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invoicePk);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="by-keyhex-or">Copy it to the supplier yourself, or send it sealed to the supplier's mailbox:</p>
        <label className="field">
          <span>The supplier's contact card</span>
          <textarea rows={2} spellCheck="false" placeholder="the supplier's jitsuin-contact-v1:…" ref={card} />
        </label>
        <div className="actions rp-small">
          <Button
            secondary
            onClick={async () => {
              try {
                const c = await takeContact(card.current!.value, "supplier");
                const hd = draft("key.invoice_pk", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, c.mailbox_pk, relayDeps, { body: { invoice_pk: invoicePk } });
                const withSigner = { ...hd, signer: invoicePk } as Header;
                const m = await account.stamp();
                const r = json<{ signer: string; sig: string }>(wasm.buyerMessageSignBytes(m, k, signingBytes(withSigner)));
                if (r.signer !== invoicePk) throw new Error("this key is not your invoice key");
                await send(c.mailbox_pk, await encodeMessage({ ...withSigner, sig: r.sig }), relayDeps);
                out.show(<Banner kind="ok" title="Key sent" text={`Sealed to the supplier's mailbox: it fills the invoice's buyer line there. Key #${k}.`} />);
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Send this key to the supplier
          </Button>
        </div>
        {out.el}
      </div>
    </details>
  );
}

const STATIONS = [
  { glyph: "受", label: "Checked with its PDF" },
  { glyph: "署", label: "Signed" },
  { glyph: "送", label: "Sent to the supplier" },
  { glyph: "印", label: "Letter sealed" },
  { glyph: "払", label: "Paid at maturity" },
];

/** What the route caption says after the invoice number, by what the invoice waits for. */
const ROUTE_CAP: Record<BuyerAction, string> = {
  sign: "checked, not signed. Read every field on the sheet, then sign.",
  send: "signed. Send the signature to the supplier.",
  "wait-letter": "signed, sent to the supplier. The supplier offers the invoice to a financier next.",
  seal: "the financier's letter and the supplier's seal are here. Read the letter, then seal.",
  "wait-financier": "you sealed the letter. The financier seals it when it pays the advance.",
  pay: "the financier sealed the letter and paid the supplier. Pay at maturity on the slip.",
  settled: "settled. The bundle is kept on this device: it proves the whole deal to anyone, on the Verify page.",
};

const TAG: Record<BuyerAction, [string, "act" | "done" | ""]> = {
  sign: ["Sign", "act"],
  send: ["Send the signature", "act"],
  "wait-letter": ["Waiting for a financier's letter", ""],
  seal: ["Seal the letter", "act"],
  "wait-financier": ["Waiting for the financier's seal", ""],
  pay: ["Pay", "act"],
  settled: ["Settled", "done"],
};

const dueWords = (days: number) => (days < 0 ? `${plural(-days, "day")} past due` : days === 0 ? "due today" : `in ${plural(days, "day")}`);

const OUTCOME: Record<string, [string, string, string]> = {
  PaidOnTime: ["済", "paid on time", ""],
  PaidLate: ["遅", "paid late", "is-late"],
  Default: ["滞", "not paid past due", "is-late"],
  Open: ["待", "open, not due yet", "is-open"],
};

type Note = { kind: "ok" | "warn" | "bad"; title?: string; text: string };
const NOTE_GLYPH = { ok: "認", warn: "待", bad: "拒" } as const;

interface InvoiceFields {
  invoice_id: string;
  amount_zat: number;
  issue_date: number;
  due_date: number;
  buyer_pk: string;
  supplier_pk: string;
  terms_hash: string;
  nullifier: string;
}
interface LetterFields {
  financier_pk: string;
  financier_address: string;
  amount_zat: number;
  due_date: number;
  terms_hash: string;
  matches_invoice: boolean | null;
}

export function BuyerPage(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLInputElement>(null);
  const cInv = useRef<Area>(null);
  const cTerms = useRef<HTMLInputElement>(null);
  const cLetter = useRef<Area>(null);
  const cSeal = useRef<Area>(null);
  const cLpdf = useRef<HTMLInputElement>(null);
  const hInv = useRef<Area>(null);
  const hFin = useRef<Area>(null);
  const desk = useRef<HTMLDivElement>(null);
  const chain = useRef<HTMLDivElement>(null);
  const chainScroll = useRef<HTMLDivElement>(null);
  const keysOut = useOut();
  const signOut = useOut();
  const sealOut = useOut();
  const histOut = useOut();
  const payOut = useOut();
  const mineOut = useOut();
  useVars(root);

  // the codes behind the sheet, mirrored for drawing (the fields stay the source for every action)
  const [codes, setCodes] = useState({ inv: "", letter: "", seal: "" });
  const syncCodes = () => setCodes({ inv: v(cInv), letter: v(cLetter), seal: v(cSeal) });
  const [recs, setRecs] = useState<BuyerInvoice[] | "blocked" | null>(null);
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string | null> | null>(null);
  const [keyInfo, setKeyInfo] = useState<{ id: string; k: number; next: string } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [anchored, setAnchored] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [certs, setCerts] = useState<CertFields[]>([]);
  const [outcomes, setOutcomes] = useState<Record<number, string> | null>(null);
  const [requests, setRequests] = useState<Array<{ r: Received; about: string }>>([]);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  // 2. the invoice text that passed both checks (HNK-25.T1, BL-D22-06): signing stays off until then
  const [checked, setChecked] = useState<string | null>(null);
  const [invCheck, setInvCheck] = useState<CheckResult | null>(null);
  const [signing, setSigning] = useState(false);
  // 3. the invoice, letter and supplier seal that passed the letter checks (HNK-32.T1, BL-D24-06)
  const [letterOk, setLetterOk] = useState<string | null>(null);
  const [letterRes, setLetterRes] = useState<LetterCheck[] | null>(null);
  const [sealing, setSealing] = useState(false);
  // 5. why the QR stays hidden (BL-S02-02); empty when the kept letter carries all three seals
  const [payWhy, setPayWhy] = useState<string[] | null>(null);
  const [payQr, setPayQr] = useState<{ svg: string; uri: string; payTo: string } | null>(null);
  const [press, setPress] = useState<"sig" | "seal" | null>(null);
  // the slip's countdown to the on-time cut-off, a minute at a time
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const first = useRef(true);

  // signing locks again whenever the invoice or its PDF changes; sealing whenever the letter, its
  // PDF or the supplier's seal changes; the QR goes with any change of invoice or letter
  useEffect(() => {
    const lockSign = () => {
      setChecked(null);
      setInvCheck(null);
    };
    const lockSeal = () => {
      setLetterOk(null);
      setLetterRes(null);
    };
    const onCode = () => {
      setPayQr(null);
      syncCodes();
    };
    const on: Array<[HTMLElement, string, () => void]> = [
      [cInv.current!, "input", lockSign],
      [cInv.current!, "input", lockSeal],
      [cInv.current!, "input", onCode],
      [cTerms.current!, "change", lockSign],
      [cLetter.current!, "input", lockSeal],
      [cLetter.current!, "input", onCode],
      [cSeal.current!, "input", lockSeal],
      [cSeal.current!, "input", onCode],
      [cLpdf.current!, "change", lockSeal],
    ];
    for (const [el, ev, f] of on) el.addEventListener(ev, f);
    return () => {
      for (const [el, ev, f] of on) el.removeEventListener(ev, f);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Puts an invoice (and its letter and the supplier's seal) behind the sheet. */
  const fill = (inv: string, letter = "", seal = "") => {
    setValue(cInv, inv);
    setValue(cLetter, letter);
    setValue(cSeal, seal);
    setValue(hInv, inv);
    setChecked(null);
    setInvCheck(null);
    setLetterOk(null);
    setLetterRes(null);
    setPayQr(null);
    setPress(null);
    signOut.clear();
    sealOut.clear();
    payOut.clear();
    syncCodes();
  };
  const open = (rec: BuyerInvoice, scroll = true) => {
    fill(rec.invoice, rec.assignment?.letter ?? "", rec.assignment?.supplier_seal ?? "");
    if (scroll) scrollTo(desk);
  };

  const reloadHistory = async () => {
    try {
      setCerts((await loadHistory()).certs.map(certFields));
    } catch {
      setCerts([]);
    }
  };

  // ---------- keys and history ----------
  const showKey = async () => {
    try {
      let hist = await loadHistory();
      let k = localNextIndex(hist);
      const m = await account.stamp();
      const said: Note[] = [];
      try {
        const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
        // the relay copy first: another device may have issued newer certificates
        let restored = 0;
        let relayUnread: unknown = null;
        try {
          const remote = await relayHistory();
          if (remote) {
            const r = reconcile(hist, remote, id);
            if (r.kind === "restored") {
              hist = r.doc;
              k = localNextIndex(hist);
              restored = r.added;
            } else if (r.kind === "relay-behind") {
              await backupHistory(hist);
              said.push({ kind: "warn", title: "The relay's copy of your history was behind.", text: `It held ${plural(remote.certs.length, "certificate")}; this device has ${hist.certs.length}. The copy is updated now. If you did not remove anything yourself, the relay lost or held back your newest certificate.` });
            } else if (r.kind === "diverged") {
              said.push({ kind: "bad", title: "Your history on the relay differs from this device.", text: "The two copies disagree about an earlier certificate. This device keeps its own; do not issue a new certificate until you know which device holds your real history." });
            }
          } else if (hist.certs.length) {
            await backupHistory(hist);
          }
        } catch (e) {
          relayUnread = e; // said below, unless the board shows there is nothing it could hold
        }
        // HNK-34 E2E (finding 3): "no copy yet" (404) is normal and says nothing; a copy that could
        // not be read is said calmly, and not at all for a first-time buyer whose board check shows
        // no certificate anywhere (the copy could only hold what the board would show).
        const unreadNote = (): Note => ({ kind: "warn", title: "Your history backup was not read this time.", text: `${backupProblem(relayUnread)} This device's own copy is used; nothing is lost, and the backup is read again the next time you show your key.` });
        const boardJson = (await board.current!.files?.[0]?.text()) ?? (await loadBoard((u, i) => fetch(u, i)).catch(() => undefined))?.json;
        if (boardJson) {
          const r = json<{ next_index: number; dropped: number[]; successor_on_board: boolean }>(wasm.historyNext(JSON.stringify(hist.certs), id, boardJson));
          // E2E audit 2026-10-25: a certificate not on the board yet is dropped only when its deal
          // is over; one that may still be registered keeps its index (freeable)
          const loose = r.dropped.length ? freeable(hist.certs.map(certFields), r.dropped, registeredNs(boardJson), today()) : { drop: [], pending: [] };
          if (loose.drop.length) {
            hist = dropTail(hist, loose.drop);
            await saveHistory(hist);
            said.push({ kind: "warn", title: "Unused certificate removed.", text: `Certificate${loose.drop.length > 1 ? "s" : ""} #${loose.drop.join(", #")} never reached the board and ${loose.drop.length > 1 ? "their deals are" : "its deal is"} over (the invoice went to the board without it, or is past due), so the number is free again.` });
          }
          if (loose.pending.length) {
            const many = loose.pending.length > 1;
            said.push({ kind: "warn", title: `Certificate${many ? "s" : ""} not on the board yet.`, text: `Certificate${many ? "s" : ""} #${loose.pending.join(", #")} ${many ? "are" : "is"} not on the board, but ${many ? "their invoices are" : "its invoice is"} not registered and not due: the financier may still register ${many ? "them" : "it"}. ${many ? "They are" : "It is"} kept, so your next key comes after ${many ? "them" : "it"}. Reusing the number could anchor two invoices at one place in your history, which no financier accepts afterwards.` });
          }
          // restored certificates passed historyNext (signatures, links, anchors): keep them
          if (restored && !loose.drop.length) await saveHistory(hist);
          if (restored) said.push({ kind: "ok", title: "History restored from the relay.", text: `${restored} newer certificate${restored === 1 ? "" : "s"} from your other device, checked against the board.` });
          successorOnBoard = r.successor_on_board;
          if (relayUnread !== null && (hist.certs.length > 0 || r.next_index > 0 || successorOnBoard)) said.unshift(unreadNote());
          setBlocked(successorOnBoard);
          // the anchored certificates, then the kept ones whose deals may still register
          k = r.next_index + loose.pending.length;
          setAnchored(r.next_index);
          said.push(
            successorOnBoard
              ? { kind: "bad", title: "Your history is ahead of this device.", text: `The board already holds a certificate after #${r.next_index - 1 < 0 ? "start" : r.next_index - 1} that this device does not have. Do not issue a new certificate here: it would fork your history. Open this page on the device that issued it; its copy reaches the relay and comes back here.` }
              : { kind: "ok", title: "History checked against the board.", text: `${plural(r.next_index, "certificate")} anchored.` },
          );
        } else {
          if (relayUnread !== null) said.push(unreadNote());
          if (restored) {
            hist = await loadHistory(); // an unchecked relay copy is not used
            k = localNextIndex(hist);
            said.push({ kind: "warn", text: `The relay holds ${restored} newer certificate${restored === 1 ? "" : "s"}; add board data to check and restore them.` });
          }
          said.push({ kind: "warn", title: "Not checked against the board.", text: "Add board data to check which certificates are anchored." });
        }
        const next = json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk;
        setKeyInfo({ id, k, next });
        setNotes(said);
        keysOut.clear();
        void reloadHistory();
      } finally {
        m.fill(0);
      }
    } catch (e) {
      keysOut.error(e);
    }
  };

  // ---------- sign the invoice ----------
  const checkIt = async () => {
    try {
      setChecked(null);
      setInvCheck(null);
      signOut.clear();
      const invoice = v(cInv);
      const f = json<Record<string, string | number>>(wasm.invoiceDecode(invoice));
      const file = cTerms.current!.files?.[0];
      const hash = file ? await fileHash(file) : null;
      const keyIndex = await findKeyIndex(invoice);
      const r = checkInvoice({ termsHash: String(f.terms_hash), fileHash: hash, keyIndex });
      if (keyIndex !== null) {
        const d = { nullifier: String(f.nullifier), invoice_id: String(f.invoice_id), amount_zat: Number(f.amount_zat), due_date: Number(f.due_date) };
        const p = pending.get(d.nullifier);
        await saveInvoice((prev) => ({ ...invoiceRecord(d, invoice, keyIndex, r.canSign, Date.now(), prev), ...(p ? { reply_to: p.replyTo } : {}) }), d.nullifier);
        void refreshInvoices();
      }
      setInvCheck(r);
      if (r.canSign) setChecked(invoice);
    } catch (e) {
      signOut.error(e);
    }
  };
  const signIt = async () => {
    setSigning(true);
    try {
      if (checked === null || checked !== v(cInv)) throw new Error("check the invoice first");
      const c = checked;
      const f = json<Record<string, string | number>>(wasm.invoiceDecode(c));
      const sig = await withInvoiceIndex(c, (m, k) => wasm.buyerSignInvoiceBytes(m, k, c));
      await saveInvoice((prev) => {
        if (!prev) throw new Error("check the invoice first");
        return withSignature(prev, sig);
      }, String(f.nullifier));
      const n = String(f.nullifier);
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(n));
      const replyTo = rec?.reply_to ?? pending.get(n)?.replyTo;
      setPress("sig");
      signOut.show(<SendSignature n={n} sig={sig} replyTo={replyTo} sent={() => void refreshInvoices()} />);
      void refreshInvoices();
    } catch (e) {
      signOut.error(e);
    } finally {
      setSigning(false);
    }
  };

  // ---------- seal the letter ----------
  const letterKey = () => [v(cInv), v(cLetter), v(cSeal)].join("|");
  const checkLetter = async () => {
    try {
      setLetterOk(null);
      setLetterRes(null);
      sealOut.clear();
      const invoice = v(cInv);
      const letter = v(cLetter);
      const s0 = v(cSeal);
      const f = json<LetterFields>(wasm.assignmentDecode(letter, invoice));
      // a letter that came through the mailbox brings its PDF; a chosen file wins
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(invoice)).nullifier;
      const a = (await account.current?.store?.get<BuyerInvoice>(storeId(n)))?.assignment;
      const arrived = a?.letter === letter && a.pdf ? new File([Uint8Array.from(atob(a.pdf), (c) => c.charCodeAt(0))], "letter.pdf", { type: "application/pdf" }) : undefined;
      const file = cLpdf.current!.files?.[0] ?? arrived;
      let supplierSeal: string | null = null;
      try {
        supplierSeal = s0 ? wasm.assignmentStatus(invoice, letter, JSON.stringify([s0])) : null;
      } catch {
        supplierSeal = null;
      }
      const input = { matchesInvoice: f.matches_invoice, termsHash: f.terms_hash, fileHash: file ? await fileHash(file) : null, supplierSeal };
      setLetterRes(letterChecks(input));
      if (!letterProblems(input).length) setLetterOk(letterKey());
    } catch (e) {
      sealOut.error(e);
    }
  };
  const sealIt = async () => {
    setSealing(true);
    try {
      if (letterOk === null || letterOk !== letterKey()) throw new Error("check the letter first");
      const seal = await withInvoiceIndex(v(cInv), (m, k) => wasm.buyerSealAssignmentBytes(m, k, v(cInv), v(cLetter), v(cSeal)));
      // HNK-26.T16: when the letter came through the mailbox, the seal goes back the same way
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(v(cInv))).nullifier;
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(n));
      const a = rec?.assignment;
      const to = a && a.letter === v(cLetter) ? [a.financier_mailbox, a.supplier_mailbox].filter((x): x is string => !!x) : [];
      for (const t of to) {
        const hd = draft("deal.seal", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n, body: { seal, index: 1 } });
        await send(t, await encodeMessage(hd as Header), relayDeps);
      }
      setPress("seal");
      if (to.length && rec) {
        await saveInvoice((prev) => ({ ...(prev ?? rec), assignment: { ...a, buyer_seal: seal, sealed_at: Date.now() } }), n);
        sealOut.show(<Banner kind="ok" title="Sealed and sent" text="Your seal went to the financier and the supplier. The financier pays the advance next, with its own seal." glyph="印" />);
        void refreshInvoices();
      } else sealOut.show(<CodeBlock label="Your seal: send it to the financier" value={seal} filename="buyer.seal.txt" />);
    } catch (e) {
      sealOut.error(e);
    } finally {
      setSealing(false);
    }
  };

  // ---------- history certificate ----------
  const issue = async () => {
    try {
      if (successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates before issuing a new one");
      const hist = await loadHistory();
      const next = localNextIndex(hist);
      const { cert, k } = await withInvoiceIndex(v(hInv), (m, k) => {
        if (k !== next) {
          m.fill(0);
          throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
        }
        return { cert: wasm.buyerHistoryCertBytes(m, k, v(hInv), v(hFin), head(hist)), k };
      });
      await saveHistory(append(hist, k, cert));
      void reloadHistory();
      histOut.show(<CodeBlock label={`Certificate #${k}: give it to the financier (this device keeps a copy)`} value={cert} filename={`history-${k}.cert.txt`} />);
    } catch (e) {
      histOut.error(e);
    }
  };

  // ---------- pay ----------
  // HNK-32.T2 (BL-D25-01): only the letter this device kept, with all three seals, is paid
  const payCheck = async (): Promise<string[]> => {
    const n = json<{ nullifier: string }>(wasm.invoiceDecode(v(cInv))).nullifier;
    const a = (await account.current?.store?.get<BuyerInvoice>(storeId(n)))?.assignment;
    const seals = [a?.supplier_seal, a?.buyer_seal, a?.financier_seal].filter((x): x is string => !!x);
    let status: string | null = null;
    try {
      status = a?.letter && seals.length === 3 ? wasm.assignmentStatus(v(cInv), a.letter, JSON.stringify(seals)) : null;
    } catch {
      status = null;
    }
    return payProblems({ kept: a?.letter, letter: v(cLetter), seals: seals.length, status });
  };
  useEffect(() => {
    if (!codes.inv || !codes.letter) return setPayWhy(null);
    let live = true;
    payCheck().then(
      (p) => live && setPayWhy(p),
      (e) => live && setPayWhy([e instanceof Error ? e.message : String(e)]),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, recs]);
  const pay = async () => {
    try {
      const problems = await payCheck();
      if (problems.length) throw new Error(problems[0]);
      const payTo = json<{ financier_address: string }>(wasm.assignmentDecode(v(cLetter), v(cInv))).financier_address;
      const r = json<{ uri: string; qr_svg: string }>(await withInvoiceIndex(v(cInv), (m, k) => wasm.buyerRepaymentBytes(m, k, v(cInv), v(cLetter), today())));
      setPayQr({ svg: r.qr_svg, uri: r.uri, payTo });
      payOut.clear();
    } catch (e) {
      payOut.error(e);
    }
  };

  // ---------- the inbox ----------
  // a sign request lays the invoice and its PDF on the desk (HNK-23.T7)
  const fromInbox: InboxAction = {
    label: "Open the invoice",
    keep: true,
    run: async (r) => {
      const hd = r.message.header;
      const invoice = String(hd.body.invoice);
      const f = json<{ supplier_pk: string; nullifier: string; invoice_id: string }>(wasm.invoiceDecode(invoice));
      if (hd.n !== f.nullifier) throw new Error("the message names another invoice than the one it carries");
      if (!(await verifyHeader(hd, f.supplier_pk))) throw new Error("not signed by this invoice's supplier key");
      const pdf = r.message.attachments[0];
      pending.set(f.nullifier, { replyTo: hd.from.mailbox_pk, relayId: r.relayId });
      fill(invoice);
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(pdf)], hd.attachments[0]?.name ?? `${f.invoice_id}.pdf`, { type: "application/pdf" }));
      cTerms.current!.files = dt.files;
      cTerms.current!.dispatchEvent(new Event("change", { bubbles: true }));
      scrollTo(desk);
      return `${f.invoice_id} is on the desk with its PDF. Check it, then sign.`;
    },
  };
  const keepAssignment = (label: string, take: (hd: Received["message"]["header"], files: Uint8Array[], rec: BuyerInvoice) => Promise<NonNullable<BuyerInvoice["assignment"]>>): InboxAction => ({
    label,
    run: async (r) => {
      const hd = r.message.header;
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
      if (!rec) throw new Error("no invoice on this device has this fingerprint N");
      const add = await take(hd, r.message.attachments, rec);
      const next = { ...rec, assignment: { ...rec.assignment, ...add } };
      await saveInvoice(() => next, rec.n);
      // HNK-26.T16: the letter from the financier's node and the supplier's seal go on the desk
      open(next);
      void refreshInvoices();
      return next.assignment.financier_seal
        ? `${rec.invoice_id}: the financier sealed the letter and paid the supplier. Pay at maturity on its slip.`
        : next.assignment.letter && next.assignment.supplier_seal
          ? `${rec.invoice_id}: the letter and the supplier's seal are on the desk. Read the letter, then seal.`
          : `${rec.invoice_id}: kept. Sealing waits for ${next.assignment.letter ? "the supplier's seal" : "the financier's letter"}.`;
    },
  });
  // HNK-26.T8: a financier asks for this buyer's history before it registers the invoice
  const historyRequest: InboxAction = {
    label: "Send my history",
    // BL-D26-02: who asks, for which invoice, before the buyer agrees; declining is not answering
    describe: async (r) => {
      const hd = r.message.header;
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
      const known = (await account.current?.store?.list<{ mailbox_pk: string; username?: string; fingerprint: string }>())?.find((x) => x.id === `contact:${hd.from.mailbox_pk}`)?.doc;
      const who = known ? `${known.username ? `@${known.username}` : "A financier"} (fingerprint ${known.fingerprint})` : `A financier you have no card for (key ${String(hd.body.financier_pk).slice(0, 10)}…)`;
      const what = rec ? `${rec.invoice_id}, ${zatToZec(rec.amount_zat)} ZEC due ${daysToDate(rec.due_date)}` : "an invoice this device does not hold";
      const about = `${who} asks for your payment history before financing ${what}. Sending shows how your earlier invoices were paid, not who they were with. To decline, do nothing: no answer is sent.`;
      // the request also hangs off the chain as a branch (HNK-34.T5)
      setRequests((all) => (all.some((x) => x.r.relayId === r.relayId) ? all : [...all, { r, about }]));
      return about;
    },
    run: async (r) => {
      const hd = r.message.header;
      const fin = String(hd.body.financier_pk);
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
      if (!rec) throw new Error("no invoice on this device has this fingerprint N");
      if (!rec.signature) throw new Error("you have not signed this invoice: there is nothing to finance");
      if (successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates first");
      let hist = await loadHistory();
      let index = rec.history_cert?.financier_pk === fin ? rec.history_cert.index : null;
      let identity = "";
      if (index === null || index >= hist.certs.length) {
        const next = localNextIndex(hist);
        const made = await withInvoiceIndex(rec.invoice, (m, k) => {
          const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
          if (k !== next) {
            m.fill(0);
            throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
          }
          return { cert: wasm.buyerHistoryCertBytes(m, k, rec.invoice, fin, head(hist)), k, id };
        });
        hist = append(hist, made.k, made.cert);
        await saveHistory(hist);
        index = made.k;
        identity = made.id;
        await saveInvoice((prev) => ({ ...(prev ?? rec), history_cert: { index: made.k, financier_pk: fin } }), rec.n);
      }
      const certsOut = hist.certs.slice(0, index + 1);
      const hdOut = draft("history.chain", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, hd.from.mailbox_pk, relayDeps, {
        n: rec.n,
        body: identity ? { certs: certsOut, identity_pk: identity } : { certs: certsOut },
      });
      await send(hd.from.mailbox_pk, await encodeMessage(hdOut as Header), relayDeps);
      void reloadHistory();
      const said = `Your history (${certsOut.length - 1} earlier invoice${certsOut.length === 2 ? "" : "s"} and the certificate for ${rec.invoice_id}) went to the financier. It checks them on the board; the supplier signs the entry next.`;
      setAnswered((x) => ({ ...x, [r.relayId]: said }));
      return said;
    },
  };
  const handlers: Record<string, InboxAction> = {
    "invoice.sign_request": fromInbox,
    "deal.letter": keepAssignment("Keep the letter", async (hd, files, rec) => {
      const letter = String(hd.body.letter);
      const f = json<{ financier_pk: string; terms_hash: string; matches_invoice: boolean | null }>(wasm.assignmentDecode(letter, rec.invoice));
      if (f.matches_invoice !== true) throw new Error("this letter is for another invoice");
      if (f.financier_pk !== hd.signer) throw new Error("the letter was not sent by the financier it names");
      if (!files[0] || (await fileHash(new File([new Uint8Array(files[0])], "letter.pdf"))) !== f.terms_hash) throw new Error("the PDF is not the letter's document");
      return { letter, pdf: btoa(Array.from(files[0], (x) => String.fromCharCode(x)).join("")), financier_pk: f.financier_pk, financier_mailbox: hd.from.mailbox_pk };
    }),
    "deal.seal": keepAssignment("Keep the seal", async (hd, _files, rec) => {
      if (hd.from.role === "supplier" && hd.body.index === 0) return { supplier_seal: String(hd.body.seal), supplier_mailbox: hd.from.mailbox_pk };
      // HNK-25.T4: the financier's seal completes the letter; checked against the whole chain
      const a = rec.assignment;
      if (hd.from.role === "financier" && hd.body.index === 2 && a?.letter && a.supplier_seal && a.buyer_seal) {
        const s2 = String(hd.body.seal);
        if (wasm.assignmentStatus(rec.invoice, a.letter, JSON.stringify([a.supplier_seal, a.buyer_seal, s2])) !== "Sealed") throw new Error("this seal does not complete your letter");
        return { financier_seal: s2 };
      }
      throw new Error("not a seal this device expects for this invoice");
    }),
    "history.request": historyRequest,
    // buyer-late: the financier's node reminds at D-7, D-1 and D+1; the slip says the rest
    "deal.reminder": {
      label: "Open the slip",
      describe: async (r) => {
        const hd = r.message.header;
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        if (!rec) return "A reminder for an invoice this device does not hold.";
        const s = lateState(rec, today());
        return s.kind === "due-soon" || s.kind === "overdue" ? `The financier reminds you: ${reminderText({ invoice_id: rec.invoice_id, state: s }, `${zatToZec(rec.amount_zat)} ZEC`)}` : `The financier's reminder for ${rec.invoice_id}, due ${daysToDate(rec.due_date)}.`;
      },
      run: async (r) => {
        const hd = r.message.header;
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        if (!rec) throw new Error("no invoice on this device has this fingerprint N");
        if (!rec.assignment?.financier_pk || rec.assignment.financier_pk !== hd.signer) throw new Error("not from the financier your letter names");
        if (hd.body.due_date !== rec.due_date || hd.body.amount_zat !== rec.amount_zat) throw new Error("the reminder names another due date or amount than your invoice");
        open(rec);
        return `${rec.invoice_id} is on the desk: its payment slip is below the letter.`;
      },
    },
    "deal.bundle": {
      label: "Keep the settlement bundle",
      run: async (r) => {
        const hd = r.message.header;
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        if (!rec) throw new Error("no invoice on this device has this fingerprint N");
        if (rec.assignment?.financier_pk !== hd.signer) throw new Error("not from the financier your letter names");
        const bundle = String(hd.body.bundle);
        const vb = json<{ nullifier: string }>(wasm.verifyBundle(bundle));
        if (vb.nullifier !== rec.n) throw new Error("this bundle is for another invoice");
        await saveInvoice((prev) => ({ ...(prev ?? rec), bundle }), rec.n);
        void refreshInvoices();
        return `${rec.invoice_id} is settled. The bundle is kept on this device: it proves the whole deal to anyone, on the Verify page.`;
      },
    },
  };
  /** The branch's button: the same answer as the inbox's, then the request leaves the mailbox. */
  const answer = async (r: Received) => {
    try {
      await historyRequest.run(r);
      const s = account.current;
      if (s) await discard(s.inbox, r.relayId, relayDeps).catch(() => undefined); // expires anyway
    } catch (e) {
      setAnswered((x) => ({ ...x, [r.relayId]: `Not sent: ${e instanceof Error ? e.message : String(e)}` }));
    }
  };

  // ---------- the invoices received on this device, newest first ----------
  // HNK-25.T7 (BL-D25-09): each signed invoice against the board, with what this device holds
  // (the settlement bundle when the financier sent it, else the invoice, letter and seals)
  const onBoard = (rec: BuyerInvoice, boardJson: string | undefined): string | null => {
    if (!boardJson || !rec.signature) return null;
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
  };
  const refreshInvoices = async () => {
    if (!account.current?.store) return setRecs("blocked");
    const list = await loadInvoices();
    setRecs(list);
    if (first.current) {
      first.current = false;
      if (list.length && !v(cInv)) open(list[0], false);
    }
    const b = await loadBoard((u, i) => fetch(u, i)).catch(() => undefined);
    if (b) setBoardData(b);
    setStatuses(b ? Object.fromEntries(list.map((r) => [r.n, onBoard(r, b.json)])) : null);
  };
  useEffect(() => {
    void refreshInvoices().catch(() => setRecs([]));
    void reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HNK-25.T6 (BL-D26-09): my history as financiers see it, checked against the board here; the
  // financiers named in my own certificates count, so every outcome shows
  const checkMine = async () => {
    try {
      const hist = await loadHistory();
      if (!hist.certs.length) return mineOut.show(<p className="hint">No certificate yet: your history starts with the first invoice a financier finances.</p>);
      const fields = hist.certs.map(certFields);
      setCerts(fields);
      const b = await loadBoard((u, i) => fetch(u, i));
      setBoardData(b);
      const allow = [...new Set(fields.map((f) => f.financier_pk))];
      const r = json<{ on_time: number; late: number; defaults: number; open: number; lines: Array<{ index: number; due_date: number; outcome: string }> }>(
        wasm.verifyHistory(JSON.stringify(hist.certs), fields[0].identity_pk, JSON.stringify(allow), b.json, today(), 7),
      );
      setOutcomes(Object.fromEntries(r.lines.map((l) => [l.index, l.outcome])));
      mineOut.show(<Banner kind={r.defaults ? "bad" : "ok"} title={`${r.on_time} on time · ${r.late} late · ${r.open} open · ${r.defaults} defaulted`} text={`Checked against the ${b.source} board up to block ${b.tip}.`} glyph={r.defaults ? "滞" : "済"} />);
    } catch (e) {
      mineOut.error(e);
    }
  };

  // the chain lands when it comes into view
  useEffect(() => {
    const el = chain.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // the newest end of the chain is what matters now
  useEffect(() => {
    const sc = chainScroll.current;
    if (sc) sc.scrollLeft = sc.scrollWidth;
  }, [certs.length, requests.length]);

  // ---------- what the desk shows ----------
  const list = Array.isArray(recs) ? recs : [];
  const dec = useMemo(() => {
    try {
      return codes.inv ? json<InvoiceFields>(wasm.invoiceDecode(codes.inv)) : null;
    } catch {
      return null;
    }
  }, [codes.inv]);
  const lf = useMemo(() => {
    try {
      return dec && codes.letter ? json<LetterFields>(wasm.assignmentDecode(codes.letter, codes.inv)) : null;
    } catch {
      return null;
    }
  }, [codes, dec]);
  const rec = dec ? list.find((r) => r.n === dec.nullifier) : undefined;
  const act = rec ? nextAction(rec) : null;
  const kept = !!rec?.assignment?.letter && rec.assignment.letter === codes.letter;
  const mode: "none" | "invoice" | "letter" = !dec ? "none" : codes.letter ? "letter" : "invoice";
  const side: "sign" | "seal" | "done" = mode === "letter" ? (kept && rec?.assignment?.buyer_seal ? "done" : "seal") : "sign";
  const done = rec ? routeDone(rec) : [false, false, false, false, false];
  const nextSt = done.indexOf(false);
  const routeCap = !dec ? null : rec && act ? (act === "wait-letter" && !rec.signature_sent_at ? "signed. Give the supplier your signature; it offers the invoice to a financier next." : ROUTE_CAP[act]) : "not checked on this device yet. Check it with its PDF, then sign.";
  const seals = {
    supplier: !!(rec?.assignment?.supplier_seal || codes.seal),
    buyer: !!(kept && rec?.assignment?.buyer_seal),
    financier: !!(kept && rec?.assignment?.financier_seal),
  };
  const sCount = Number(seals.supplier) + Number(seals.buyer) + Number(seals.financier);
  const paid = !!rec?.bundle;
  const ready = !!payWhy && payWhy.length === 0 && !paid;
  const daysLeft = dec ? dec.due_date - today() : 0;
  const status = rec && statuses ? statuses[rec.n] : null;

  const totals = buyerTotals(list, statuses, today());
  const due = reminders(list, today());
  const late = rec ? lateState(rec, today(), status) : ({ kind: "none" } as const);

  const invoiceSheet = dec ? (
    <article className="by-sheet" key={`i-${dec.nullifier}`} aria-label={`Invoice ${dec.invoice_id}`}>
      <div className="by-s-head">
        <p className="by-s-title" lang="ja">
          請求書<small>{`Invoice${rec ? ` · sent to your key #${rec.key_index}` : ""}`}</small>
        </p>
        <p className="by-s-no">
          No.<b>{dec.invoice_id}</b>
          {`Issued ${daysToDate(dec.issue_date)}`}
        </p>
      </div>
      <p className="by-s-to">
        <span className="mono">{short(dec.buyer_pk, 8, 8)}</span>
        <b lang="ja">御中</b>
        {rec ? `to your invoice key #${rec.key_index}` : "to the buyer key it names"}
      </p>
      <dl className="by-s-rows">
        <div className="is-amt">
          <dt lang="ja">
            ご請求金額<small>Amount due</small>
          </dt>
          <dd>
            {zatToZec(dec.amount_zat)}
            <small>ZEC</small>
          </dd>
        </div>
        <div>
          <dt lang="ja">
            支払期日<small>Due</small>
          </dt>
          <dd>{daysToDate(dec.due_date)}</dd>
        </div>
        <div>
          <dt lang="ja">
            条件<small>Terms, SHA-256 of the PDF</small>
          </dt>
          <dd>
            <span className="mono">{dec.terms_hash}</span>
          </dd>
        </div>
        <div>
          <dt lang="ja">
            発行者<small>Issuer key</small>
          </dt>
          <dd>
            <span className="mono">{short(dec.supplier_pk, 10, 6)}</span>
          </dd>
        </div>
      </dl>
      <div className="by-s-n">
        <b>N</b>
        <span className="mono">{dec.nullifier}</span>
      </div>
      <div className="by-seals" aria-label="Signature">
        <Seal g="売" lbl="発行者" on label="Issued by the supplier" />
        <Seal g="買" lbl="受領印" on={!!rec?.signature} press={press === "sig"} label={rec?.signature ? "Signed by you" : "Your signature: not yet"} />
        <Seal g="融" lbl="融資" on={false} wait label="Financier: after you sign" />
      </div>
    </article>
  ) : (
    <article className="by-sheet is-blank" aria-label="No invoice open">
      <div className="by-s-head">
        <p className="by-s-title" lang="ja">
          請求書<small>No invoice open yet</small>
        </p>
      </div>
      <p className="by-blank">Invoices addressed to your keys arrive in your inbox below; open one, or pick one from your invoices. An invoice code you were given by hand goes in the codes behind this sheet.</p>
    </article>
  );

  const letterSheet =
    dec && lf ? (
      <article className="by-sheet" key={`l-${dec.nullifier}`} aria-label={`Assignment letter for ${dec.invoice_id}`}>
        <div className="by-s-head">
          <p className="by-s-title is-long" lang="ja">
            債権譲渡通知書<small>{`Assignment letter for ${dec.invoice_id}`}</small>
          </p>
          <p className="by-s-no">
            From the financier<b>{short(lf.financier_pk, 8, 6)}</b>
          </p>
        </div>
        <p className="hint by-s-intro">From now on you pay the financier below, at this address, and nobody else.</p>
        <dl className="by-s-rows">
          <div>
            <dt lang="ja">
              譲受人<small>Financier</small>
            </dt>
            <dd>
              <span className="mono">{lf.financier_pk}</span>
            </dd>
          </div>
          <div>
            <dt lang="ja">
              支払先<small>You pay at</small>
            </dt>
            <dd>
              <span className="mono">{lf.financier_address}</span>
            </dd>
          </div>
          <div className="is-amt">
            <dt lang="ja">
              金額<small>Amount</small>
            </dt>
            <dd>
              {zatToZec(lf.amount_zat)}
              <small>ZEC</small>
            </dd>
          </div>
          <div>
            <dt lang="ja">
              支払期日<small>Due</small>
            </dt>
            <dd>{daysToDate(lf.due_date)}</dd>
          </div>
          <div>
            <dt lang="ja">
              文書<small>{kept && rec?.assignment?.pdf ? "Letter document (SHA-256, checked)" : "Letter document (SHA-256)"}</small>
            </dt>
            <dd>
              <span className="mono">{lf.terms_hash}</span>
            </dd>
          </div>
        </dl>
        {kept && rec?.assignment?.pdf ? (
          <div className="actions rp-small by-s-pdf">
            <Button
              secondary
              onClick={() => {
                const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(rec.assignment!.pdf!), (c) => c.charCodeAt(0))], { type: "application/pdf" }));
                window.open(url, "_blank", "noopener");
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              }}
            >
              Read the letter (PDF)
            </Button>
          </div>
        ) : null}
        <div className="by-seals" aria-label={`Seals on the letter: ${sCount} of 3`}>
          <Seal g="売" lbl="譲渡人" on={seals.supplier} label={seals.supplier ? "Supplier sealed" : "Supplier: not yet"} />
          <Seal g="買" lbl="債務者" on={seals.buyer} press={press === "seal"} label={seals.buyer ? "You sealed" : "You: after the checks"} />
          <Seal g="融" lbl="譲受人" on={seals.financier} wait label={seals.financier ? "Financier sealed, advance paid" : "Financier: seals when it pays the advance"} />
        </div>
      </article>
    ) : dec ? (
      <article className="by-sheet is-blank" aria-label="Letter not readable">
        <div className="by-s-head">
          <p className="by-s-title is-long" lang="ja">
            債権譲渡通知書<small>{`Assignment letter for ${dec.invoice_id}`}</small>
          </p>
        </div>
        <p className="by-blank">This letter code does not read with this invoice. Check the codes behind the sheet: the letter must name this invoice.</p>
      </article>
    ) : null;

  const slip =
    mode === "letter" && dec ? (
      <section className={`by-slip${paid ? " is-paid" : ""}`} aria-label="Payment slip">
        {paid ? (
          <span className="by-paid" lang="ja" role="img" aria-label="Settled">
            済
          </span>
        ) : null}
        <div className="by-slip-h">
          <b lang="ja">払込票</b>
          <span>{paid ? "Paid" : "Pay at maturity"}</span>
        </div>
        <div className="by-slip-body">
          <div className={`by-qr${payQr ? " is-open" : ""}`}>
            {payQr ? <TrustedSvg svg={payQr.svg} /> : null}
            <span className="by-veil" lang="ja" aria-hidden="true">
              {paid ? "済" : ready ? "印" : "待"}
            </span>
          </div>
          <dl className="by-slip-facts">
            <div>
              <dt>Amount</dt>
              <dd className="is-big">{`${zatToZec(dec.amount_zat)} ZEC`}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{`${daysToDate(dec.due_date)}${paid ? "" : ` · ${dueWords(daysLeft)}`}`}</dd>
            </div>
            <div>
              <dt>Pays the financier at</dt>
              <dd>
                <span className="mono">{seals.financier && lf ? short(payQr?.payTo ?? lf.financier_address, 22, 8) : "named by the sealed letter only"}</span>
              </dd>
            </div>
          </dl>
        </div>
        {dec && rec ? (
          <LatePanel
            state={late}
            cutoffMs={msToCutoff(dec.due_date, nowMs)}
            facts={{ inHistory: !!rec.history_cert, amount: `${zatToZec(dec.amount_zat)} ZEC`, due: daysToDate(dec.due_date), defaultFrom: daysToDate(dec.due_date + DEFAULT_GRACE_DAYS + 1) }}
          />
        ) : null}
        {paid ? (
          <div className={`by-why${late.kind === "paid" ? "" : " is-plain"}`}>
            {late.kind === "paid" ? (
              <span className="rp-hanko is-ok" lang="ja" aria-hidden="true">
                済
              </span>
            ) : null}
            <span>
              {`${dec.invoice_id} is settled. The bundle is kept on this device and proves the whole deal to anyone. `}
              <Button secondary onClick={async () => void (await navigator.clipboard.writeText(rec!.bundle!))}>
                Copy the bundle
              </Button>{" "}
              <a className="by-a" href="/verify">
                Check it in Verify
              </a>
            </span>
          </div>
        ) : payWhy && payWhy.length ? (
          <p className="by-why">
            <span className="rp-hanko" lang="ja" aria-hidden="true">
              待
            </span>
            <span>{`${payWhy[0].charAt(0).toUpperCase()}${payWhy[0].slice(1)}.`}</span>
          </p>
        ) : null}
        {paid ? null : (
          <div className="actions">
            <button type="button" disabled={!ready} onClick={() => void pay()}>
              Show payment QR
            </button>
            <span className="hint">{ready ? "Scan with a Zcash wallet. The payment is shielded; its memo carries your signed receipt and your claim, which the financier countersigns once the payment is on chain." : "The QR opens once the financier's seal is in your inbox: it seals the letter when it pays the advance."}</span>
          </div>
        )}
        {payQr ? (
          <div className="by-uri">
            <CodeBlock label="Payment request (ZIP-321)" value={payQr.uri} />
          </div>
        ) : null}
        {payOut.el}
      </section>
    ) : null;

  const pendingLines = (labels: string[], text: string) => labels.map((l, i) => <Check key={l} ok={null} label={l} text={text} i={i} />);
  const invLine = (label: string, value: string, i: number) => <Check key={label} ok={value === "not chosen" ? null : value.startsWith("matches") || value.startsWith("your") ? true : false} label={label} text={value} i={i} />;

  const sideSign = (
    <div className="by-side">
      <h3>Review and sign the invoice</h3>
      <p>Your signature confirms the trade happened. Check every field: this is what financiers rely on.</p>
      <ul className="by-checks" aria-label="Invoice checks">
        {invCheck ? [...invCheck.rows].reverse().map(([l, x], i) => invLine(l, x, i)) : pendingLines(["Addressed to", "Terms PDF"], "not checked yet")}
      </ul>
      {invCheck ? <Verdict kind={invCheck.kind} glyph={invCheck.kind === "ok" ? "認" : invCheck.kind === "warn" ? "待" : "拒"} title={invCheck.title} text={invCheck.text} /> : null}
      <div className="actions">
        <Button secondary onClick={checkIt}>
          Check invoice
        </Button>
        <button type="button" disabled={checked === null || signing} onClick={() => void signIt()}>
          Sign invoice
        </button>
      </div>
      {signOut.el}
      {rec?.signature_sent_at && !invCheck ? <Verdict kind="ok" glyph="送" title="Signature sent" text="Sealed to the supplier's mailbox. The supplier offers the invoice to a financier next." land={false} /> : null}
    </div>
  );

  const sideSeal = (
    <div className="by-side">
      <h3>Acknowledge the assignment</h3>
      <p>Sealing the letter is your written acknowledgment that you will pay the financier named in it at maturity. The financier pays the supplier only after this.</p>
      <ul className="by-checks" aria-label="Letter checks">
        {letterRes ? letterRes.map((c, i) => <Check key={c.label} ok={c.ok} label={c.label} text={c.text} i={i} />) : pendingLines(["Letter for this invoice", "PDF hash", "Supplier's seal"], "not checked yet")}
      </ul>
      {letterRes ? (
        letterRes.some((c) => c.problem) ? (
          <Verdict kind="bad" glyph="拒" title="Do not seal" text={`${letterRes.flatMap((c) => (c.problem ? [c.problem] : [])).join("; ")}.`} />
        ) : (
          <Verdict kind="ok" glyph="認" title="Letter checks out" text="Same invoice, the PDF is the letter's document, and the supplier sealed this letter for this financier." />
        )
      ) : null}
      <div className="actions">
        <Button secondary onClick={checkLetter}>
          Check letter
        </Button>
        <button type="button" disabled={letterOk === null || sealing} onClick={() => void sealIt()}>
          Seal as buyer
        </button>
      </div>
      {sealOut.el}
    </div>
  );

  const doneText: [string, string] =
    act === "settled"
      ? ["Paid and remembered", "Your repayment settled. The financier countersigned your claim and sent the settlement bundle; your history certificate for this invoice now reads it."]
      : act === "pay"
        ? ["Pay at maturity", "All three seals hold for the letter this device kept, so the slip names where you pay. Only that letter is paid: a pasted letter could name anyone's address."]
        : ["Letter sealed by you", `Your seal went to the financier and the supplier${rec?.assignment?.sealed_at ? ` on ${new Date(rec.assignment.sealed_at).toISOString().slice(0, 10)}` : ""}. When the financier pays the supplier the advance, it seals the letter too; that seal arrives in your inbox and opens the payment slip.`];
  const sideDone = (
    <div className="by-side">
      <h3>{doneText[0]}</h3>
      <p>{doneText[1]}</p>
      <ul className="by-checks" aria-label="Seals on the kept letter">
        <Check ok={seals.supplier || null} label="Supplier's seal" text="売 · index 0" i={0} />
        <Check ok={seals.buyer || null} label="Your seal" text="買 · index 1" i={1} />
        <Check ok={seals.financier || null} label="Financier's seal" text={seals.financier ? "融 · index 2, completes the letter" : "waiting in your inbox"} i={2} />
      </ul>
      {sealOut.el}
    </div>
  );

  const nextCert = keyInfo?.k ?? certs.length;
  const anchorLine = (i: number) => (anchored === null ? (outcomes && outcomes[i] ? "on the board" : "not checked yet") : i < anchored ? "anchored" : "not anchored yet");

  return (
    <Page wide>
      <div className="rp by" ref={root}>
        {/* ============ 1. the counter: who you are, the ledger | the open sheet ============ */}
        <section className="rp-sec" aria-labelledby="by-t">
          <div className="rp-cap">
            <p className="rp-eyebrow">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                買
              </span>
              Buyer's counter
            </p>
            <h1 id="by-t">Buyer</h1>
            <p className="rp-lede">Confirm the invoice, acknowledge who you will pay, and pay at maturity, all from keys only you hold.</p>

            <dl className="by-who" aria-label="Your keys">
              <div>
                <dt>{account.current?.demo ? "Your test key" : "Your passkey"}</dt>
                <dd className="by-fp">{account.current?.fingerprint ?? ""}</dd>
              </div>
              <div>
                <dt>Your identity key</dt>
                <dd>{keyInfo ? <span className="mono">{keyInfo.id}</span> : <span className="by-quiet">shown with your next invoice key</span>}</dd>
              </div>
              <div>
                <dt>Next invoice</dt>
                <dd>
                  {keyInfo ? (
                    <>
                      <b>{`#${keyInfo.k}`}</b>
                      {" in your history · key "}
                      <span className="mono">{short(keyInfo.next, 8, 8)}</span>
                    </>
                  ) : (
                    <span className="by-quiet">{`#${certs.length} on this device, before the board check`}</span>
                  )}
                </dd>
              </div>
            </dl>
            {notes.map((n, i) => (
              <div className={`by-keynote is-${n.kind}`} key={i} role={n.kind === "bad" ? "alert" : "status"}>
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  {NOTE_GLYPH[n.kind]}
                </span>
                <p>
                  {n.title ? <b>{n.title}</b> : null} {n.text}
                </p>
              </div>
            ))}
            <div className="by-keyrow">
              <Button secondary onClick={showKey}>
                Show my next invoice key
              </Button>
              <FilePill label="Board data (optional)" empty={`Board data (optional): live ${NET.noun} board`} inputRef={board} />
            </div>
            <p className="by-help">{`Without a file the live ${NET.noun} board is read (the last one this browser saw, or a bundled copy, if the node does not answer). Your keys come from your passkey; nothing secret is stored.`}</p>
            {keysOut.el}
            {keyInfo ? <ShareKey k={keyInfo.k} invoicePk={keyInfo.next} /> : null}

            <dl className="by-totals" aria-label="Your invoices in numbers">
              <div>
                <dt>to sign or seal</dt>
                <dd>{recs === null ? "–" : totals.toAct}</dd>
              </div>
              <div>
                <dt>{`to pay, ${plural(totals.toPay.count, "invoice")}`}</dt>
                <dd>
                  {zatToZec(totals.toPay.zat)}
                  <small>ZEC</small>
                </dd>
              </div>
              <div>
                <dt>{`paid on time, of ${totals.due} due`}</dt>
                <dd>
                  {totals.onTime === null ? "–" : totals.onTime}
                  <small>{`/ ${totals.due}`}</small>
                </dd>
              </div>
            </dl>
            {due.length ? (
              <p className="by-due" role="status">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  期
                </span>
                <span>
                  <b>{due.some((d) => d.state.kind === "overdue") ? "Past due." : due.length === 1 ? "Due soon." : `${due.length} invoices due soon.`}</b> {due.map((d) => reminderText(d, `${zatToZec(d.amount_zat)} ZEC`)).join(" ") + " Pay each on its slip."}
                </span>
              </p>
            ) : null}

            <div className="rp-list-h">
              <h2>Your invoices</h2>
              <span>kept encrypted on this device</span>
            </div>
            {recs === "blocked" ? (
              <p className="rp-empty">This browser blocks local storage, so received invoices are not kept.</p>
            ) : recs !== null && !list.length ? (
              <p className="rp-empty">No invoice yet. Check one on the desk and it is kept here, encrypted on this device.</p>
            ) : (
              <ul className="by-ledger" aria-label="Invoices addressed to your keys, newest first">
                {list.map((r) => {
                  const a = nextAction(r);
                  const s = sealCount(r);
                  const [word, cls] = TAG[a];
                  const ll = ledgerLine(lateState(r, today(), statuses?.[r.n] ?? null));
                  return (
                    <li key={r.n}>
                      <button type="button" aria-current={r.n === rec?.n ? "true" : undefined} onClick={() => open(r)}>
                        <span className="by-l-id">{r.invoice_id}</span>
                        <span className="by-l-amt">{`${zatToZec(r.amount_zat)} ZEC`}</span>
                        <span className="by-l-sub">{`due ${daysToDate(r.due_date)} · key #${r.key_index}`}</span>
                        <span className="by-l-seals" role="img" aria-label={`${s} of 3 seals`}>
                          {["売", "買", "融"].map((g, i) => (
                            <i key={g} className={i < s ? "is-on" : undefined} lang="ja">
                              {g}
                            </i>
                          ))}
                        </span>
                        <span className="by-l-tag">
                          <span className={cls ? `is-${cls}` : undefined}>{a === "pay" ? `${word} · ${dueWords(r.due_date - today())}` : word}</span>
                          <span>{[invoiceStatus(r), statuses?.[r.n]].filter(Boolean).join(" · ")}</span>
                        </span>
                        {ll ? (
                          <span className={`by-l-late is-${ll.tone}`}>
                            <i lang="ja" aria-hidden="true">
                              {ll.glyph}
                            </i>
                            {ll.text}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rp-vis" ref={desk}>
            <ol className="by-route" aria-label="Where this invoice is">
              {STATIONS.map((s, i) => (
                <li key={s.glyph} className={done[i] ? "is-done" : dec && i === nextSt ? "is-next" : undefined}>
                  <b lang="ja" aria-hidden="true">
                    {s.glyph}
                  </b>
                  <span>{s.label}</span>
                  <span className="by-sr">{done[i] ? "done" : dec && i === nextSt ? "next" : "later"}</span>
                </li>
              ))}
            </ol>
            <p className="by-route-cap" role="status">
              {dec ? (
                <>
                  <b>{dec.invoice_id}</b>
                  {`: ${routeCap}`}
                </>
              ) : (
                "Invoices addressed to your keys arrive in your mailbox below."
              )}
            </p>
            <div className="by-desk">
              <div className="by-paper">
                {mode === "letter" ? letterSheet : invoiceSheet}
                {slip}
              </div>
              {side === "done" ? sideDone : side === "seal" ? sideSeal : sideSign}
            </div>
            <details className="by-codes">
              <summary>
                <span>
                  <b>The codes behind this sheet</b>
                  <span>Opening an invoice fills them from this device. Paste here only what a supplier or financier gave you by hand.</span>
                </span>
                <i aria-hidden="true">+</i>
              </summary>
              <div className="by-codes-grid">
                <label className="field">
                  <span>Invoice code from the supplier</span>
                  <textarea spellCheck="false" ref={cInv} />
                  <small>Signing, sealing and paying read this one invoice.</small>
                </label>
                <div className="rp-fieldset">
                  <span>Terms PDF from the supplier</span>
                  <FilePill label="Terms PDF from the supplier" empty="no file chosen" inputRef={cTerms} />
                  <small>Hashed in your browser and compared with the invoice; the file is not sent anywhere.</small>
                </div>
                <label className="field">
                  <span>Assignment letter code</span>
                  <textarea spellCheck="false" ref={cLetter} />
                </label>
                <label className="field">
                  <span>Supplier seal</span>
                  <textarea spellCheck="false" ref={cSeal} />
                </label>
                <div className="rp-fieldset">
                  <span>Assignment letter document (PDF)</span>
                  <FilePill label="Assignment letter document (PDF)" empty={kept && rec?.assignment?.pdf ? "from your inbox" : "no file chosen"} inputRef={cLpdf} />
                  <small>Hashed in your browser and compared with the letter. A letter from your inbox brings its PDF, so you can leave this empty.</small>
                </div>
              </div>
            </details>
          </div>
        </section>

        {/* ============ 2. history: the chain of certificates over the board ============ */}
        <section className="rp-sec" aria-labelledby="by-th">
          <div className="rp-cap">
            <div className="rp-h">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                歴
              </span>
              <h2 id="by-th">My payment history</h2>
            </div>
            <p className="hint">What a financier sees when you send your history: each invoice you financed, anchored on the board, and whether you paid it on time.</p>
            <div className="actions">
              <Button onClick={checkMine}>Check my history</Button>
            </div>
            {mineOut.el}
            <h3>History certificate</h3>
            <p className="hint">Financiers check your full payment history before financing. Each certificate links to the previous one, which this device keeps for you, and is anchored on the board, so a history cannot be trimmed.</p>
            <div className="rp-panel">
              <label className="field">
                <span>Invoice code</span>
                <textarea spellCheck="false" ref={hInv} />
              </label>
              <label className="field">
                <span>Financier key</span>
                <input type="text" placeholder="64 hex characters" spellCheck="false" autoComplete="off" ref={hFin} />
              </label>
              <div className="actions">
                <button type="button" disabled={blocked} onClick={() => void issue()}>
                  Issue certificate
                </button>
              </div>
              {histOut.el}
            </div>
          </div>

          <div className="by-chain" ref={chain}>
            {requests.map(({ r, about }) => (
              <div className="by-branch" role="group" aria-label="History request" key={r.relayId}>
                <span className="rp-hanko is-bad" lang="ja" aria-hidden="true">
                  請
                </span>
                <div>
                  <b>A financier asks for your history</b>
                  <p>{answered[r.relayId] ?? about}</p>
                </div>
                {answered[r.relayId] ? null : (
                  <div className="actions rp-small">
                    <Button onClick={() => answer(r)}>Send my history</Button>
                  </div>
                )}
              </div>
            ))}
            <div className="by-chain-scroll" ref={chainScroll}>
              <ol className="by-certs" aria-label="Your history certificates, oldest first">
                {certs.map((c, j) => {
                  const o = outcomes?.[c.index];
                  const [g, word, cls] = o ? (OUTCOME[o] ?? ["待", o, "is-open"]) : ["待", "not checked yet", "is-open"];
                  const inv = list.find((r) => r.n === c.nullifier);
                  return (
                    <li key={c.index}>
                      <article className={`by-cert ${cls}`} aria-label={`Certificate ${c.index}`} data-v={`--d:${j * 67}ms`}>
                        <b lang="ja">証明書</b>
                        <strong>{`#${c.index}`}</strong>
                        <span>{`${inv ? inv.invoice_id : `N ${c.nullifier.slice(0, 8)}…`} · due ${daysToDate(c.due_date)}`}</span>
                        <span>{`${zatToZec(c.amount_zat)} ZEC · links to ${c.index ? `#${c.index - 1}` : "the start"}`}</span>
                        <span className="by-out">
                          <span className="rp-hanko" lang="ja" aria-hidden="true">
                            {g}
                          </span>
                          {word}
                        </span>
                      </article>
                      <div className={`by-anchor${anchored !== null && c.index >= anchored ? " is-loose" : ""}`} data-v={`--d:${200 + j * 67}ms`} />
                    </li>
                  );
                })}
                <li className="is-next-li">
                  <article className="by-cert is-next" aria-label="Your next certificate">
                    <b lang="ja">次</b>
                    <strong>{`#${nextCert}`}</strong>
                    <span>{certs.length ? "Your next certificate. Issued when a financier finances your next invoice." : "Your first certificate. Issued when a financier finances your first invoice."}</span>
                  </article>
                  <div className="by-anchor is-loose" />
                </li>
              </ol>
              <div className="by-board">
                <div className="by-board-in">
                  <b lang="ja">公開台帳</b>
                  <p>
                    {boardData ? `${boardLine(boardData)}. ` : "Public board: not read yet. "}
                    Each certificate's anchor, nothing about who.
                  </p>
                </div>
                <div className="by-board-rows" aria-hidden="true">
                  {certs.map((c) => (
                    <span key={c.index} className={anchorLine(c.index) === "anchored" || anchorLine(c.index) === "on the board" ? undefined : "is-next"}>
                      <b>{`anchor #${c.index}`}</b>
                      {anchorLine(c.index)}
                    </span>
                  ))}
                  <span className="is-next">
                    <b>—</b>
                    nothing yet
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ 3. mailbox ============ */}
        <div className="rp-mail">
          <div className="rp-list-h rp-mail-h">
            <h2>Inbox</h2>
            <span>opens on its own, then every minute while this screen is open</span>
          </div>
          <MailboxCard handlers={handlers} />
        </div>
      </div>
    </Page>
  );
}
