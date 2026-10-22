// HNK-32.T1, BL-D24-06: the buyer seals a letter only when it checks out, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { letterProblems } from "../src/lib/buyer-letter.ts";

const good = { matchesInvoice: true, termsHash: "ab".repeat(32), fileHash: "AB".repeat(32), supplierSeal: "AwaitingSeal:Buyer" };

test("a letter for this invoice, with its PDF and the supplier's seal, can be sealed", () => {
  assert.deepEqual(letterProblems(good), []);
});

test("a wrong PDF, a missing PDF, or a letter for another invoice is refused", () => {
  assert.deepEqual(letterProblems({ ...good, fileHash: "cd".repeat(32) }), ["the PDF is not the letter's document"]);
  assert.deepEqual(letterProblems({ ...good, fileHash: null }), ["choose the letter's PDF"]);
  assert.match(letterProblems({ ...good, matchesInvoice: false })[0], /another invoice/);
});

test("a letter the supplier did not seal for this financier is refused", () => {
  for (const supplierSeal of [null, "AwaitingSeal:Supplier", "AwaitingSeal:Financier", "Sealed"]) {
    assert.match(letterProblems({ ...good, supplierSeal }).join(), /supplier's seal does not hold/);
  }
});
