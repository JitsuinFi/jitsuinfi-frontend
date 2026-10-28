// Wave 5: the console's Wallet section and the pay preflight (src/console/wallet-model.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEE_ZAT, payShortfall, refusalShortfall, shortWords, txUrl, walletOf } from "../src/console/wallet-model.ts";

const W = { balance_zat: 500_000, spendable_zat: 400_000, pending_zat: 100_000, fund_cash_zat: null, own_zat: null, fee_zat: 10_000, topup_address: "utest1abc", topup_uri: "zcash:utest1abc", txs: [{ txid: "aa", height: 5, delta_zat: -90_000, kind: "advance" }], synced_at: 1 };

test("a node from before the endpoint (404) is 'missing'; the answer is read with defaults", () => {
  assert.equal(walletOf(404, { error: "not found" }), "missing");
  assert.equal(walletOf(200, { nonsense: true }), "missing");
  const w = walletOf(200, { ...W, fee_zat: undefined, txs: [{ txid: "bb", delta_zat: 1, kind: "topup", height: null }, { bad: 1 }] });
  assert.ok(w && w !== "missing");
  assert.equal(w.fee_zat, FEE_ZAT);
  assert.equal(w.txs.length, 1);
});

test("pay preflight: short when the node says so, or spendable < advance + fee", () => {
  const w = walletOf(200, W);
  assert.equal(payShortfall(w, { advance_zat: 390_000 }), null);
  assert.deepEqual(payShortfall(w, { advance_zat: 390_001 }), { have: 400_000, need: 390_001, fee: 10_000 });
  assert.deepEqual(payShortfall(w, { advance_zat: 1, wallet_short: true }), { have: 400_000, need: 1, fee: 10_000 });
  assert.equal(payShortfall("missing", { advance_zat: 10 ** 12 }), null, "no wallet reading: the node decides");
  assert.deepEqual(payShortfall(null, { advance_zat: 5, wallet_short: true }), { have: null, need: 5, fee: FEE_ZAT });
});

test("the node's refusal with its numbers, and the words", () => {
  assert.deepEqual(refusalShortfall({ error: "wallet short", need_zat: 100_000, spendable_zat: 20_000 }, 90_000), { have: 20_000, need: 90_000, fee: FEE_ZAT });
  assert.equal(refusalShortfall({ error: "other" }, 1), null);
  const zec = (z: number) => (z / 1e8).toString();
  assert.equal(shortWords({ have: 20_000, need: 90_000, fee: 10_000 }, zec), "The node's wallet holds 0.0002 ZEC; this advance needs 0.0009 ZEC + 0.0001 fee. Top up the node's wallet, then pay.");
  assert.match(txUrl("ab"), /^https:\/\/testnet\.zcashexplorer\.app\/transactions\/ab$/);
});

test("node wave 5: the deal's own need_zat and spendable_zat, and the 409 with advance and fee", () => {
  assert.deepEqual(payShortfall("missing", { advance_zat: 90_000, need_zat: 100_000, spendable_zat: 40_000 }), { have: 40_000, need: 90_000, fee: 10_000 });
  assert.equal(payShortfall("missing", { advance_zat: 90_000, need_zat: 100_000, spendable_zat: 100_000 }), null);
  assert.equal(payShortfall("missing", { advance_zat: 90_000, need_zat: 100_000, spendable_zat: null }), null, "before the first sync: the node decides");
  assert.deepEqual(refusalShortfall({ error: "short", need_zat: 102_000, spendable_zat: 1, advance_zat: 90_000, fee_zat: 12_000 }, 1), { have: 1, need: 90_000, fee: 12_000 });
});
