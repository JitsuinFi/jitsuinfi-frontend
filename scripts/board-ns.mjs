// Fingerprints N for the landing's public board: TES-INV-0001..0009 with the test keys of
// scripts/hero-n.mjs (jitsuin-wasm). Usage: node scripts/board-ns.mjs src/wasm
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = process.argv[2];
const w = await import(dir + "/jitsuin_wasm.js");
w.initSync({ module: readFileSync(dir + "/jitsuin_wasm_bg.wasm") });
const sk = (s) => createHash("sha256").update(s).digest("hex");
const days = (d) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
const sup = w.publicKey(sk("TES-landing-supplier"));
const buy = w.publicKey(sk("TES-landing-buyer"));
const out = [];
for (let i = 1; i <= 9; i++) {
  const id = `TES-INV-000${i}`;
  const code = w.invoiceEncode(JSON.stringify({
    invoice_id: id, supplier_pk: sup, buyer_pk: buy, amount_zat: 40000,
    issue_date: days("2026-10-19"), due_date: days("2026-12-18"),
    terms_hash: createHash("sha256").update(`${id} terms: 60 days net`).digest("hex"),
  }));
  out.push([id, w.invoiceNullifier(code)]);
}
console.log(JSON.stringify(out));
