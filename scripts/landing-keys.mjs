// The landing's test actors and its invoices (jitsuin-wasm). Every key is derived from a TES- label,
// so the values are public and reproducible. Usage: node scripts/landing-keys.mjs src/wasm
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = process.argv[2];
const w = await import(dir + "/jitsuin_wasm.js");
w.initSync({ module: readFileSync(dir + "/jitsuin_wasm_bg.wasm") });
const sk = (s) => createHash("sha256").update(s).digest("hex");
const days = (d) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
const supplierSecret = sk("TES-landing-supplier");
const buyerMaster = sk("TES-landing-buyer-master");
const financierSecret = sk("TES-landing-financier-a");
const supplier_pk = w.publicKey(supplierSecret);
/// The buyer's invoices: index i of the master is TES-INV-000i. 0..6 are its paid history (due a
/// month apart, 60 days net); 7 is the landing invoice, due 2026-12-18.
export const HISTORY = [
  { amount_zat: 25000, due: "2026-04-15", paid: "2026-04-14" },
  { amount_zat: 32000, due: "2026-05-15", paid: "2026-05-15" },
  { amount_zat: 18000, due: "2026-06-12", paid: "2026-06-10" },
  { amount_zat: 40000, due: "2026-07-15", paid: "2026-07-15" },
  { amount_zat: 27500, due: "2026-08-14", paid: "2026-08-17" },
  { amount_zat: 36000, due: "2026-09-15", paid: "2026-09-15" },
  { amount_zat: 30000, due: "2026-10-15", paid: "2026-10-13" },
];
const invoiceOf = (i) => {
  const id = `TES-INV-000${i}`;
  const buyer_pk = JSON.parse(w.buyerKeys(buyerMaster, i)).invoice_pk;
  const h = HISTORY[i];
  const due = h ? days(h.due) : days("2026-12-18");
  const fields = {
    invoice_id: id, supplier_pk, buyer_pk, amount_zat: h ? h.amount_zat : 40000,
    issue_date: h ? due - 60 : days("2026-10-19"), due_date: due,
    terms_hash: createHash("sha256").update(`${id} terms: 60 days net`).digest("hex"),
  };
  const code = w.invoiceEncode(JSON.stringify(fields));
  return { fields, code, n: w.invoiceNullifier(code) };
};
const rows = [1, 2, 3, 4, 5, 6].map((i) => invoiceOf(i).n);
const hero = invoiceOf(7);
console.log(JSON.stringify({
  supplierSecret, buyerMaster, buyerIndex: 7, financierSecret,
  financier_pk: w.publicKey(financierSecret),
  assignment_terms: createHash("sha256").update("TES-INV-0007 assignment terms").digest("hex"),
  hero: hero.fields, heroN: hero.n, boardRows: rows,
  history: HISTORY.map((h, i) => ({ ...invoiceOf(i).fields, n: invoiceOf(i).n, paid: days(h.paid) })),
}, null, 1));
