// HNK-25.T1, BL-D22-07: the buyer's received invoices kept across sessions, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DealStore, MemoryBackend } from "../src/lib/store.ts";
import { HISTORY_ID } from "../src/lib/buyer-history.ts";
import { invoiceRecord, invoiceStatus, isInvoiceId, sortInvoices, storeId, withSignature, type BuyerInvoice } from "../src/lib/buyer-invoices.ts";

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
