// HNK-25.T1, BL-D22-07: the buyer's received invoices kept across sessions, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DealStore, MemoryBackend } from "../src/lib/store.ts";
import { HISTORY_ID } from "../src/lib/buyer-history.ts";
import { boardStatus, dueSoon, invoiceRecord, invoiceStatus, isInvoiceId, sortInvoices, storeId, withSignature, type BuyerInvoice } from "../src/lib/buyer-invoices.ts";

const dec = (n: string, id: string) => ({ nullifier: n, invoice_id: id, amount_zat: 5_000_000, due_date: 20_776 });

test("a checked invoice survives a new session on the same device", async () => {
  const backend = new MemoryBackend();
  const key = new Uint8Array(64).fill(7);
  const first = await DealStore.open("buyer", key.slice(), backend);
  const rec = invoiceRecord(dec("aa", "TES-INV-T25"), "SlRTSQ", 0, true, 1000);
  await first.put(storeId(rec.n), rec);
  await first.put(HISTORY_ID, { certs: [] });
  await first.put(storeId(rec.n), withSignature(rec, "sig"));

  const again = await DealStore.open("buyer", key.slice(), backend);
  const invoices = (await again.list<BuyerInvoice>()).filter((r) => isInvoiceId(r.id)).map((r) => r.doc);
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].invoice_id, "TES-INV-T25");
  assert.equal(invoiceStatus(invoices[0]), "signed");
});

test("checking again keeps the first time and the signature; another invoice under the same N is refused", () => {
  const first = withSignature(invoiceRecord(dec("aa", "TES-INV-T25"), "SlRTSQ", 0, false, 1000), "sig");
  const again = invoiceRecord(dec("aa", "TES-INV-T25"), "SlRTSQ", 0, true, 5000, first);
  assert.deepEqual([again.received_at, again.signature, again.terms_checked], [1000, "sig", true]);
  assert.throws(() => invoiceRecord(dec("aa", "TES-INV-T25"), "OTHER", 0, true, 5000, first), /another invoice/);
});

test("status and order", () => {
  const a = invoiceRecord(dec("aa", "A"), "x", 0, false, 1);
  const b = invoiceRecord(dec("bb", "B"), "y", 1, true, 2);
  assert.equal(invoiceStatus(a), "terms PDF not checked");
  assert.equal(invoiceStatus(b), "checked, not signed");
  assert.deepEqual(sortInvoices([a, b]).map((r) => r.invoice_id), ["B", "A"]);
  assert.equal(isInvoiceId(HISTORY_ID), false);
});

test("financed invoices due within a week are reminded, soonest first; settled ones are not", () => {
  const base = { invoice_id: "X", amount_zat: 1, invoice: "i", key_index: 0, terms_checked: true, received_at: 0 };
  const sealed = { financier_seal: "s2" };
  const list = [
    { ...base, n: "a", due_date: 110, assignment: sealed },
    { ...base, n: "b", due_date: 103, assignment: sealed },
    { ...base, n: "c", due_date: 99, assignment: sealed },
    { ...base, n: "d", due_date: 101, assignment: sealed, bundle: "settled" },
    { ...base, n: "e", due_date: 101 },
  ];
  assert.deepEqual(dueSoon(list, 100).map((x) => [x.rec.n, x.days_left]), [["c", -1], ["b", 3]]);
  assert.equal(boardStatus({ register: { status: "Registered" }, settled: { on_time: false } }), "settled late");
  assert.equal(boardStatus({ register: { status: "NotFound" }, settled: null }), "not on the board yet");
});

// HNK-34.T5: the ledger tag, the seal dots, the route and the big numbers come from the records
test("each invoice says what it waits for, and the totals add up", async () => {
  const { nextAction, sealCount, routeDone, buyerTotals } = await import("../src/lib/buyer-invoices.ts");
  const base = invoiceRecord(dec("01", "TES-INV-A"), "SlRTSQ", 0, true, 1);
  const signed = { ...withSignature(base, "sig"), reply_to: "mb", signature_sent_at: 2 };
  const letter = { ...signed, n: "02", assignment: { letter: "L", supplier_seal: "s0" } };
  const sealed = { ...letter, n: "03", assignment: { ...letter.assignment, buyer_seal: "s1" } };
  const pay = { ...sealed, n: "04", due_date: 100, assignment: { ...sealed.assignment, financier_seal: "s2" } };
  const done = { ...pay, n: "05", bundle: "B" };
  assert.equal(nextAction(base), "sign");
  assert.equal(nextAction({ ...withSignature(base, "sig"), reply_to: "mb" }), "send");
  assert.equal(nextAction(signed), "wait-letter");
  assert.equal(nextAction(letter), "seal");
  assert.equal(nextAction(sealed), "wait-financier");
  assert.equal(nextAction(pay), "pay");
  assert.equal(nextAction(done), "settled");
  assert.deepEqual([base, letter, sealed, pay].map(sealCount), [0, 1, 2, 3]);
  assert.deepEqual(routeDone(sealed), [true, true, true, true, false]);
  const t = buyerTotals([base, letter, sealed, pay, done], { "05": "settled on time" }, 150);
  assert.deepEqual(t, { toAct: 2, toPay: { count: 1, zat: 5_000_000 }, due: 2, onTime: 1 });
  assert.equal(buyerTotals([], null, 0).onTime, null);
});
