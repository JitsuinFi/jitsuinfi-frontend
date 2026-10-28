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
  invoiceNumberProblem,
  looksShielded,
  nextAction,
  nextMove,
  nextStep,
  outcomeOn,
  route,
  sortDeals,
  standing,
  suggestInvoiceNumber,
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

test("the invoice number rule names No. on the sheet and follows jitsuin-core (1-32 printable ASCII, no space)", () => {
  const ds = [deal({ invoice_id: "TES-INV-DUMMY-0001" })];
  // the user's number (feedback 2026-10-26) is a good one
  assert.equal(invoiceNumberProblem(ds, "TES-INV-DUMMY-0002"), null);
  assert.equal(invoiceNumberProblem(ds, "  TES-INV-DUMMY-0002 "), null);
  assert.equal(invoiceNumberProblem([], "x".repeat(32)), null);
  assert.equal(invoiceNumberProblem([], "A/B_c.~!"), null);
  // an empty No. says where and what
  assert.equal(invoiceNumberProblem(ds, ""), "Write the invoice number in No. on the sheet (1–32 characters).");
  assert.equal(invoiceNumberProblem(ds, "   "), "Write the invoice number in No. on the sheet (1–32 characters).");
  assert.match(invoiceNumberProblem([], "x".repeat(33))!, /No\. on the sheet has 33 characters/);
  for (const bad of ["TES INV 1", "TES-INVÉ-1", "請求-1", "TES\t1"]) assert.match(invoiceNumberProblem([], bad)!, /No\. on the sheet takes plain letters/, bad);
  assert.match(invoiceNumberProblem(ds, "TES-INV-DUMMY-0001")!, /already used on this device: write another one in No\. on the sheet/);
});

test("the blank sheet's suggested number is dated, valid and not yet used on this device", () => {
  const day = new Date(2026, 9, 26);
  assert.equal(suggestInvoiceNumber([], day), "TES-INV-20261026-1");
  const ds = [deal({ invoice_id: "TES-INV-20261026-1" }), deal({ invoice_id: "TES-INV-20261026-2" })];
  const next = suggestInvoiceNumber(ds, day);
  assert.equal(next, "TES-INV-20261026-3");
  assert.equal(invoiceNumberProblem(ds, next), null);
  assert.equal(suggestInvoiceNumber(ds, new Date(2026, 0, 5)), "TES-INV-20260105-1");
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
  assert.equal(nextAction(deal({ buyer_signature: "00", offer, entry_request: request })), "sign the public record");
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

test("the route marks the steps that wait on someone else, then 済 (HNK-34.T5)", () => {
  const states = (d: SupplierDeal, settled = false) => route(d, settled).map((s) => s.state);
  assert.deepEqual(states(deal()), ["next", "later", "later", "later", "later", "later"]);
  assert.deepEqual(nextMove(deal()), { text: "send it to the buyer to sign", wait: false });
  const asked = deal({ sign_request: { to: "aa", at: 1 } });
  assert.deepEqual(states(asked), ["wait", "later", "later", "later", "later", "later"]);
  assert.equal(nextMove(asked)!.text, "wait for the buyer to sign in their inbox");
  const offered = deal({ buyer_signature: "00", offer });
  assert.deepEqual(states(offered), ["done", "done", "wait", "later", "later", "later"]);
  assert.deepEqual(states(deal({ buyer_signature: "00", offer, entry_request: request })), ["done", "done", "next", "later", "later", "later"]);
  const sealed = deal({ buyer_signature: "00", offer, entry: { memo: "m", commitment: "c", tagged: false, discount: 0, tenor: 0 }, seal: { letter: "l", s0: "s" } });
  assert.deepEqual(states(sealed), ["done", "done", "done", "done", "wait", "later"]);
  assert.equal(nextMove(sealed)!.text, "wait for the advance, then check it");
  assert.equal(states(deal({ ...sealed, advance_notice: { txid: "t", advance_zat: 38_000, at: 1 } }))[4], "next");
  const paid = deal({ ...sealed, advance: { txid: "t", received_zat: 38_000, matches: true } });
  assert.equal(nextMove(paid), null);
  assert.deepEqual(states(paid), ["done", "done", "done", "done", "done", "wait"]);
  assert.deepEqual(states(paid, true), ["done", "done", "done", "done", "done", "done"]);
  assert.equal(route(paid, true)[5].key, "settled");
});

test("after the advance the deal waits for repayment; only a settled deal is complete (HNK-34 E2E)", () => {
  const sealed = deal({ buyer_signature: "00", offer, entry: { memo: "m", commitment: "c", tagged: false, discount: 0, tenor: 0 }, seal: { letter: "l", s0: "s" } });
  assert.equal(standing(sealed, false), null);
  const paid = deal({ ...sealed, advance: { txid: "t", received_zat: 38_000, matches: true } });
  assert.equal(standing(paid, false), "repayment");
  assert.equal(route(paid, false)[5].state, "wait");
  assert.equal(standing(paid, true), "settled");
  assert.equal(standing(deal({ ...sealed, advance: { txid: "t", received_zat: 1, matches: false } }), false), null);
});

test("an action's outcome stays on the desk it belongs to; one taken in the mailbox is brought into view (judge run 2026-10-26)", () => {
  const n = "ab".repeat(32);
  const station = { n, glyph: "署", title: "Offer sent", text: "In the financier's mailbox." };
  const inbox = { n, glyph: "登", title: "Entry request received", text: "Sign the entry (Step 3).", inbox: true };
  const key = { n: "", glyph: "新", title: "Buyer's key received", text: "It is on your next invoice.", inbox: true };
  assert.deepEqual(outcomeOn(station, n), { outcome: station, reveal: false }, "a station action: the supplier is already at the work");
  assert.deepEqual(outcomeOn(inbox, n), { outcome: inbox, reveal: true }, "an inbox action: the desk scrolls to it");
  assert.equal(outcomeOn(inbox, "cd".repeat(32)), null, "another deal open: nothing drawn");
  assert.equal(outcomeOn(inbox, null), null, "the blank sheet does not show a deal's outcome");
  assert.deepEqual(outcomeOn(key, null), { outcome: key, reveal: true }, "the buyer's key shows on the blank sheet it filled");
  assert.equal(outcomeOn(key, n), null);
  assert.equal(outcomeOn(null, n), null);
});
