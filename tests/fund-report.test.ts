// HNK-32.T7, BL-D29-07: the member page reads `jitsuin fund --json` against its own paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFundReport } from "../src/lib/fund-report.ts";
import type { Wallet } from "../src/lib/fund.ts";

const DEP = "d1".repeat(32);
const w: Wallet = {
  holdings: [{ fund_pk: "a", fund_mailbox: "b", token: "t", leaf_id: "l", units: 500, period: 3, nav: { assets_zat: 1, units: 1 }, deposit_txid: DEP, path: { period: 4, root: "r", total: 9000, ok: true } }],
  payouts: [],
};
const report = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    network: "testnet",
    basis: "books",
    cash_zat: 4000,
    wallet_zat: 300_000_000,
    books: { deposits: [{ txid: DEP, amount_zat: 500 }], payouts: [], missing: [] },
    verdict: { period: 4, liabilities_zat: 9000, assets_zat: 9500, open_zat: 5500, overdue_zat: 0, solvent: true, wallet_zat: 300_000_000, wallet_covers: true },
    inclusion: { period: 4, units: 500, included: true, why: "under the root" },
    ...o,
  });

test("a report about this device's root reads as solvent", () => {
  const r = readFundReport(report(), w, "testnet");
  assert.deepEqual(r.problems, []);
  assert.equal(r.solvent, true);
});

test("a report about another root, period, network or without the path does not fit", () => {
  assert.match(readFundReport(report({ verdict: { period: 4, liabilities_zat: 1, assets_zat: 2, open_zat: 0, overdue_zat: 0, solvent: true } }), w, "testnet").problems.join(), /not the total of the root/);
  assert.match(readFundReport(report({ inclusion: { period: 5, units: 500, included: true, why: "" } }), w, "testnet").problems.join(), /different periods/);
  assert.match(readFundReport(report({ inclusion: { period: 4, units: 7, included: true, why: "" } }), w, "testnet").problems.join(), /no checked path with 7 units/);
  assert.match(readFundReport(report({ inclusion: null }), w, "testnet").problems.join(), /without your path/);
  assert.match(readFundReport(report(), w, "mainnet").problems.join(), /for testnet/);
  assert.equal(readFundReport(report({ inclusion: null }), w, "testnet").solvent, false);
});

test("an insolvent fund stays insolvent, and text that is no report is refused", () => {
  const r = readFundReport(report({ verdict: { period: 4, liabilities_zat: 9000, assets_zat: 100, open_zat: 0, overdue_zat: 0, solvent: false } }), w, "testnet");
  assert.deepEqual(r.problems, []);
  assert.equal(r.solvent, false);
  assert.throws(() => readFundReport("Fund: SOLVENT", w, "testnet"), /not the report/);
  assert.throws(() => readFundReport(JSON.stringify({ network: "testnet" }), w, "testnet"), /not the report/);
});

// 2026-10-25 (user decision): the fund is valued on its books, not on the manager's whole wallet.
test("a report valued on the whole wallet, or without the books, does not answer", () => {
  const old = JSON.parse(report());
  delete old.basis;
  delete old.books;
  delete old.wallet_zat;
  const r = readFundReport(JSON.stringify(old), w, "testnet");
  assert.match(r.problems.join(), /whole wallet, not the fund's books/);
  assert.equal(r.solvent, false);
  const none = readFundReport(report({ verdict: null, no_verdict: "no fund books: the fund's assets are its books" }), w, "testnet");
  assert.match(none.problems.join(), /no verdict: no fund books/);
});

test("the books must hold this device's deposit and only transactions in the wallet", () => {
  const left = readFundReport(report({ books: { deposits: [{ txid: "e2".repeat(32), amount_zat: 500 }], payouts: [], missing: [] } }), w, "testnet");
  assert.match(left.problems.join(), /leave out your deposit d1d1d1d1/);
  assert.equal(left.solvent, false);
  // a deposit made after that close is not on its books yet, and that is fine
  const later: Wallet = { ...w, holdings: [...w.holdings, { ...w.holdings[0], leaf_id: "m", deposit_txid: "f3".repeat(32), period: 5, path: undefined }] };
  assert.deepEqual(readFundReport(report(), later, "testnet").problems, []);
  assert.match(readFundReport(report({ books: { deposits: [{ txid: DEP, amount_zat: 500 }], payouts: [], missing: ["ab".repeat(32)] } }), w, "testnet").problems.join(), /1 transaction on the fund's books is not in its wallet/);
  assert.throws(() => readFundReport(report({ books: { deposits: "x" } }), w, "testnet"), /not the report/);
});

test("a wallet holding less than the books' cash is not solvent", () => {
  const r = readFundReport(report({ verdict: { period: 4, liabilities_zat: 9000, assets_zat: 9500, open_zat: 5500, overdue_zat: 0, solvent: false, wallet_zat: 100, wallet_covers: false } }), w, "testnet");
  assert.deepEqual(r.problems, []);
  assert.equal(r.solvent, false);
  assert.equal(r.report.verdict?.wallet_covers, false);
});
