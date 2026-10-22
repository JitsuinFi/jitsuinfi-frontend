// HNK-32.T7, BL-D29-07: the member page reads `jitsuin fund --json` against its own paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFundReport } from "../src/lib/fund-report.ts";
import type { Wallet } from "../src/lib/fund.ts";

const w: Wallet = {
  holdings: [{ fund_pk: "a", fund_mailbox: "b", token: "t", leaf_id: "l", units: 500, period: 3, nav: { assets_zat: 1, units: 1 }, path: { period: 4, root: "r", total: 9000, ok: true } }],
  payouts: [],
};
const report = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    network: "testnet",
    cash_zat: 4000,
    verdict: { period: 4, liabilities_zat: 9000, assets_zat: 9500, open_zat: 5500, overdue_zat: 0, solvent: true },
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
