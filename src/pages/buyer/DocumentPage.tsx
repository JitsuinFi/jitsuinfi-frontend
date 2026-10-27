// The open invoice (HNK-10.T3, HNK-25.T1, HNK-32.T1, HNK-34.T5; IA port part 2, 2026-10-26,
// approved prototype ia-buyer-invoices): /buyer/invoices/<ref>, an opaque ref made on this device
// (no invoice data in the history). The invoice lies on the desk as paper, the 請求書, or the
// 債権譲渡通知書 once a letter is in hand, with its three seal circles; beside it the checks as
// lines that tick and the one step it waits for: check and sign, send the signature, check and
// seal the letter. One set of codes stands behind the sheet ("The codes behind this sheet",
// folded): every step reads the same invoice and letter, and a code given by hand goes there
// (/buyer/invoices/by-hand). Paying is the slip under Pay.
// On a desktop the caption names the invoice and lists your other invoices; on a phone the screen
// goes one step down from Invoices with a back control, one primary action at a time.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { storedCodes, syncedCodes, type Codes } from "../../lib/desk-sync";
import { Link } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { LongList } from "../../app/LongList";
import { clearDid, DidLine, useDid } from "../../app/outcome";
import { Banner, Button, CodeBlock, useOut } from "../../app/ui";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { checkInvoice, signedWithKey, type CheckResult } from "../../lib/buyer-check";
import { buyerStage, invoiceRecord, nextAction, routeDone, withSignature, type BuyerAction } from "../../lib/buyer-invoices";
import { letterChecks, letterProblems, type LetterCheck } from "../../lib/buyer-letter";
import { daysToDate, fileHash, json, wasm, zatToZec } from "../../lib/core";
import { byRef, invoicePath, slipPath } from "../../lib/deal-ref";
import { asSentence, explain } from "../../lib/explain";
import { readablePrint } from "../../lib/print";
import { draft, send } from "../../lib/relay";
import { encodeMessage, type Header } from "../../lib/relay-message";
import { findKeyIndex, fromB64, saveInvoice, sendSignature, statusesOf, awaitsBoard, useBoard, useInvoices, withInvoiceIndex, type Inv } from "./data";
import { Check, FilePill, LEDGER_LABELS, LedgerLine, ledgerWords, Seal, Tag, useVars, Verdict } from "./parts";
import "../role-paper.css";
import "../buyer.css";

type Area = HTMLInputElement & HTMLTextAreaElement;
const v = (r: RefObject<Area | null>) => r.current?.value.trim() ?? "";

// The route's stations, each labelled as the next move while it is next, in the past once done.
// A station the invoice waits at for someone else (the letter, the financier's seal) says so.
const STATIONS = [
  { glyph: "受", done: "Checked with its PDF", next: "Check it", wait: "Check it", later: "Check" },
  { glyph: "署", done: "Signed", next: "Sign next", wait: "Sign next", later: "Signature" },
  { glyph: "送", done: "Sent to the supplier", next: "Send next", wait: "Send next", later: "To the supplier" },
  { glyph: "印", done: "Letter sealed", next: "Seal next", wait: "Letter waits", later: "Letter seal" },
  { glyph: "払", done: "Paid at maturity", next: "Pay next", wait: "Seal waits", later: "Payment" },
];

/** What the route caption says after the invoice number, by what the invoice waits for. */
const ROUTE_CAP: Record<BuyerAction, string> = {
  sign: "checked, not signed. Read every field on the sheet, then sign.",
  send: "signed. Send the signature to the supplier.",
  "wait-letter": "signed, sent to the supplier. The supplier offers the invoice to a financier next.",
  seal: "the financier's letter and the supplier's seal are here. Read the letter, then seal.",
  "wait-financier": "you sealed the letter. The financier seals it when it pays the advance.",
  pay: "the financier sealed the letter and paid the supplier. Pay at maturity on its slip, under Pay.",
  settled: "settled. The bundle is kept on this device: it proves the whole deal to anyone, on the Verify page.",
};

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

