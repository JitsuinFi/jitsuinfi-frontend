// Kept for the DOM pages until they move to components (supplier: HNK-31.T8, verify: T6).
// The invoice as a Japanese 請求書 (MASTER.md §8, reference vault 09-Design PIN-04): the judge
// types onto the document itself. Only the invoice's real fields appear (no invented line items):
// number, issue date, buyer key (the addressee, 御中), amount due, due date, terms hash, supplier
// key; N is computed from them. The buyer's seal 買 sits in the 受領印 box and cracks the moment
// the bytes differ from the ones the buyer signed.
import { h } from "../../lib/ui";

const short = (x: string) => `${x.slice(0, 10)}…${x.slice(-6)}`;

export interface SheetFields {
  id: HTMLInputElement;
  amount: HTMLInputElement;
  issued: HTMLInputElement;
  due: HTMLInputElement;
  terms: HTMLInputElement;
}

export interface Seikyusho {
  el: HTMLElement;
  fields: SheetFields;
  /** Marks edited fields and cracks the seal when any field differs from the signed bytes. */
  setChanged(changed: string[]): void;
  setN(n: string | null): void;
}

function input(label: string, value: string, opts: { type?: string; mono?: boolean; size?: number } = {}): HTMLInputElement {
  const i = h("input", { type: opts.type ?? "text", spellcheck: "false", autocomplete: "off", "aria-label": label, class: opts.mono ? "is-mono" : undefined }) as HTMLInputElement;
  i.value = value;
  if (opts.size) i.size = opts.size;
  return i;
}

export function seikyusho(o: { id: string; amount: string; issued: string; due: string; terms: string; buyer: string; supplier: string; issuer: string }): Seikyusho {
  const fields: SheetFields = {
    id: input("Invoice number", o.id, { mono: true }),
    amount: input("Amount due in ZEC", o.amount, { size: 8 }),
    issued: input("Issue date", o.issued, { type: "date" }),
    due: input("Due date", o.due, { type: "date" }),
    terms: input("Terms: SHA-256 of the invoice PDF", o.terms, { mono: true }),
  };
  const nCode = h("code", {}, "");
  const note = h("p", { class: "sk-note", "aria-live": "polite" }, "");
  const seal = h(
    "span",
    { class: "sk-seal", "aria-hidden": "true" },
    h("span", { class: "sk-seal-ink" }, "買"),
    h("span", { class: "sk-seal-crack" }),
  );
  const row = (jp: string, en: string, ...value: Node[]) => h("tr", {}, h("th", { scope: "row" }, h("span", {}, jp), h("small", {}, en)), h("td", {}, ...value));

  const el = h(
    "article",
    { class: "sk", "aria-label": "The invoice (請求書)", "data-seal": "whole" },
    h(
      "header",
      { class: "sk-head" },
      h("h2", { class: "sk-title" }, h("span", { lang: "ja" }, "請 求 書"), h("small", {}, "Invoice")),
      h(
        "dl",
        { class: "sk-meta" },
        h("div", {}, h("dt", {}, "No."), h("dd", {}, fields.id)),
        h("div", {}, h("dt", {}, h("span", { lang: "ja" }, "発行日"), " Issued"), h("dd", {}, fields.issued)),
      ),
    ),
    h("p", { class: "sk-to" }, h("code", { title: o.buyer }, short(o.buyer)), h("span", { lang: "ja" }, "御中"), h("small", {}, "to the buyer's invoice key")),
    h(
      "label",
      { class: "sk-total" },
      h("span", { class: "sk-total-k" }, h("span", { lang: "ja" }, "ご請求金額"), h("small", {}, "Amount due")),
      h("span", { class: "sk-total-v" }, fields.amount, h("b", {}, "ZEC")),
    ),
    h(
      "table",
      { class: "sk-table" },
      h(
        "tbody",
        {},
        row("支払期日", "Due", fields.due),
        row("条件", "Terms, SHA-256 of the PDF", fields.terms),
        row("発行者", "Issuer", h("span", { class: "sk-issuer" }, o.issuer), h("code", { title: o.supplier }, short(o.supplier))),
      ),
    ),
    h(
      "footer",
      { class: "sk-foot" },
      h("div", { class: "sk-n" }, h("span", { class: "sk-n-k" }, "N"), h("div", {}, nCode, h("small", {}, "Fingerprint of these exact bytes, computed in your browser"))),
      h("div", { class: "sk-box" }, h("span", { lang: "ja" }, "受領印"), seal, h("small", {}, "Buyer's seal")),
    ),
    note,
  );

  const KEYS: Array<[keyof SheetFields, string]> = [
    ["id", "invoice_id"],
    ["amount", "amount_zat"],
    ["issued", "issue_date"],
    ["due", "due_date"],
    ["terms", "terms_hash"],
  ];
  const WORD: Record<string, string> = { invoice_id: "number", amount_zat: "amount", issue_date: "issue date", due_date: "due date", terms_hash: "terms" };
  return {
    el,
    fields,
    setChanged(changed) {
      el.dataset.seal = changed.length ? "broken" : "whole";
      for (const [k, f] of KEYS) fields[k].dataset.changed = String(changed.includes(f) || changed.includes("unreadable"));
      note.textContent = !changed.length
        ? "The buyer sealed exactly these bytes."
        : changed[0] === "unreadable"
          ? "This is no longer a valid invoice: no seal can hold."
          : `You changed the ${changed.map((c) => WORD[c]).join(", ")}. The buyer's seal no longer holds.`;
    },
    setN(n) {
      nCode.textContent = n ?? "none: the fields do not make an invoice";
    },
  };
}
