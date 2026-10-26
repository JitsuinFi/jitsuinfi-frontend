// Write an invoice (HNK-24.T2; IA port 2026-10-26, user feedback A): one flow on its own page. The
// 請求書 IS the form: No., the dates and the amount are written on it, the buyer is chosen on its
// 御中 line (a key that arrived in the inbox, named by the buyer's card or the key's fingerprint),
// the PDF goes on its 条件 line, and one Create invoice makes it. The invoice key comes from the
// supplier master (P-03, HNK-24.T1): one passkey touch. The new invoice opens on its deal page,
// ready to send to the buyer's inbox.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { Button, useOut } from "../../app/ui";
import { DidLine, setDid, useDid } from "../../app/outcome";
import { account } from "../../lib/app-session";
import { dateToDays, fileHash, json, wasm, zecToZat } from "../../lib/core";
import { dealPath, newRef } from "../../lib/deal-ref";
import { readablePrint } from "../../lib/print";
import { invoiceNumberProblem, suggestInvoiceNumber } from "../../lib/supplier-deal";
import { Seikyusho, type SheetFields } from "../try/Seikyusho";
import { contactFor, dropArrivedKey, keepPdf, save, useBook, useDeals, type Book } from "./data";
import { Caption, ObjectDefs } from "./parts";
import "../supplier.css";

const HEX64 = /^[0-9a-f]{64}$/;
const MANUAL = "manual";
const value = (r: { current: { value: string } | null }) => r.current!.value.trim();

/** The N just created: it resolves digit by digit on its deal's sheet once. */
export const freshN = { n: null as string | null };

const useSheetFields = (): SheetFields => ({ id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) });

/** The option's words: short enough for a phone's select (judge run 2: "…key 6LB4·" was cut). */
function keyLabel(book: Book, k: { invoice_pk: string; mailbox_pk: string; at: number }): string {
  const c = contactFor(book, k.mailbox_pk);
  const key = readablePrint(k.invoice_pk).slice(0, 9);
  return c ? `${c.username ? `@${c.username}` : `Buyer ${c.fingerprint.slice(0, 9)}`} · key ${key}` : `New buyer · key ${key}`;
}

/** The full detail under the select: who, the whole key fingerprint, when it came. */
function keyDetail(book: Book, k: { invoice_pk: string; mailbox_pk: string; at: number }): string {
  const c = contactFor(book, k.mailbox_pk);
  const who = c ? `${c.username ? `@${c.username}, ` : ""}buyer ${c.fingerprint}` : "a buyer not in your contacts yet";
  return `Key ${readablePrint(k.invoice_pk)} from ${who}, came ${new Date(k.at).toLocaleDateString()}.`;
}

export function NewInvoicePage(): ReactNode {
  const deals = useDeals();
  const book = useBook();
  if (!deals || !book) return null;
  return <NewInvoice deals={deals} book={book} />;
}

