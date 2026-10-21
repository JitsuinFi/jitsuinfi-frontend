// HNK-24.T5, T6, T9: supplier deal timeline, offer code and entry request code, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionOf,
  decodeEntryRequest,
  decodeOffer,
  encodeEntryRequest,
  encodeOffer,
  entryRequestProblems,
  invoiceIdTaken,
  looksShielded,
  nextAction,
  nextStep,
  sortDeals,
  timeline,
  type SupplierDeal,
} from "../src/lib/supplier-deal.ts";

function deal(over: Partial<SupplierDeal> = {}): SupplierDeal {
  return {
    n: "ab".repeat(32),
    invoice_id: "TES-INV-0001",
    buyer_pk: "22".repeat(32),
    supplier_pk: "11".repeat(32),
    amount_zat: 40_000,
    due_date: 20_030,
    invoice: "JTSI",
    created_at: 1_000,
    ...over,
  };
}

test("the timeline walks the supplier steps in order", () => {
  const d = deal();
  assert.equal(nextStep(d), "signature");
  assert.deepEqual(
    timeline(d).map((s) => s.state),
    ["next", "later", "later", "later", "later"],
  );
  const signed = deal({ buyer_signature: "00".repeat(64), offer: { financier_pk: "33".repeat(32), advance_zat: 38_000, supplier_address: "utest1x" } });
  assert.equal(nextStep(signed), "entry");
  assert.deepEqual(
    timeline(signed).map((s) => s.state),
    ["done", "done", "next", "later", "later"],
  );
});

test("an advance that does not match is not done", () => {
  const base = {
    buyer_signature: "00",
    offer: { financier_pk: "33", advance_zat: 38_000, supplier_address: "utest1x" },
    entry: { memo: "m", commitment: "c", tagged: false, discount: 0, tenor: 0 },
    seal: { letter: "l", s0: "s" },
  };
  assert.equal(nextStep(deal({ ...base, advance: { txid: "t", received_zat: 30_000, matches: false } })), "advance");
  assert.equal(nextStep(deal({ ...base, advance: { txid: "t", received_zat: 38_000, matches: true } })), null);
});

test("a reused invoice id is detected and deals sort newest first", () => {
  const ds = [deal({ invoice_id: "TES-INV-0001", created_at: 1 }), deal({ invoice_id: "TES-INV-0002", created_at: 5 })];
  assert.ok(invoiceIdTaken(ds, " TES-INV-0001 "));
  assert.ok(!invoiceIdTaken(ds, "TES-INV-0003"));
  assert.deepEqual(sortDeals(ds).map((d) => d.invoice_id), ["TES-INV-0002", "TES-INV-0001"]);
});

test("offer codes roundtrip and incomplete ones are refused", () => {
  const o = { invoice: "JTSI-abc_-", buyer_signature: "00".repeat(64), financier_pk: "33".repeat(32), advance_zat: 38_000, supplier_address: "utest1" + "q".repeat(40) };
  const code = encodeOffer(o);
  assert.ok(code.startsWith("jitsuin-offer-v1:"));
  assert.deepEqual(decodeOffer(code), o);
  assert.throws(() => decodeOffer("hello"));
  assert.throws(() => decodeOffer(encodeOffer({ ...o, advance_zat: 0 })));
});

test("the next step reads as an action", () => {
  assert.equal(actionOf(nextStep(deal())!), "check the buyer's signature");
});

test("shielded address check", () => {
  assert.ok(looksShielded("utest1" + "q".repeat(40)));
  assert.ok(!looksShielded("u1" + "a".repeat(60))); // a mainnet address on a testnet build
  assert.ok(looksShielded("u1" + "a".repeat(60), "main"));
  assert.ok(!looksShielded("utest1" + "q".repeat(40), "main"));
  assert.ok(!looksShielded("tmQ9vB5kGuUqFdQ2UxQ1eVLdJfhJ4Tw7Rt"));
  assert.ok(!looksShielded("utest1short"));
});

const offer = { financier_pk: "33".repeat(32), advance_zat: 38_000, supplier_address: "utest1x" };
const request = { n: "ab".repeat(32), financier_pk: "33".repeat(32), salt: "44".repeat(32), discount: 3, tenor: 1 };

test("the entry waits for the financier's request (SEQ-03)", () => {
  const offered = deal({ buyer_signature: "00", offer });
  assert.equal(nextStep(offered), "entry");
  assert.equal(nextAction(offered), "wait for the financier's entry request");
  assert.equal(nextAction(deal({ buyer_signature: "00", offer, entry_request: request })), "sign the board entry");
  assert.equal(nextAction(deal()), "check the buyer's signature");
});

test("entry request codes roundtrip, with and without classes and tag", () => {
  assert.deepEqual(decodeEntryRequest(encodeEntryRequest(request)), request);
  const plain = { n: request.n, financier_pk: request.financier_pk, salt: request.salt };
  assert.deepEqual(decodeEntryRequest(encodeEntryRequest(plain)), plain);
  const tagged = { ...plain, history_tag: "55".repeat(32) };
  assert.deepEqual(decodeEntryRequest(encodeEntryRequest(tagged)), tagged);
});

test("bad entry request codes are refused", () => {
  assert.throws(() => decodeEntryRequest(encodeOffer({ invoice: "J", buyer_signature: "00", ...offer })));
  assert.throws(() => decodeEntryRequest(encodeEntryRequest({ ...request, salt: "44" })));
  assert.throws(() => decodeEntryRequest(encodeEntryRequest({ ...request, tenor: undefined })));
  assert.throws(() => decodeEntryRequest(encodeEntryRequest({ ...request, discount: 8 })));
  assert.throws(() => decodeEntryRequest(encodeEntryRequest({ ...request, history_tag: "zz" })));
});

test("a request for another invoice or from another financier does not fit the deal", () => {
  const d = deal({ buyer_signature: "00", offer });
  assert.deepEqual(entryRequestProblems(d, request), []);
  assert.equal(entryRequestProblems(d, { ...request, n: "cd".repeat(32) }).length, 1);
  assert.equal(entryRequestProblems(d, { ...request, financier_pk: "66".repeat(32) }).length, 1);
});
