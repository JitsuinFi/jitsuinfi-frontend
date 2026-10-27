// Messy-state E2E 2026-10-27: the logic behind its fixes, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice, signedWithKey } from "../src/lib/buyer-check.ts";
import { keyTakenNote } from "../src/lib/key-match.ts";
import { tiedTo } from "../src/lib/letter-away.ts";

const H = "ab".repeat(32);

test("a key already on a signed invoice is said before the buyer signs a second one", () => {
  const list = [
    { n: "n1", key_index: 0, invoice_id: "TES-INV-A", signature: "s" },
    { n: "n2", key_index: 0, invoice_id: "TES-INV-B" },
    { n: "n3", key_index: 1, invoice_id: "TES-INV-C", signature: "s" },
  ];
  assert.deepEqual(signedWithKey(0, "n2", list), ["TES-INV-A"]);
  assert.deepEqual(signedWithKey(0, "n1", list), []);
  const r = checkInvoice({ termsHash: H, fileHash: H, keyIndex: 0, sameKey: ["TES-INV-A"] });
  assert.deepEqual([r.canSign, r.kind], [true, "warn"]);
  assert.match(r.title, /^Key #0 is on another invoice already$/);
  assert.match(r.text, /only one invoice per key can be financed/);
  assert.deepEqual(r.rows[1], ["Addressed to", "you, with a key already used on TES-INV-A"]);
  assert.equal(checkInvoice({ termsHash: H, fileHash: H, keyIndex: 0, sameKey: [] }).kind, "ok");
});

test("the next key says when invoices on this device already name it", () => {
  assert.equal(keyTakenNote(0, []), null);
  const one = keyTakenNote(0, [{ invoice_id: "TES-INV-A", signed: true }])!;
  assert.equal(one.kind, "warn");
  assert.match(one.title, /Key #0 is on TES-INV-A already/);
  assert.match(one.text, /next key comes only once TES-INV-A is financed/);
  const two = keyTakenNote(3, [{ invoice_id: "A", signed: true }, { invoice_id: "B", signed: false }])!;
  assert.equal(two.kind, "bad");
  assert.match(two.title, /Key #3 is on 2 invoices: A, B/);
});

test("a letter about an invoice another device holds is marked, the exceptions are not", async () => {
  const run = async () => ({ said: "" });
  const h = tiedTo({ "invoice.signature": { run }, "key.invoice_pk": { run } }, async (n) => n === "here", ["key.invoice_pk"]);
  const letter = (n: string) => ({ message: { header: { n } } }) as never;
  assert.equal(await h["invoice.signature"]!.elsewhere!(letter("here")), false);
  assert.equal(await h["invoice.signature"]!.elsewhere!(letter("gone")), true);
  assert.equal(h["key.invoice_pk"]!.elsewhere, undefined);
});

test("the invoice PDF: empty, not a PDF and over 2 MiB are refused before an invoice is bound to it", async () => {
  const { pdfProblem } = await import("../src/lib/pdf-check.ts");
  const pdf = new TextEncoder().encode("%PDF-1.7");
  assert.match(pdfProblem("a.pdf", 0, new Uint8Array()) ?? "", /a\.pdf is empty/);
  assert.match(pdfProblem("notes.pdf", 17, new TextEncoder().encode("hello")) ?? "", /is not a PDF/);
  assert.match(pdfProblem("big.pdf", 5 * 1048576, pdf) ?? "", /5\.0 MiB: the relay carries up to 2 MiB/);
  assert.equal(pdfProblem("ok.pdf", 2 * 1048576, pdf), null);
});
