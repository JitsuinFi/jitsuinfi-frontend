// HNK-25.T1: signing stays off until the terms PDF matches and the key is the buyer's, run with
// `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "../src/lib/buyer-check.ts";

const H = "ab".repeat(32);

test("both checks hold: ready to sign", () => {
  const r = checkInvoice({ termsHash: H, fileHash: H.toUpperCase(), keyIndex: 2 });
  assert.equal(r.canSign, true);
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.rows, [["Terms PDF", "matches the invoice"], ["Addressed to", "you"]]);
});

test("a wrong PDF or a missing one keeps signing off", () => {
  const wrong = checkInvoice({ termsHash: H, fileHash: "cd".repeat(32), keyIndex: 0 });
  assert.deepEqual([wrong.canSign, wrong.kind], [false, "bad"]);
  assert.match(wrong.title, /not the invoiced document/);
  const none = checkInvoice({ termsHash: H, fileHash: null, keyIndex: 0 });
  assert.deepEqual([none.canSign, none.kind], [false, "warn"]);
  assert.equal(none.rows[0][1], "not chosen");
});

test("an invoice for another key is refused first, whatever the PDF", () => {
  const r = checkInvoice({ termsHash: H, fileHash: H, keyIndex: null });
  assert.deepEqual([r.canSign, r.kind, r.title], [false, "bad", "Not addressed to you"]);
  assert.equal(r.rows[1][1], "a key that is not yours");
});
