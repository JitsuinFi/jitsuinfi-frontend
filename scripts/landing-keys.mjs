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
const invoiceOf = (i) => {
  const id = `TES-INV-000${i}`;
  const buyer_pk = JSON.parse(w.buyerKeys(buyerMaster, i)).invoice_pk;
  const fields = {
    invoice_id: id, supplier_pk, buyer_pk, amount_zat: 40000,
    issue_date: days("2026-10-19"), due_date: days("2026-12-18"),
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
}, null, 1));
