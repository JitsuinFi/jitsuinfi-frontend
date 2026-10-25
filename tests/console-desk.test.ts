// HNK-34.T5: the financier desk derives its route, tabs, seals, stamps and big numbers from the
// node's own deal and mail rows, never from invented values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bigStamp, refusal, seals, stations, stopStation, tabOf, tagGroups, totals } from "../src/console/model.ts";

const deal = (state: string, more: Record<string, unknown> = {}) => ({ n: "ab".repeat(32), invoice_id: "TES-INV-0007", advance_zat: 80000, state, ...more });

test("a stop is marked at the station whose check found it", () => {
  assert.equal(stopStation("AlreadyFinanced"), 0);
  assert.equal(stopStation("DoubleFinanced { winner: … }"), 2);
  assert.deepEqual(stations(deal("Stopped", { stopped: "AlreadyFinanced" })), ["stop", "cut", "cut", "cut", "cut", "cut"]);
  assert.deepEqual(stations(deal("Stopped", { stopped: "DoubleFinanced" })), ["done", "done", "stop", "cut", "cut", "cut"]);
});

test("the route lights the financier's action at 金 and waits elsewhere", () => {
  assert.deepEqual(stations(deal("Pay")), ["done", "done", "done", "done", "now", "later"]);
  assert.deepEqual(stations(deal("AwaitConfirmation")), ["done", "done", "wait", "later", "later", "later"]);
  assert.deepEqual(stations(deal("Done")), Array(6).fill("done"));
});

test("tabs, seals and stamps follow the deal's state", () => {
  assert.deepEqual(tabOf(deal("Pay")), { kind: "act", line: "Pay advance", glyph: "金" });
  assert.equal(tabOf(deal("AwaitConfirmation", { confirmations: 1, min_confirmations: 3 })).line, "1 of 3 blocks");
  assert.equal(tabOf(deal("Stopped", { stopped: "DoubleFinanced" })).glyph, "重");
  assert.equal(tabOf(deal("Done", { repayment: "Overdue" })).glyph, "滞");
  assert.deepEqual(seals(deal("AwaitAssignment")), [false, false, false]);
  assert.deepEqual(seals(deal("Pay")), [true, true, false]);
  assert.deepEqual(seals(deal("Done")), [true, true, true]);
  assert.equal(bigStamp(deal("Done", { settled_txid: "c".repeat(64) }))?.glyph, "済");
  assert.equal(bigStamp(deal("Stopped", { stopped: "DoubleFinanced" }))?.glyph, "重");
  assert.equal(bigStamp(deal("Pay")), null);
});

test("the desk's numbers come from the rows, or stay unknown", () => {
  const t = totals(
    [deal("Pay"), deal("Done", { advance_txid: "a", settled_txid: "s" }), deal("Stopped", { stopped: "AlreadyFinanced" })],
    [{ offer: { ok: true, mandate: { verdict: "breaks" } } }, { offer: { ok: true, accepted: {} } }, { offer: { ok: false } }, {}],
  );
  assert.deepEqual(t, { offers: 1, breaking: 1, route: 1, advanced: 80000, advancedDeals: 1, settled: 1 });
  assert.equal(totals(null, null).offers, null);
});

test("a refused offer reads in plain words and keeps the node's phrase", () => {
  const r = refusal("signature verification failed");
  assert.match(r.text, /^Refused by the node\. A signature does not hold.* Nothing was saved\.$/);
  assert.equal(r.raw, "signature verification failed");
  assert.deepEqual(refusal("odd thing"), { text: "Refused by the node: odd thing. Nothing was saved.", raw: null });
});

test("the key tag engraves the invite code in four groups", () => {
  assert.deepEqual(tagGroups("q7rm-4kx"), ["Q7RM", "4KX·", null, null]);
  assert.deepEqual(tagGroups(""), [null, null, null, null]);
});
