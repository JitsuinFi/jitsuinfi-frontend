import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = process.argv[2];
const w = await import(dir + "/jitsuin_wasm.js");
w.initSync({ module: readFileSync(dir + "/jitsuin_wasm_bg.wasm") });
const sk = (s) => createHash("sha256").update(s).digest("hex");
const days = (d) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
const sup = w.publicKey(sk("TES-landing-supplier"));
const buy = w.publicKey(sk("TES-landing-buyer"));
const code = w.invoiceEncode(JSON.stringify({
  invoice_id: "TES-INV-0007", supplier_pk: sup, buyer_pk: buy, amount_zat: 40000,
  issue_date: days("2026-10-19"), due_date: days("2026-12-18"),
  terms_hash: createHash("sha256").update("TES-INV-0007 terms: 60 days net").digest("hex"),
}));
console.log(JSON.stringify({ n: w.invoiceNullifier(code), dec: JSON.parse(w.invoiceDecode(code)) }, null, 1));
