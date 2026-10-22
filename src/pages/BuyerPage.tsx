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
// React since HNK-31.T9. The page is drawn once; the inbox, the invoice list and the steps fill
// each other's fields through refs, as before.
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Actions, Banner, Button, Card, CodeBlock, DeskPage, Field, FileField, Kv, MiniInvoice, Route, TrustedSvg, useOut } from "../app/ui";
import { myIdentity, myMailbox, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { loadBoard } from "../lib/board";
import { checkInvoice } from "../lib/buyer-check";
import { letterProblems, payProblems } from "../lib/buyer-letter";
import { append, certFields, decodeBackup, dropTail, emptyHistory, encodeBackup, head, HISTORY_ID, localNextIndex, reconcile, type HistoryDoc } from "../lib/buyer-history";
import { boardStatus, dueSoon, invoiceRecord, invoiceStatus, isInvoiceId, sortInvoices, storeId, withSignature, type BuyerInvoice } from "../lib/buyer-invoices";
import { daysToDate, fileHash, json, today, wasm, zatToZec } from "../lib/core";
import { NET } from "../lib/network";
import { discard, draft, loadState, saveState, send, type Received } from "../lib/relay";
import { encodeMessage, signingBytes, verifyHeader, type Header } from "../lib/relay-message";
import { MailboxCard, takeContact, type InboxAction } from "./MailboxCard";

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
const setValue = (r: RefObject<Area | null>, value: string, notify = false) => {
  r.current!.value = value;
  if (notify) r.current!.dispatchEvent(new Event("input", { bubbles: true }));
};
const scrollTo = (r: RefObject<HTMLElement | null>) => r.current?.scrollIntoView({ behavior: "smooth", block: "start" });

function InvoiceTable({ f }: { f: Record<string, string | number> }): ReactNode {
  return (
    <Kv
      rows={[
        ["Invoice number", String(f.invoice_id)],
        ["Amount", `${zatToZec(Number(f.amount_zat))} ZEC`],
        ["Issued", daysToDate(Number(f.issue_date))],
        ["Due", daysToDate(Number(f.due_date))],
        ["Addressed to your key", String(f.buyer_pk), true],
        ["Document hash", String(f.terms_hash), true],
        ["Fingerprint N", String(f.nullifier), true],
      ]}
    />
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
        <Actions>
          <Button
            onClick={async () => {
              try {
                await sendSignature(n, sig, replyTo);
                setDone(true); // sent once; a second copy would only repeat it
                out.show(<Banner kind="ok" title="Signature sent" text="Sealed to the supplier's mailbox. The supplier offers the invoice to a financier next." />);
                sent();
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Send signature to the supplier
          </Button>
        </Actions>
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
  return (
    <div className="contacts">
      <textarea rows={2} spellCheck="false" placeholder="the supplier's jitsuin-contact-v1:…" aria-label="The supplier's contact card" ref={card} />
      <Actions>
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
      </Actions>
      {out.el}
    </div>
  );
}

const STATIONS = [
  { glyph: "受", label: "Checked with its PDF" },
  { glyph: "署", label: "Signed" },
  { glyph: "送", label: "Sent to the supplier" },
  { glyph: "印", label: "Letter sealed" },
  { glyph: "払", label: "Paid at maturity" },
];

export function BuyerPage(): ReactNode {
  const board = useRef<HTMLInputElement>(null);
  const sInvoice = useRef<Area>(null);
  const sTerms = useRef<HTMLInputElement>(null);
  const lInvoice = useRef<Area>(null);
  const lLetter = useRef<Area>(null);
  const lSeal = useRef<Area>(null);
  const lPdf = useRef<HTMLInputElement>(null);
  const hInvoice = useRef<Area>(null);
  const hFin = useRef<Area>(null);
  const pInvoice = useRef<Area>(null);
  const pLetter = useRef<Area>(null);
  const signCard = useRef<HTMLElement>(null);
  const sealCard = useRef<HTMLElement>(null);
  const payCard = useRef<HTMLElement>(null);
  const keysOut = useOut();
  const signOut = useOut();
  const sealOut = useOut();
  const letterOut = useOut();
  const histOut = useOut();
  const payOut = useOut();
  const listOut = useOut();
  const mineOut = useOut();
  const [stageRec, setStageRec] = useState<BuyerInvoice | undefined>(undefined);
  // the invoice text that passed both checks (HNK-25.T1, BL-D22-06): signing stays off until then
  const [checked, setChecked] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  // 3. the invoice, letter and supplier seal that passed the letter checks (HNK-32.T1, BL-D24-06)
  const [letterOk, setLetterOk] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  // 2. signing locks again whenever the invoice or its PDF changes
  useEffect(() => {
    const lock = () => setChecked(null);
    const i = sInvoice.current!;
    const t = sTerms.current!;
    i.addEventListener("input", lock);
    t.addEventListener("change", lock);
    return () => {
      i.removeEventListener("input", lock);
      t.removeEventListener("change", lock);
    };
  }, []);
  // 3. sealing locks again whenever the letter, its PDF or the supplier's seal changes
  useEffect(() => {
    const lock = () => setLetterOk(null);
    const els = [lInvoice.current!, lLetter.current!, lSeal.current!, lPdf.current!];
    for (const el of els) {
      el.addEventListener("input", lock);
      el.addEventListener("change", lock);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("input", lock);
        el.removeEventListener("change", lock);
      }
    };
  }, []);

  // ---------- 1. keys and history ----------
  const showKey = async () => {
    try {
      let hist = await loadHistory();
      let k = localNextIndex(hist);
      const m = await account.stamp();
      const notes: ReactNode[] = [];
      const note = (n: ReactNode) => notes.push(<Fragment key={notes.length}>{n}</Fragment>);
      try {
        const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
        // the relay copy first: another device may have issued newer certificates
        let restored = 0;
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
              note(<Banner kind="warn" title="The relay's copy of your history was behind" text={`It held ${remote.certs.length} certificate${remote.certs.length === 1 ? "" : "s"}; this device has ${hist.certs.length}. The copy is updated now. If you did not remove anything yourself, the relay lost or held back your newest certificate.`} />);
            } else if (r.kind === "diverged") {
              note(<Banner kind="bad" title="Your history on the relay differs from this device" text="The two copies disagree about an earlier certificate. This device keeps its own; do not issue a new certificate until you know which device holds your real history." />);
            }
          } else if (hist.certs.length) {
            await backupHistory(hist);
          }
        } catch (e) {
          note(<p className="hint">{`The relay copy of your history was not checked: ${e instanceof Error ? e.message : String(e)}`}</p>);
        }
        const boardJson = (await board.current!.files?.[0]?.text()) ?? (await loadBoard((u, i) => fetch(u, i)).catch(() => undefined))?.json;
        if (boardJson) {
          const r = json<{ next_index: number; dropped: number[]; successor_on_board: boolean }>(wasm.historyNext(JSON.stringify(hist.certs), id, boardJson));
          if (r.dropped.length) {
            hist = dropTail(hist, r.dropped);
            await saveHistory(hist);
            note(<Banner kind="warn" title="Unused certificate removed" text={`Certificate${r.dropped.length > 1 ? "s" : ""} #${r.dropped.join(", #")} never reached the board (the financier did not register), so the number is free again.`} />);
          }
          // restored certificates passed historyNext (signatures, links, anchors): keep them
          if (restored && !r.dropped.length) await saveHistory(hist);
          if (restored) note(<Banner kind="ok" title="History restored from the relay" text={`${restored} newer certificate${restored === 1 ? "" : "s"} from your other device, checked against the board.`} />);
          successorOnBoard = r.successor_on_board;
          k = r.next_index;
          note(
            successorOnBoard ? (
              <Banner kind="bad" title="Your history is ahead of this device" text={`The board already holds a certificate after #${k - 1 < 0 ? "start" : k - 1} that this device does not have. Do not issue a new certificate here: it would fork your history. Open this page on the device that issued it; its copy reaches the relay and comes back here.`} />
            ) : (
              <Banner kind="ok" title="History checked against the board" text={`${r.next_index} certificate${r.next_index === 1 ? "" : "s"} anchored.`} />
            ),
          );
        } else {
          if (restored) {
            hist = await loadHistory(); // an unchecked relay copy is not used
            k = localNextIndex(hist);
            note(<p className="hint">{`The relay holds ${restored} newer certificate${restored === 1 ? "" : "s"}; add board data to check and restore them.`}</p>);
          }
          note(<p className="hint">Not checked against the board. Add board data to check which certificates are anchored.</p>);
        }
        const next = json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk;
        keysOut.show(
          <>
            {notes}
            <Kv
              rows={[
                ["Your identity key", id, true],
                ["Next invoice in your history", `#${k}`],
                [`Key for invoice #${k}`, next, true],
              ]}
            />
            <p className="hint">Give this key to the supplier for your next invoice. Each invoice uses a different key, so the public board cannot link your invoices.</p>
            <ShareKey k={k} invoicePk={next} />
          </>,
        );
      } finally {
        m.fill(0);
      }
    } catch (e) {
      keysOut.error(e);
    }
  };

  // ---------- 2. sign the invoice ----------
  const checkIt = async () => {
    try {
      setChecked(null);
      const invoice = v(sInvoice);
      const f = json<Record<string, string | number>>(wasm.invoiceDecode(invoice));
      const file = sTerms.current!.files?.[0];
      const hash = file ? await fileHash(file) : null;
      const keyIndex = await findKeyIndex(invoice);
      const r = checkInvoice({ termsHash: String(f.terms_hash), fileHash: hash, keyIndex });
      if (keyIndex !== null) {
        const d = { nullifier: String(f.nullifier), invoice_id: String(f.invoice_id), amount_zat: Number(f.amount_zat), due_date: Number(f.due_date) };
        const p = pending.get(d.nullifier);
        await saveInvoice((prev) => ({ ...invoiceRecord(d, invoice, keyIndex, r.canSign, Date.now(), prev), ...(p ? { reply_to: p.replyTo } : {}) }), d.nullifier);
        void refreshInvoices();
      }
      signOut.show(
        <>
          <Banner kind={r.kind} title={r.title} text={r.text} />
          <Kv rows={r.rows} />
          <InvoiceTable f={f} />
        </>,
      );
      if (r.canSign) setChecked(invoice);
    } catch (e) {
      signOut.error(e);
    }
  };
  const signIt = async () => {
    setSigning(true);
    try {
      if (checked === null || checked !== v(sInvoice)) throw new Error("check the invoice first");
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
      signOut.show(
        <>
          <InvoiceTable f={f} />
          <SendSignature n={n} sig={sig} replyTo={replyTo} sent={() => void refreshInvoices()} />
        </>,
      );
      void refreshInvoices();
    } catch (e) {
      signOut.error(e);
    } finally {
      setSigning(false);
    }
  };

  // ---------- 3. seal the letter ----------
  const letterKey = () => [v(lInvoice), v(lLetter), v(lSeal)].join("|");
  const checkLetter = async () => {
    try {
      setLetterOk(null);
      const invoice = v(lInvoice);
      const letter = v(lLetter);
      const s0 = v(lSeal);
      const f = json<{ financier_pk: string; financier_address: string; amount_zat: number; due_date: number; terms_hash: string; matches_invoice: boolean | null }>(wasm.assignmentDecode(letter, invoice));
      // a letter that came through the mailbox brings its PDF; a chosen file wins
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(invoice)).nullifier;
      const a = (await account.current?.store?.get<BuyerInvoice>(storeId(n)))?.assignment;
      const arrived = a?.letter === letter && a.pdf ? new File([Uint8Array.from(atob(a.pdf), (c) => c.charCodeAt(0))], "letter.pdf", { type: "application/pdf" }) : undefined;
      const file = lPdf.current!.files?.[0] ?? arrived;
      let supplierSeal: string | null = null;
      try {
        supplierSeal = s0 ? wasm.assignmentStatus(invoice, letter, JSON.stringify([s0])) : null;
      } catch {
        supplierSeal = null;
      }
      const problems = letterProblems({ matchesInvoice: f.matches_invoice, termsHash: f.terms_hash, fileHash: file ? await fileHash(file) : null, supplierSeal });
      sealOut.show(
        <>
          <Kv
            rows={[
              ["Financier", f.financier_pk, true],
              ["You pay at", f.financier_address, true],
              ["Amount", `${zatToZec(f.amount_zat)} ZEC`],
              ["Due", daysToDate(f.due_date)],
            ]}
          />
          {problems.length ? (
            <Banner kind="bad" title="Do not seal" text={problems.join("; ") + "."} />
          ) : (
            <Banner kind="ok" title="Letter checks out" text="Same invoice, the PDF is the letter's document, and the supplier sealed this letter for this financier." />
          )}
        </>,
      );
      if (!problems.length) setLetterOk(letterKey());
    } catch (e) {
      sealOut.error(e);
    }
  };
  const sealIt = async () => {
    setSealing(true);
    try {
      if (letterOk === null || letterOk !== letterKey()) throw new Error("check the letter first");
      const seal = await withInvoiceIndex(v(lInvoice), (m, k) => wasm.buyerSealAssignmentBytes(m, k, v(lInvoice), v(lLetter), v(lSeal)));
      // HNK-26.T16: when the letter came through the mailbox, the seal goes back the same way
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(v(lInvoice))).nullifier;
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(n));
      const a = rec?.assignment;
      const to = a && a.letter === v(lLetter) ? [a.financier_mailbox, a.supplier_mailbox].filter((x): x is string => !!x) : [];
      for (const t of to) {
        const hd = draft("deal.seal", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n, body: { seal, index: 1 } });
        await send(t, await encodeMessage(hd as Header), relayDeps);
      }
      if (to.length && rec) {
        await saveInvoice((prev) => ({ ...(prev ?? rec), assignment: { ...a, buyer_seal: seal, sealed_at: Date.now() } }), n);
        sealOut.show(<Banner kind="ok" title="Sealed and sent" text="Your seal went to the financier and the supplier. The financier pays the advance next, with its own seal." />);
      } else sealOut.show(<CodeBlock label="Your seal: send it to the financier" value={seal} filename="buyer.seal.txt" />);
    } catch (e) {
      sealOut.error(e);
    } finally {
      setSealing(false);
    }
  };

  // ---------- 4. history certificate ----------
  const issue = async () => {
    try {
      if (successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates before issuing a new one");
      const hist = await loadHistory();
      const next = localNextIndex(hist);
      const { cert, k } = await withInvoiceIndex(v(hInvoice), (m, k) => {
        if (k !== next) {
          m.fill(0);
          throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
        }
        return { cert: wasm.buyerHistoryCertBytes(m, k, v(hInvoice), v(hFin), head(hist)), k };
      });
      await saveHistory(append(hist, k, cert));
      histOut.show(<CodeBlock label={`Certificate #${k}: give it to the financier (this device keeps a copy)`} value={cert} filename={`history-${k}.cert.txt`} />);
    } catch (e) {
      histOut.error(e);
    }
  };

  // ---------- 5. pay ----------
  const pay = async () => {
    try {
      // HNK-32.T2 (BL-D25-01): only the letter this device kept, with all three seals, is paid
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(v(pInvoice))).nullifier;
      const a = (await account.current?.store?.get<BuyerInvoice>(storeId(n)))?.assignment;
      const seals = [a?.supplier_seal, a?.buyer_seal, a?.financier_seal].filter((x): x is string => !!x);
      let status: string | null = null;
      try {
        status = a?.letter && seals.length === 3 ? wasm.assignmentStatus(v(pInvoice), a.letter, JSON.stringify(seals)) : null;
      } catch {
        status = null;
      }
      const problems = payProblems({ kept: a?.letter, letter: v(pLetter), seals: seals.length, status });
      if (problems.length) throw new Error(problems[0]);
      const payTo = json<{ financier_address: string }>(wasm.assignmentDecode(v(pLetter), v(pInvoice))).financier_address;
      const r = json<{ uri: string; qr_svg: string }>(await withInvoiceIndex(v(pInvoice), (m, k) => wasm.buyerRepaymentBytes(m, k, v(pInvoice), v(pLetter), today())));
      payOut.show(
        <>
          <TrustedSvg svg={r.qr_svg} />
          <Kv rows={[["Pays the financier at", payTo, true]]} />
          <CodeBlock label="Payment request (ZIP-321)" value={r.uri} />
        </>,
      );
    } catch (e) {
      payOut.error(e);
    }
  };

  // ---------- the inbox ----------
  // a sign request fills step 2 with the invoice and its PDF (HNK-23.T7)
  const fromInbox: InboxAction = {
    label: "Open in step 2",
    keep: true,
    run: async (r) => {
      const hd = r.message.header;
      const invoice = String(hd.body.invoice);
      const f = json<{ supplier_pk: string; nullifier: string; invoice_id: string }>(wasm.invoiceDecode(invoice));
      if (hd.n !== f.nullifier) throw new Error("the message names another invoice than the one it carries");
      if (!(await verifyHeader(hd, f.supplier_pk))) throw new Error("not signed by this invoice's supplier key");
      const pdf = r.message.attachments[0];
      pending.set(f.nullifier, { replyTo: hd.from.mailbox_pk, relayId: r.relayId });
      setValue(sInvoice, invoice, true);
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(pdf)], hd.attachments[0]?.name ?? `${f.invoice_id}.pdf`, { type: "application/pdf" }));
      sTerms.current!.files = dt.files;
      sTerms.current!.dispatchEvent(new Event("change", { bubbles: true }));
      scrollTo(signCard);
      return `${f.invoice_id} is in step 2 with its PDF. Check it, then sign.`;
    },
  };
  // HNK-26.T16: the letter from the financier's node and the supplier's seal fill step 3
  const fillSeal = (rec: BuyerInvoice) => {
    setLetterOk(null);
    if (rec.assignment?.financier_seal && rec.assignment.letter) {
      setValue(pInvoice, rec.invoice);
      setValue(pLetter, rec.assignment.letter);
      scrollTo(payCard);
      return;
    }
    setValue(lInvoice, rec.invoice);
    if (rec.assignment?.letter) {
      setValue(lLetter, rec.assignment.letter);
      const f = json<{ financier_pk: string; financier_address: string; amount_zat: number; due_date: number; terms_hash: string }>(wasm.assignmentDecode(rec.assignment.letter, rec.invoice));
      const pdf = rec.assignment.pdf;
      letterOut.show(
        <>
          <p className="hint">{`Assignment letter for ${rec.invoice_id}: from now on you pay the financier below, at this address, and nobody else.`}</p>
          <Kv
            rows={[
              ["Financier", f.financier_pk, true],
              ["You pay at", f.financier_address, true],
              ["Amount", `${zatToZec(f.amount_zat)} ZEC`],
              ["Due", daysToDate(f.due_date)],
              ["Letter document (SHA-256, checked)", f.terms_hash, true],
            ]}
          />
          {pdf ? (
            <Actions>
              <Button
                secondary
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))], { type: "application/pdf" }));
                  window.open(url, "_blank", "noopener");
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
              >
                Read the letter (PDF)
              </Button>
            </Actions>
          ) : (
            <span />
          )}
        </>,
      );
    }
    if (rec.assignment?.supplier_seal) setValue(lSeal, rec.assignment.supplier_seal);
    scrollTo(sealCard);
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
      fillSeal(next);
      return next.assignment.financier_seal
        ? `${rec.invoice_id}: the financier sealed the letter and paid the supplier. Pay at maturity in step 5.`
        : next.assignment.letter && next.assignment.supplier_seal
          ? `${rec.invoice_id}: letter and the supplier's seal are in step 3. Read the letter, then seal.`
          : `${rec.invoice_id}: kept. Step 3 waits for ${next.assignment.letter ? "the supplier's seal" : "the financier's letter"}.`;
    },
  });
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
    // HNK-26.T8: a financier asks for this buyer's history before it registers the invoice
    "history.request": {
      label: "Send my history",
      // BL-D26-02: who asks, for which invoice, before the buyer agrees; declining is not answering
      describe: async (r) => {
        const hd = r.message.header;
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        const known = (await account.current?.store?.list<{ mailbox_pk: string; username?: string; fingerprint: string }>())?.find((x) => x.id === `contact:${hd.from.mailbox_pk}`)?.doc;
        const who = known ? `${known.username ? `@${known.username}` : "A financier"} (fingerprint ${known.fingerprint})` : `A financier you have no card for (key ${String(hd.body.financier_pk).slice(0, 10)}…)`;
        const what = rec ? `${rec.invoice_id}, ${zatToZec(rec.amount_zat)} ZEC due ${daysToDate(rec.due_date)}` : "an invoice this device does not hold";
        return `${who} asks for your payment history before financing ${what}. Sending shows how your earlier invoices were paid, not who they were with. To decline, do nothing: no answer is sent.`;
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
        const certs = hist.certs.slice(0, index + 1);
        const hdOut = draft("history.chain", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, hd.from.mailbox_pk, relayDeps, {
          n: rec.n,
          body: identity ? { certs, identity_pk: identity } : { certs },
        });
        await send(hd.from.mailbox_pk, await encodeMessage(hdOut as Header), relayDeps);
        return `Your history (${certs.length - 1} earlier invoice${certs.length === 2 ? "" : "s"} and the certificate for ${rec.invoice_id}) went to the financier. It checks them on the board; the supplier signs the entry next.`;
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

  // ---------- 0. the invoices received on this device, newest first; Open fills every step ----------
  const open = (rec: BuyerInvoice) => {
    setStageRec(rec);
    for (const f of [sInvoice, lInvoice, hInvoice, pInvoice]) setValue(f, rec.invoice, true);
    scrollTo(signCard);
  };
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
    try {
      const list = await loadInvoices();
      if (!account.current?.store) return listOut.show(<p className="hint">This browser blocks local storage, so received invoices are not kept.</p>);
      if (!list.length) return listOut.show(<p className="hint">No invoice yet. Check one in step 2 and it is kept here, encrypted on this device.</p>);
      setStageRec(list[0]);
      const b = await loadBoard((u, i) => fetch(u, i)).catch(() => undefined);
      // HNK-25.T5 (BL-D25-02): what falls due within a week, from this device only
      const due = dueSoon(list, today());
      listOut.show(
        <>
          {due.length ? (
            <Banner
              kind="warn"
              title={due.length === 1 ? "Due soon" : `${due.length} invoices due soon`}
              text={due.map((d) => `${d.rec.invoice_id}: ${zatToZec(d.rec.amount_zat)} ZEC ${d.days_left < 0 ? `${-d.days_left} day${d.days_left === -1 ? "" : "s"} past due` : d.days_left === 0 ? "due today" : `in ${d.days_left} day${d.days_left === 1 ? "" : "s"}`}`).join(" · ") + ". Pay in step 5."}
              glyph="期"
            />
          ) : null}
          <div className="deals">
            {list.map((rec) => (
              <div className="deal" key={rec.n}>
                <div className="deal-head">
                  <strong>{rec.invoice_id}</strong>
                  <span>{`${zatToZec(rec.amount_zat)} ZEC · due ${daysToDate(rec.due_date)} · key #${rec.key_index}`}</span>
                  <Button secondary onClick={() => open(rec)}>
                    Open
                  </Button>
                </div>
                <small>{[invoiceStatus(rec), onBoard(rec, b?.json)].filter(Boolean).join(" · ")}</small>
              </div>
            ))}
          </div>
        </>,
      );
    } catch (e) {
      listOut.error(e);
    }
  };
  useEffect(() => {
    void refreshInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HNK-25.T6 (BL-D26-09): my history as financiers see it, checked against the board here; the
  // financiers named in my own certificates count, so every outcome shows
  const checkMine = async () => {
    try {
      const hist = await loadHistory();
      if (!hist.certs.length) return mineOut.show(<p className="hint">No certificate yet: your history starts with the first invoice a financier finances.</p>);
      const fields = hist.certs.map(certFields);
      const b = await loadBoard((u, i) => fetch(u, i));
      const allow = [...new Set(fields.map((f) => f.financier_pk))];
      const r = json<{ on_time: number; late: number; defaults: number; open: number; lines: Array<{ index: number; due_date: number; outcome: string }> }>(
        wasm.verifyHistory(JSON.stringify(hist.certs), fields[0].identity_pk, JSON.stringify(allow), b.json, today(), 7),
      );
      const word: Record<string, string> = { PaidOnTime: "paid on time", PaidLate: "paid late", Default: "not paid past due", Open: "open, not due yet" };
      mineOut.show(
        <>
          <Banner kind={r.defaults ? "bad" : "ok"} title={`${r.on_time} on time · ${r.late} late · ${r.open} open · ${r.defaults} defaulted`} text={`Checked against the ${b.source} board up to block ${b.tip}.`} glyph={r.defaults ? "滞" : "済"} />
          <Kv rows={r.lines.map((l) => [`#${l.index} · due ${daysToDate(l.due_date)} · ${zatToZec(fields[l.index]?.amount_zat ?? 0)} ZEC`, word[l.outcome] ?? l.outcome])} />
        </>,
      );
    } catch (e) {
      mineOut.error(e);
    }
  };

  // The stage (HNK-30.T17): the invoice in hand and its route along the counter rail. Only the
  // first three stations are tracked on this device; sealing and paying follow in their steps.
  const rec = stageRec;
  const done = rec ? [rec.terms_checked, !!rec.signature, !!rec.signature_sent_at] : [false, false, false];
  const first = done.indexOf(false);
  const state = (i: number): "done" | "next" | "later" => (i < 3 && done[i] ? "done" : i === (first < 0 ? 3 : first) ? "next" : "later");
  const stage = (
    <section className="ds" aria-label="The invoice in hand">
      <MiniInvoice o={rec ? { id: rec.invoice_id, amount: `${zatToZec(rec.amount_zat)} ZEC`, due: daysToDate(rec.due_date), n: rec.n, sealed: !!rec.signature } : null} />
      <Route stations={STATIONS.map((x, i) => ({ ...x, state: state(i) }))} caption={rec ? `${rec.invoice_id}: ${invoiceStatus(rec)}.` : "Invoices addressed to your keys arrive in your mailbox below."} />
    </section>
  );

  return (
    <DeskPage glyph="買" eyebrow="Buyer's counter" title="Buyer" lede="Confirm the invoice, acknowledge who you will pay, and pay at maturity, all from keys only you hold." stage={stage}>
      <MailboxCard handlers={handlers} />
      <Card step="Invoices" title="Your invoices" hint="Invoices addressed to your keys, kept encrypted on this device after you check them.">
        {listOut.el}
      </Card>
      <Card step="History" title="My payment history" hint="What a financier sees when you send your history: each invoice you financed, anchored on the board, and whether you paid it on time.">
        <Actions>
          <Button onClick={checkMine}>Check my history</Button>
        </Actions>
        {mineOut.el}
      </Card>
      <Card step="Step 1" title="Your next invoice key" hint="Your keys come from your passkey; nothing secret is stored. The number of your next invoice comes from your own history, so you never type it.">
        <FileField label="Board data (optional)" help={`Without a file the live ${NET.noun} board is read (the last one this browser saw, or a bundled copy, if the node does not answer). Checks which of your certificates are anchored.`} inputRef={board} />
        <Actions>
          <Button onClick={showKey}>Show my next invoice key</Button>
        </Actions>
        {keysOut.el}
      </Card>
      <Card step="Step 2" title="Review and sign the invoice" hint="Your signature confirms the trade happened. Check every field: this is what financiers rely on." cardRef={signCard}>
        <Field label="Invoice code from the supplier" area inputRef={sInvoice} />
        <FileField label="Terms PDF from the supplier" help="Hashed in your browser and compared with the invoice; the file is not sent anywhere." inputRef={sTerms} />
        <Actions>
          <Button secondary onClick={checkIt}>
            Check invoice
          </Button>
          <button type="button" disabled={checked === null || signing} onClick={() => void signIt()}>
            Sign invoice
          </button>
        </Actions>
        {signOut.el}
      </Card>
      <Card step="Step 3" title="Acknowledge the assignment" hint="Sealing the letter is your written acknowledgment that you will pay the financier named in it at maturity. The financier pays the supplier only after this." cardRef={sealCard}>
        {letterOut.el}
        <Field label="Invoice code" area inputRef={lInvoice} />
        <Field label="Assignment letter code" area inputRef={lLetter} />
        <Field label="Supplier seal" area inputRef={lSeal} />
        <FileField label="Assignment letter document (PDF)" help="Hashed in your browser and compared with the letter. A letter from your inbox brings its PDF, so you can leave this empty." inputRef={lPdf} />
        <Actions>
          <Button secondary onClick={checkLetter}>
            Check letter
          </Button>
          <button type="button" disabled={letterOk === null || sealing} onClick={() => void sealIt()}>
            Seal as buyer
          </button>
        </Actions>
        {sealOut.el}
      </Card>
      <Card step="Step 4" title="History certificate" hint="Financiers check your full payment history before financing. Each certificate links to the previous one, which this device keeps for you, and is anchored on the board, so a history cannot be trimmed.">
        <Field label="Invoice code" area inputRef={hInvoice} />
        <Field label="Financier key" placeholder="64 hex characters" inputRef={hFin} />
        <Actions>
          <Button onClick={issue}>Issue certificate</Button>
        </Actions>
        {histOut.el}
      </Card>
      <Card step="Step 5" title="Pay at maturity" hint="Scan the QR with a Zcash wallet. The payment is shielded; its memo carries your signed receipt and your claim, which the financier countersigns once the payment is on chain." cardRef={payCard}>
        <Field label="Invoice code" area inputRef={pInvoice} />
        <Field label="Assignment letter code" area inputRef={pLetter} />
        <Actions>
          <Button onClick={pay}>Show payment QR</Button>
        </Actions>
        {payOut.el}
      </Card>
    </DeskPage>
  );
}
