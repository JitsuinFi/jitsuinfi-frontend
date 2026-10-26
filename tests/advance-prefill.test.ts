// Judge run 2, finding 6: the advance amount comes from the financier's notice; the supplier confirms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { advancePrefill, advanceRecord } from "../src/lib/supplier-deal.ts";

const offer = { financier_pk: "f".repeat(64), advance_zat: 90_000, supplier_address: "utest1x" };
const txid = "24".repeat(32);

test("the notice fills the amount and the transaction to confirm", () => {
  const p = advancePrefill({ offer, advance_notice: { txid, advance_zat: 90_000, at: 5 } });
  assert.deepEqual(p, { zat: 90_000, txid, at: 5, agreedZat: 90_000, asAgreed: true });
});

test("a notice for another amount says so before anything is confirmed", () => {
  assert.equal(advancePrefill({ offer, advance_notice: { txid, advance_zat: 80_000, at: 5 } })!.asAgreed, false);
});

test("no notice (or no offer): nothing to prefill, the amount is written by hand", () => {
  assert.equal(advancePrefill({ offer }), null);
  assert.equal(advancePrefill({ advance_notice: { txid, advance_zat: 1, at: 1 } }), null);
});

test("confirming records a match; a different amount records the difference", () => {
  assert.deepEqual(advanceRecord({ offer }, 90_000, txid), { txid, received_zat: 90_000, matches: true });
  assert.deepEqual(advanceRecord({ offer }, 70_000, txid), { txid, received_zat: 70_000, matches: false });
  assert.throws(() => advanceRecord({ offer }, 0, txid), /more than 0/);
  assert.throws(() => advanceRecord({}, 1, txid), /no offer/);
});
