// The invoice as a Japanese 請求書 (MASTER.md §8, reference vault 09-Design PIN-04): the judge
// types onto the document itself. Only the invoice's real fields appear (no invented line items):
// number, issue date, buyer key (the addressee, 御中), amount due, due date, terms hash, supplier
// key; N is computed from them. The buyer's seal 買 sits in the 受領印 box and cracks the moment
// the bytes differ from the ones the buyer signed.
import type { ReactNode, RefObject } from "react";

const short = (x: string) => `${x.slice(0, 10)}…${x.slice(-6)}`;

export interface SheetFields {
  id: RefObject<HTMLInputElement | null>;
  amount: RefObject<HTMLInputElement | null>;
  issued: RefObject<HTMLInputElement | null>;
  due: RefObject<HTMLInputElement | null>;
  terms: RefObject<HTMLInputElement | null>;
}

export interface SheetValues {
  id: string;
  amount: string;
  issued: string;
  due: string;
  terms: string;
  buyer: string;
  supplier: string;
  issuer: string;
}

const KEYS: Array<[keyof SheetFields, string]> = [
  ["id", "invoice_id"],
  ["amount", "amount_zat"],
  ["issued", "issue_date"],
  ["due", "due_date"],
  ["terms", "terms_hash"],
];
const WORD: Record<string, string> = { invoice_id: "number", amount_zat: "amount", issue_date: "issue date", due_date: "due date", terms_hash: "terms" };

/** A blank sheet to write on (the supplier's new invoice): its own words where /try shows data. */
export interface BlankSheet {
  seal: string;
  to: string;
  by: string;
  note: string;
  n: string;
  placeholders: Partial<Record<keyof SheetFields, string>>;
  termsReadOnly: boolean;
}

/**
 * The sheet. Its inputs are uncontrolled (the page reads and resets them through `fields`);
 * `changed` marks edited fields and cracks the seal (null: not compared, as on a blank sheet),
 * `n` is the fingerprint of these bytes.
 */
export function Seikyusho({ o, fields, changed, n, onInput, sheet, blank }: { o: SheetValues; fields: SheetFields; changed: string[] | null; n: string | null; onInput?: () => void; sheet?: RefObject<HTMLElement | null>; blank?: BlankSheet }): ReactNode {
  const isChanged = (k: keyof SheetFields) => {
    if (changed === null) return undefined;
    const f = KEYS.find(([key]) => key === k)![1];
    return String(changed.includes(f) || changed.includes("unreadable"));
  };
  const input = (k: keyof SheetFields, label: string, value: string, opts: { type?: string; mono?: boolean; size?: number } = {}) => (
    <input
      type={opts.type ?? "text"}
      spellCheck="false"
      autoComplete="off"
      aria-label={label}
      className={opts.mono ? "is-mono" : undefined}
      defaultValue={value}
      size={opts.size}
      placeholder={blank?.placeholders[k]}
      readOnly={blank && k === "terms" ? blank.termsReadOnly : undefined}
      data-changed={isChanged(k)}
      ref={fields[k]}
      onInput={onInput}
    />
  );
  const row = (jp: string, en: string, value: ReactNode) => (
    <tr>
      <th scope="row">
        <span>{jp}</span>
        <small>{en}</small>
      </th>
      <td>{value}</td>
    </tr>
  );
  const note = blank
    ? blank.note
    : !changed?.length
    ? "The buyer sealed exactly these bytes."
    : changed[0] === "unreadable"
      ? "This is no longer a valid invoice: no seal can hold."
      : `You changed the ${changed.map((c) => WORD[c]).join(", ")}. The buyer's seal no longer holds.`;

  return (
    <article className="sk" aria-label="The invoice (請求書)" data-seal={blank ? blank.seal : changed?.length ? "broken" : "whole"} ref={sheet}>
      <header className="sk-head">
        <h2 className="sk-title">
          <span lang="ja">請 求 書</span>
          <small>Invoice</small>
        </h2>
        <dl className="sk-meta">
          <div>
            <dt>No.</dt>
            <dd>{input("id", "Invoice number", o.id, { mono: true })}</dd>
          </div>
          <div>
            <dt>
              <span lang="ja">発行日</span> Issued
            </dt>
            <dd>{input("issued", "Issue date", o.issued, { type: "date" })}</dd>
          </div>
        </dl>
      </header>
      <p className="sk-to">
        <code title={o.buyer}>{blank ? blank.to : short(o.buyer)}</code>
        <span lang="ja">御中</span>
        <small>to the buyer's invoice key</small>
      </p>
      <label className="sk-total">
        <span className="sk-total-k">
          <span lang="ja">ご請求金額</span>
          <small>Amount due</small>
        </span>
        <span className="sk-total-v">
          {input("amount", "Amount due in ZEC", o.amount, { size: 8 })}
          <b>ZEC</b>
        </span>
      </label>
      <table className="sk-table">
        <tbody>
          {row("支払期日", "Due", input("due", "Due date", o.due, { type: "date" }))}
          {row("条件", "Terms, SHA-256 of the PDF", input("terms", "Terms: SHA-256 of the invoice PDF", o.terms, { mono: true }))}
          {row(
            "発行者",
            "Issuer",
            <>
              <span className="sk-issuer">{o.issuer}</span>
              <code title={o.supplier}>{blank ? blank.by : short(o.supplier)}</code>
            </>,
          )}
        </tbody>
      </table>
      <footer className="sk-foot">
        <div className="sk-n">
          <span className="sk-n-k">N</span>
          <div>
            <code>{blank ? blank.n : (n ?? "none: the fields do not make an invoice")}</code>
            <small>Fingerprint of these exact bytes, computed in your browser</small>
          </div>
        </div>
        <div className="sk-box">
          <span lang="ja">受領印</span>
          <span className="sk-seal" aria-hidden="true">
            <span className="sk-seal-ink">買</span>
            <span className="sk-seal-crack" />
          </span>
          <small>Buyer's seal</small>
        </div>
      </footer>
      <p className="sk-note" aria-live="polite">
        {note}
      </p>
    </article>
  );
}