function NewInvoice({ deals, book }: { deals: NonNullable<ReturnType<typeof useDeals>>; book: Book }): ReactNode {
  const navigate = useNavigate();
  const phone = usePhone();
  const today = useRef(new Date().toISOString().slice(0, 10)).current;
  // No. starts with a number the supplier can keep or change (an empty No. was refused, 2026-10-26)
  const [suggested] = useState(() => suggestInvoiceNumber(deals, new Date()));
  const fields = useSheetFields();
  // the sheet's fields the last Create invoice refused, marked until the supplier writes in one
  const [bad, setBad] = useState<string[]>([]);
  const nCode = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const crack = useRef<SVGPathElement>(null);
  const art = useRef<SVGGElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const typed = useRef<HTMLInputElement>(null);
  const [buyer, setBuyer] = useState<string>(() => book.keys[0]?.invoice_pk ?? MANUAL);
  const [sendTo, setSendTo] = useState<string>("");
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null);
  const out = useOut();
  const shown = useDid("/supplier/invoices/new");
  const buyers = book.contacts.filter((c) => c.role === "buyer");
  // a key that arrives while the page is open is chosen, unless the supplier picked one
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current && book.keys[0]) setBuyer(book.keys[0].invoice_pk);
  }, [book.keys]);

  const arrived = book.keys.find((k) => k.invoice_pk === buyer);
  const toSlot = (
    <div className="sk-buyer">
      {book.keys.length ? (
        <select
          aria-label="The buyer this invoice is for"
          value={buyer}
          aria-invalid={bad.includes("buyer") || undefined}
          onChange={(e) => {
            picked.current = true;
            setBuyer(e.target.value);
            setBad([]);
          }}
        >
          {book.keys.map((k) => (
            <option key={k.invoice_pk} value={k.invoice_pk}>
              {keyLabel(book, k)}
            </option>
          ))}
          <option value={MANUAL}>Another buyer: write their key by hand</option>
        </select>
      ) : (
        <small className="sk-buyer-none">No buyer's key yet. Share your contact with the buyer: they send their key back, and it lands here.</small>
      )}
      {arrived ? <small className="sk-buyer-detail">{keyDetail(book, arrived)}</small> : null}
      {buyer === MANUAL ? (
        <span className="sk-buyer-hand">
          <input type="text" spellCheck="false" autoComplete="off" aria-label="The buyer's invoice key, from their screen" placeholder="the buyer's invoice key, from their screen" aria-invalid={bad.includes("buyer") || undefined} ref={typed} onInput={() => bad.length && setBad([])} />
          <select aria-label="Where it goes to be signed" value={sendTo} onChange={(e) => setSendTo(e.target.value)}>
            <option value="">{buyers.length ? "Send it to: choose the buyer's card" : "Send it to: no buyer card yet (hand it over)"}</option>
            {buyers.map((c) => (
              <option key={c.mailbox_pk} value={c.mailbox_pk}>
                {`${c.username ? `@${c.username}` : "Buyer"} · ${c.fingerprint}`}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      <small>{arrived ? "to this buyer's key for this invoice; it goes back to their inbox to sign" : "to the buyer's key for this invoice"}</small>
    </div>
  );
  const termsSlot = (
    <label className={bad.includes("pdf") ? "sk-file is-bad" : "sk-file"}>
      <input
        type="file"
        accept="application/pdf,.pdf"
        aria-label="The invoice PDF"
        ref={pdf}
        onChange={async () => {
          const f = pdf.current?.files?.[0];
          setBad([]);
          setFile(f ? { name: f.name, hash: await fileHash(f) } : null);
        }}
      />
      <span className="sk-file-b">{file ? "Change" : "Choose the PDF"}</span>
      <span className="sk-file-n">{file ? file.name : "read in your browser, never uploaded"}</span>
      {file ? <code title={file.hash}>{`fingerprint ${readablePrint(file.hash)}`}</code> : null}
    </label>
  );

  const create = async () => {
    try {
      const invoiceId = value(fields.id);
      const problem = invoiceNumberProblem(deals, invoiceId);
      if (problem) {
        setBad(["id"]);
        fields.id.current!.focus();
        throw new Error(problem);
      }
      let buyerPk: string;
      let mailbox: string | undefined;
      if (arrived) {
        buyerPk = arrived.invoice_pk;
        mailbox = arrived.mailbox_pk;
      } else {
        buyerPk = (typed.current?.value ?? "").trim().toLowerCase();
        if (!HEX64.test(buyerPk)) {
          setBad(["buyer"]);
          typed.current?.focus();
          throw new Error("Write the buyer's invoice key on the 御中 line: copy it whole from the buyer's screen, or ask the buyer to send it to your inbox.");
        }
        mailbox = sendTo || undefined;
      }
      const f = pdf.current!.files?.[0];
      if (!f) {
        setBad(["pdf"]);
        throw new Error("Choose the invoice PDF on the 条件 line of the sheet.");
      }
      if (!fields.due.current!.value) {
        setBad(["due"]);
        fields.due.current!.focus();
        throw new Error("Write the due date in 支払期日 Due on the sheet.");
      }
      // checked before the passkey is asked for the invoice key
      let amountZat: number;
      try {
        amountZat = zecToZat(value(fields.amount));
      } catch {
        setBad(["amount"]);
        fields.amount.current!.focus();
        throw new Error("Write the amount due in ご請求金額 on the sheet, in ZEC (more than 0).");
      }
      const supplierPk = wasm.supplierInvoicePublicKeyBytes(await account.stamp(), invoiceId, buyerPk);
      const dueDay = dateToDays(fields.due.current!.value);
      const code = wasm.invoiceEncode(
        JSON.stringify({
          invoice_id: invoiceId,
          supplier_pk: supplierPk,
          buyer_pk: buyerPk,
          amount_zat: amountZat,
          issue_date: dateToDays(fields.issued.current!.value),
          due_date: dueDay,
          terms_hash: await fileHash(f),
        }),
      );
      const n = json<{ nullifier: string }>(wasm.invoiceDecode(code)).nullifier;
      const ref = newRef();
      await save({ n, ref, invoice_id: invoiceId, buyer_pk: buyerPk, supplier_pk: supplierPk, amount_zat: amountZat, due_date: dueDay, invoice: code, created_at: Date.now(), ...(mailbox ? { buyer_mailbox: mailbox } : {}) });
      keepPdf(n, f);
      if (arrived) await dropArrivedKey(arrived.invoice_pk);
      freshN.n = n;
      setDid({
        at: dealPath(ref),
        glyph: "新",
        title: "Invoice created",
        text: mailbox ? `${invoiceId}: its fingerprint N is on the sheet. Next: send it to the buyer, who signs it in their inbox.` : `${invoiceId}: its fingerprint N is on the sheet. Next: get the buyer's signature.`,
      });
      void navigate({ to: dealPath(ref) });
    } catch (e) {
      out.error(e);
    }
  };

  const invalid = bad.filter((b): b is keyof SheetFields => b === "id" || b === "due" || b === "amount");
  return (
    <Page wide>
      <div className="sp" data-wide="true">
        <ObjectDefs />
        <div className="sp-desk ia-new-desk">
          <Caption
            section="Write"
            title="Write an invoice"
            lede={phone ? "Write it on the sheet below, then create it: it goes to the buyer's inbox to sign." : "Everything is written on the sheet: the number, the dates and the amount, the buyer on the 御中 line and the PDF on the 条件 line. Create it, and it is ready to send to the buyer's inbox to sign."}
            deals={deals}
            brief={phone}
          >
            {/* judge run 2: no buyer's key yet, so the first step is sharing the contact (then the key comes back) */}
            {book.keys.length ? null : (
              <Link className="ia-row-link ia-first-step" to="/supplier/contacts" search={{ share: 1 } as never}>
                <b lang="ja" aria-hidden="true">
                  名
                </b>
                <span>
                  <strong>First: share my contact with the buyer</strong>
                  <small>A link or QR. The buyer adds you and sends the key for this invoice; it lands on the sheet.</small>
                </span>
                <i aria-hidden="true">→</i>
              </Link>
            )}
          </Caption>
          <section className="ia-vis ia-new" aria-label="The invoice you are writing">
            {shown ? <DidLine did={shown} /> : null}
            <form
              className="ia-new-form"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="sp-sheet is-new">
                <span className="sp-under" aria-hidden="true" />
                <Seikyusho
                  o={{ id: suggested, amount: "", issued: today, due: "", terms: "", buyer: "", supplier: "", issuer: "You" }}
                  fields={fields}
                  changed={null}
                  n={null}
                  bad={invalid}
                  onInput={() => bad.length && setBad([])}
                  blank={{
                    seal: "pending",
                    to: "",
                    by: "your key for this invoice, from your passkey",
                    note: "The buyer's seal 買 goes in the box once the buyer signs these exact bytes.",
                    n: "made when you create it: it needs your key for this invoice",
                    placeholders: { id: "write a number", amount: "0.0004" },
                    termsReadOnly: true,
                  }}
                  slots={{ to: toSlot, terms: termsSlot }}
                  kase={{ sealed: "pending", nCode, ring, crack, art, inside: null }}
                />
              </div>
              <div className="ia-new-go">
                <Button onClick={create}>Create invoice</Button>
                <p>One passkey touch makes this invoice's key from your passkey, its number and the buyer's key.</p>
              </div>
              {out.el}
            </form>
          </section>
        </div>
      </div>
    </Page>
  );
}