/** The signature for the supplier: sent once through the mailbox, or shown to copy. */
function SendSignature({ n, sig, replyTo }: { n: string; sig: string; replyTo: string | undefined }): ReactNode {
  const out = useOut();
  const [done, setDone] = useState(false);
  if (!replyTo) return <CodeBlock label="Your signature: give it to the supplier" value={sig} filename="buyer.signature.txt" />;
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

/** /buyer/invoices/<ref>, or the blank desk for a code given by hand. */
export function DocumentPage({ invoiceRef }: { invoiceRef?: string }): ReactNode {
  const recs = useInvoices();
  if (recs === null) return null;
  const list = Array.isArray(recs) ? recs : [];
  const r = invoiceRef ? byRef(list, invoiceRef) : undefined;
  if (invoiceRef && !r) {
    return (
      <Page wide>
        <div className="rp by">
          <div className="ia-empty">
            <h1>This invoice is not on this device</h1>
            <p className="rp-lede">Invoices are kept encrypted on your devices. One opened on another device shows here once that device has synced. Open one from your invoices.</p>
            <p className="ia-goline">
              <Link to="/buyer/invoices">Your invoices</Link>
            </p>
          </div>
        </div>
      </Page>
    );
  }
  return <Desk key={r?.ref ?? "by-hand"} start={r} list={list} />;
}

function Desk({ start, list }: { start?: Inv; list: Inv[] }): ReactNode {
  const phone = usePhone();
  const board = useBoard(awaitsBoard(list));
  const root = useRef<HTMLDivElement>(null);
  const cInv = useRef<Area>(null);
  const cTerms = useRef<HTMLInputElement>(null);
  const cLetter = useRef<Area>(null);
  const cSeal = useRef<Area>(null);
  const cLpdf = useRef<HTMLInputElement>(null);
  const signOut = useOut();
  const sealOut = useOut();
  useVars(root);
  const path = start ? invoicePath(start.ref) : "/buyer/invoices/by-hand";
  const shown = useDid(path);

  // the codes behind the sheet, mirrored for drawing (the fields stay the source for every action)
  const [codes, setCodes] = useState({ inv: start?.invoice ?? "", letter: start?.assignment?.letter ?? "", seal: start?.assignment?.supplier_seal ?? "" });
  const syncCodes = () => setCodes({ inv: v(cInv), letter: v(cLetter), seal: v(cSeal) });
  // judge run 2, finding 1: the record behind this sheet changes while it is open (the letter and
  // the supplier's seal kept from the inbox, a signature, the financier's seal). The fields follow
  // the stored record, unless the buyer typed something else into them by hand.
  const synced = useRef<Codes>(storedCodes(start));
  const stored = storedCodes(start);
  const storedKey = `${stored.inv}|${stored.letter}|${stored.seal}`;
  useEffect(() => {
    // (a textarea the buyer has not typed in may already follow its new defaultValue)
    const now: Codes = { inv: v(cInv), letter: v(cLetter), seal: v(cSeal) };
    const next = syncedCodes(synced.current, stored, now) ?? now;
    synced.current = stored;
    const fields: Array<[RefObject<Area | null>, string]> = [
      [cInv, next.inv],
      [cLetter, next.letter],
      [cSeal, next.seal],
    ];
    for (const [r, x] of fields) if (r.current && r.current.value.trim() !== x) r.current.value = x;
    if (codes.inv === next.inv && codes.letter === next.letter && codes.seal === next.seal) return;
    if (next.letter !== codes.letter || next.seal !== codes.seal) lockSeal();
    if (next.inv !== codes.inv) lockSign();
    setCodes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);
  // the invoice text that passed both checks (HNK-25.T1, BL-D22-06): signing stays off until then
  const [checked, setChecked] = useState<string | null>(null);
  const [invCheck, setInvCheck] = useState<CheckResult | null>(null);
  const [signing, setSigning] = useState(false);
  // the invoice, letter and supplier seal that passed the letter checks (HNK-32.T1, BL-D24-06)
  const [letterOk, setLetterOk] = useState<string | null>(null);
  const [letterRes, setLetterRes] = useState<LetterCheck[] | null>(null);
  const [sealing, setSealing] = useState(false);
  const [press, setPress] = useState<"sig" | "seal" | null>(null);

  // signing locks again whenever the invoice or its PDF changes; sealing whenever the letter, its
  // PDF or the supplier's seal changes (React's own events: they hold whatever element is drawn)
  const lockSign = () => (setChecked(null), setInvCheck(null));
  const lockSeal = () => (setLetterOk(null), setLetterRes(null));
  const onInvoice = () => (lockSign(), lockSeal(), syncCodes());
  const onLetter = () => (lockSeal(), syncCodes());

  // messy-state E2E 2026-10-27: a cut or foreign code said why (Check invoice only stayed off)
  const [dec, decProblem] = useMemo((): [InvoiceFields | null, string | null] => {
    try {
      return [codes.inv ? json<InvoiceFields>(wasm.invoiceDecode(codes.inv)) : null, null];
    } catch (e) {
      return [null, asSentence(explain(e instanceof Error ? e.message : String(e)))];
    }
  }, [codes.inv]);
  const lf = useMemo(() => {
    try {
      return dec && codes.letter ? json<LetterFields>(wasm.assignmentDecode(codes.letter, codes.inv)) : null;
    } catch {
      return null;
    }
  }, [codes, dec]);
  // the record of the invoice behind the sheet (a pasted code may be another one of this device's)
  const rec = dec ? list.find((x) => x.n === dec.nullifier) : undefined;
  const act = rec ? nextAction(rec) : null;
  const kept = !!rec?.assignment?.letter && rec.assignment.letter === codes.letter;
  const mode: "none" | "invoice" | "letter" = !dec ? "none" : codes.letter ? "letter" : "invoice";
  const side: "sign" | "seal" | "done" = mode === "letter" ? (kept && rec?.assignment?.buyer_seal ? "done" : "seal") : "sign";
  const done = rec ? routeDone(rec) : [false, false, false, false, false];
  const nextSt = done.indexOf(false);
  const routeCap = !dec ? null : rec && act ? (act === "wait-letter" && !rec.signature_sent_at ? "signed. Give the supplier your signature; it offers the invoice to a financier next." : act === "wait-letter" && rec.assignment?.letter ? "the financier's letter is here. Sealing waits for the supplier's seal; it arrives in your inbox." : ROUTE_CAP[act]) : "not checked on this device yet. Check it with its PDF, then sign.";
  const seals = {
    supplier: !!(rec?.assignment?.supplier_seal || codes.seal),
    buyer: !!(kept && rec?.assignment?.buyer_seal),
    financier: !!(kept && rec?.assignment?.financier_seal),
  };
  const sCount = Number(seals.supplier) + Number(seals.buyer) + Number(seals.financier);
  /** The terms PDF that came with the sign request, for the invoice behind the sheet. */
  const arrivedPdf = rec?.terms_pdf?.b64 && rec.invoice === codes.inv ? rec.terms_pdf : undefined;
  // finding F10: the PDF came to another device of this account; its bytes stayed there
  const awayPdf = !arrivedPdf && rec?.terms_pdf?.away && rec.invoice === codes.inv ? rec.terms_pdf : undefined;

  // ---------- sign the invoice ----------
  const checkIt = async () => {
    clearDid();
    try {
      setChecked(null);
      setInvCheck(null);
      signOut.clear();
      const invoice = v(cInv);
      const f = json<Record<string, string | number>>(wasm.invoiceDecode(invoice));
      const own = list.find((x) => x.n === String(f.nullifier) && x.invoice === invoice);
      const chosen = cTerms.current!.files?.[0];
      const file = chosen ?? (own?.terms_pdf?.b64 ? new File([fromB64(own.terms_pdf.b64)], own.terms_pdf.name, { type: "application/pdf" }) : undefined);
      const hash = file ? await fileHash(file) : null;
      // an invoice kept on this device was matched to its key when it arrived (one passkey touch)
      const keyIndex = own ? own.key_index : await findKeyIndex(invoice);
      const r = checkInvoice({ termsHash: String(f.terms_hash), fileHash: hash, keyIndex, sameKey: keyIndex === null ? [] : signedWithKey(keyIndex, String(f.nullifier), list) });
      if (keyIndex !== null) {
        const d = { nullifier: String(f.nullifier), invoice_id: String(f.invoice_id), amount_zat: Number(f.amount_zat), due_date: Number(f.due_date) };
        await saveInvoice((prev) => invoiceRecord(d, invoice, keyIndex, r.canSign, Date.now(), prev), d.nullifier);
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
      const n = String(json<Record<string, string | number>>(wasm.invoiceDecode(c)).nullifier);
      const sig = await withInvoiceIndex(c, (m, k) => wasm.buyerSignInvoiceBytes(m, k, c));
      const saved = await saveInvoice((prev) => {
        if (!prev) throw new Error("check the invoice first");
        return withSignature(prev, sig);
      }, n);
      setPress("sig");
      signOut.show(<SendSignature n={n} sig={sig} replyTo={saved.reply_to} />);
    } catch (e) {
      signOut.error(e);
    } finally {
      setSigning(false);
    }
  };

  // ---------- seal the letter ----------
  const letterKey = () => [v(cInv), v(cLetter), v(cSeal)].join("|");
  const checkLetter = async () => {
    clearDid();
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
      const a = list.find((x) => x.n === n)?.assignment;
      const arrived = a?.letter === letter && a.pdf ? new File([fromB64(a.pdf)], "letter.pdf", { type: "application/pdf" }) : undefined;
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
      const own = list.find((x) => x.n === n);
      const a = own?.assignment;
      const to = a && a.letter === v(cLetter) ? [a.financier_mailbox, a.supplier_mailbox].filter((x): x is string => !!x) : [];
      for (const t of to) {
        const hd = draft("deal.seal", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n, body: { seal, index: 1 } });
        await send(t, await encodeMessage(hd as Header), relayDeps);
      }
      setPress("seal");
      if (to.length && own) {
        await saveInvoice((prev) => ({ ...(prev ?? own), assignment: { ...a, buyer_seal: seal, sealed_at: Date.now() } }), n);
        sealOut.show(<Banner kind="ok" title="Sealed and sent" text="Your seal went to the financier and the supplier. The financier pays the advance next, with its own seal." glyph="印" />);
      } else sealOut.show(<CodeBlock label="Your seal: give it to the financier" value={seal} filename="buyer.seal.txt" />);
    } catch (e) {
      sealOut.error(e);
    } finally {
      setSealing(false);
    }
  };

  // ---------- the sheet ----------
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
        <span className="mono">{readablePrint(dec.buyer_pk)}</span>
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
            条件<small>Terms: the PDF's fingerprint</small>
          </dt>
          <dd>
            <span className="mono">{readablePrint(dec.terms_hash)}</span>
          </dd>
        </div>
        <div>
          <dt lang="ja">
            発行者<small>Issuer key</small>
          </dt>
          <dd>
            <span className="mono">{readablePrint(dec.supplier_pk)}</span>
          </dd>
        </div>
      </dl>
      <div className="by-s-n">
        <b>N</b>
        <span className="mono">{`invoice fingerprint ${readablePrint(dec.nullifier)}`}</span>
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
      {/* a phone: what to do, in one sentence (DS-MOB P4); the codes are right below */}
      <p className="by-blank">{phone ? "Paste the code a supplier gave you by hand below, with its terms PDF." : "Paste the invoice code a supplier gave you by hand into the codes behind this sheet, with its terms PDF. Invoices addressed to your keys through the relay arrive in your inbox instead."}</p>
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
            From the financier<b>{readablePrint(lf.financier_pk)}</b>
          </p>
        </div>
        <p className="hint by-s-intro">From now on you pay the financier below, at this address, and nobody else.</p>
        <dl className="by-s-rows">
          <div>
            <dt lang="ja">
              譲受人<small>Financier</small>
            </dt>
            <dd>
              <span className="mono">{readablePrint(lf.financier_pk)}</span>
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
              文書<small>{kept && rec?.assignment?.pdf ? "The letter's PDF (fingerprint, checked)" : "The letter's PDF (fingerprint)"}</small>
            </dt>
            <dd>
              <span className="mono">{readablePrint(lf.terms_hash)}</span>
            </dd>
          </div>
        </dl>
        {kept && !rec?.assignment?.pdf && rec?.assignment?.pdf_away ? <p className="hint by-s-pdf">The letter's PDF is on your other device: this device has the letter and its fingerprint.</p> : null}
        {kept && rec?.assignment?.pdf ? (
          <div className="actions rp-small by-s-pdf">
            <Button
              secondary
              onClick={() => {
                const url = URL.createObjectURL(new Blob([fromB64(rec.assignment!.pdf!)], { type: "application/pdf" }));
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

  // ---------- the step beside the sheet ----------
  const pendingLines = (labels: string[], text: string) => labels.map((l, i) => <Check key={l} ok={null} label={l} text={text} i={i} />);
  const invLine = (label: string, value: string, i: number) => <Check key={label} ok={value === "not chosen" ? null : value.startsWith("matches") || value.startsWith("your") ? true : false} label={label} text={value} i={i} />;

  const sideSign = (
    <div className="by-side">
      <h2 className="by-side-h">Review and sign the invoice</h2>
      <p>Your signature confirms the trade happened. Check every field: this is what financiers rely on.</p>
      <ul className="by-checks" aria-label="Invoice checks">
        {invCheck
          ? [...invCheck.rows].reverse().map(([l, x], i) => invLine(l, x, i))
          : rec?.terms_checked && rec.invoice === codes.inv
            ? [<Check key="a" ok label="Addressed to" text={`your invoice key #${rec.key_index}`} i={0} />, <Check key="t" ok label="Terms PDF" text="matched the invoice when you checked it" i={1} />]
            : pendingLines(["Addressed to", "Terms PDF"], arrivedPdf ? `not checked yet · ${arrivedPdf.name} came with it` : "not checked yet")}
      </ul>
      {invCheck ? <Verdict kind={invCheck.kind} glyph={invCheck.kind === "ok" ? "認" : invCheck.kind === "warn" ? "待" : "拒"} title={invCheck.title} text={invCheck.text} /> : null}
      {rec?.signature ? (
        press === "sig" ? null : rec.signature_sent_at ? (
          <Verdict kind="ok" glyph="送" title="Signature sent" text="Sealed to the supplier's mailbox. The supplier offers the invoice to a financier next." land={false} />
        ) : (
          <SendSignature n={rec.n} sig={rec.signature} replyTo={rec.reply_to} />
        )
      ) : (
        <div className="actions">
          {/* one primary action: Check until it holds, then Sign */}
          <button type="button" className={checked === null ? undefined : "secondary"} disabled={!dec} onClick={() => void checkIt()}>
            Check invoice
          </button>
          <button type="button" className={checked === null ? "secondary" : undefined} disabled={checked === null || signing} onClick={() => void signIt()}>
            {signing ? "Signing…" : "Sign invoice"}
          </button>
        </div>
      )}
      {signOut.el}
    </div>
  );

  const sideSeal = (
    <div className="by-side">
      <h3>Acknowledge the assignment</h3>
      <p>Sealing the letter is your written acknowledgment that you will pay the financier named in it at maturity. The financier pays the supplier only after this.</p>
      <ul className="by-checks" aria-label="Letter checks">
        {letterRes ? letterRes.map((c, i) => <Check key={c.label} ok={c.ok} label={c.label} text={c.text} i={i} />) : pendingLines(["Letter for this invoice", "The letter's PDF", "Supplier's seal"], "not checked yet")}
      </ul>
      {letterRes ? (
        letterRes.some((c) => c.problem) ? (
          <Verdict kind="bad" glyph="拒" title="Do not seal" text={`${letterRes.flatMap((c) => (c.problem ? [c.problem] : [])).join("; ")}.`} />
        ) : (
          <Verdict kind="ok" glyph="認" title="Letter checks out" text="Same invoice, the PDF is the letter's document, and the supplier sealed this letter for this financier." />
        )
      ) : null}
      <div className="actions">
        <button type="button" className={letterOk === null ? undefined : "secondary"} onClick={() => void checkLetter()}>
          Check letter
        </button>
        <button type="button" className={letterOk === null ? "secondary" : undefined} disabled={letterOk === null || sealing} onClick={() => void sealIt()}>
          {sealing ? "Sealing…" : "Seal as buyer"}
        </button>
      </div>
      {sealOut.el}
    </div>
  );

  const doneText: [string, string] =
    act === "settled"
      ? ["Paid and remembered", "Your repayment settled. The financier countersigned your claim and sent the settlement bundle; your history certificate for this invoice now reads it."]
      : act === "pay"
        ? ["Pay at maturity", "All three seals hold for the letter this device kept, so its slip names where you pay. Only that letter is paid: a pasted letter could name anyone's address."]
        : ["Letter sealed by you", `Your seal went to the financier and the supplier${rec?.assignment?.sealed_at ? ` on ${new Date(rec.assignment.sealed_at).toISOString().slice(0, 10)}` : ""}. When the financier pays the supplier the advance, it seals the letter too; that seal arrives in your inbox and opens the payment slip.`];
  const sideDone = (
    <div className="by-side">
      <h3>{doneText[0]}</h3>
      <p>{doneText[1]}</p>
      <ul className="by-checks" aria-label="Seals on the kept letter">
        <Check ok={seals.supplier || null} label="Supplier's seal" text="売 · the first seal" i={0} />
        <Check ok={seals.buyer || null} label="Your seal" text="買 · the second seal" i={1} />
        <Check ok={seals.financier || null} label="Financier's seal" text={seals.financier ? "融 · the third seal, completes the letter" : "waiting in your inbox"} i={2} />
      </ul>
      {(act === "pay" || act === "settled") && rec ? (
        <p className="ia-goline by-goline">
          <span className="rp-hanko" lang="ja" aria-hidden="true">
            払
          </span>
          <span>
            {act === "pay" ? `The 払込票 slip for ${rec.invoice_id} is under Pay. ` : "Paid. "}
            <Link className="by-a" to={slipPath(rec.ref)}>
              {act === "pay" ? "Open the slip" : "See the paid slip"}
            </Link>
          </span>
        </p>
      ) : null}
      {sealOut.el}
    </div>
  );

  const codesFold = (
    <details className="by-codes" open={!start}>
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
          <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" defaultValue={start?.invoice ?? ""} onInput={onInvoice} ref={cInv} />
          {decProblem ? (
            <small className="by-code-bad" role="alert">
              {`This is not an invoice code this app can read. ${decProblem}`}
            </small>
          ) : (
            <small>Signing and sealing read this one invoice.</small>
          )}
        </label>
        <div className="rp-fieldset">
          <span>Terms PDF from the supplier</span>
          <FilePill label="Terms PDF from the supplier" empty={arrivedPdf ? `${arrivedPdf.name}, from your inbox` : awayPdf ? `${awayPdf.name}: PDF on your other device; choose it here to check` : "no file chosen"} inputRef={cTerms} onChange={lockSign} />
          <small>Hashed in your browser and compared with the invoice; the file is not sent anywhere. An invoice from your inbox brings its PDF.</small>
        </div>
        <label className="field">
          <span>Assignment letter code</span>
          <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" defaultValue={start?.assignment?.letter ?? ""} onInput={onLetter} ref={cLetter} />
        </label>
        <label className="field">
          <span>Supplier seal</span>
          <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" defaultValue={start?.assignment?.supplier_seal ?? ""} onInput={onLetter} ref={cSeal} />
        </label>
        <div className="rp-fieldset">
          <span>Assignment letter document (PDF)</span>
          <FilePill label="Assignment letter document (PDF)" empty={kept && rec?.assignment?.pdf ? "from your inbox" : kept && rec?.assignment?.pdf_away ? "PDF on your other device; choose it here to check" : "no file chosen"} inputRef={cLpdf} onChange={lockSeal} />
          <small>Hashed in your browser and compared with the letter. A letter from your inbox brings its PDF, so you can leave this empty.</small>
        </div>
      </div>
    </details>
  );

  const route = (
    <>
      <ol className="by-route" aria-label="Where this invoice is">
        {STATIONS.map((s, i) => {
          const waits = act === "wait-letter" || act === "wait-financier";
          const state = done[i] ? "done" : dec && i === nextSt ? (waits ? "wait" : "next") : "later";
          return (
            <li key={s.glyph} className={state === "later" ? undefined : state === "wait" ? "is-next is-wait" : `is-${state}`}>
              <b lang="ja" aria-hidden="true">
                {s.glyph}
              </b>
              <span>{s[state]}</span>
              <span className="by-sr">{state === "done" ? "done" : state === "next" ? "your move" : state === "wait" ? "waiting" : "later"}</span>
            </li>
          );
        })}
      </ol>
      <p className="by-route-cap" role="status">
        {dec ? (
          <>
            <b>{dec.invoice_id}</b>
            {`: ${routeCap}`}
          </>
        ) : (
          "Paste an invoice code below, or open one from your invoices."
        )}
      </p>
    </>
  );
  const desk = (
    <div className="by-desk">
      <div className="by-paper">{mode === "letter" ? letterSheet : invoiceSheet}</div>
      {side === "done" ? sideDone : side === "seal" ? sideSeal : sideSign}
    </div>
  );
  const title = (
    <h1 id="by-t" className="ia-doc-id">
      {dec ? dec.invoice_id : "An invoice given by hand"}
      {dec ? <span>{`${zatToZec(dec.amount_zat)} ZEC · due ${daysToDate(dec.due_date)}`}</span> : null}
    </h1>
  );
  const statuses = statusesOf(list, board);

  // DS-MOB L5: one tree at every width. On a phone the caption and the visual boxes step aside
  // (`.by-flat`, display: contents) and their parts stand in the screen's own column; the codes, the
  // PDFs and the checks stay where they are in the tree, so what is pasted or chosen survives a resize.
  return (
    <Page wide>
      <div className="rp by" ref={root}>
        <section className={phone ? "by-doc-phone" : "rp-sec"} aria-labelledby="by-t">
          <div className={phone ? "by-flat" : "rp-cap"}>
            <Tag section="Invoices" />
            {title}
            {!phone && list.length ? (
              <section className="ia-switch" aria-labelledby="by-sw-h">
                <div className="ia-switch-h">
                  <h2 id="by-sw-h">
                    <b lang="ja">台帳</b>Your invoices
                  </h2>
                  <Link to="/buyer/invoices">All invoices</Link>
                </div>
                <LongList
                  items={list}
                  keyOf={(x) => x.n}
                  stage={buyerStage}
                  words={ledgerWords}
                  labels={LEDGER_LABELS}
                  limit={5}
                  searchLabel="Search your invoices"
                  className="by-ledger is-compact"
                  render={(x) => <LedgerLine r={x} href={invoicePath(x.ref)} status={statuses?.[x.n]} current={x.n === rec?.n} />}
                />
              </section>
            ) : null}
          </div>
          <div className={phone ? "by-flat" : "rp-vis"}>
            {shown ? <DidLine did={shown} /> : null}
            {route}
            {desk}
            {codesFold}
          </div>
        </section>
      </div>
    </Page>
  );
}
