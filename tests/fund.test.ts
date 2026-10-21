// HNK-30.T23: the member's holdings from the fund's receipts, paths and payouts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addPath, addPayout, addReceipt, EMPTY, valueOf, withdrawBody } from "../src/lib/fund.ts";
import type { Header } from "../src/lib/relay-message.ts";

const v = JSON.parse(readFileSync(new URL("./vectors/units.json", import.meta.url), "utf8")) as { token: string; units: number; root: string; total: number; path: string };
const FUND = "ab".repeat(32);
const hd = (type: string, body: object): Header => ({ v: 1, id: "00".repeat(16), type, to: "11".repeat(32), from: { role: "fund", mailbox_pk: "22".repeat(32) }, sent_at: 1, body, attachments: [], signer: FUND, sig: "33".repeat(64) }) as unknown as Header;

test("a receipt adds units, its path checks, a payout swaps the token", async () => {
  let w = await addReceipt(EMPTY, hd("fund.receipt", { period: 1, deposit_txid: "44".repeat(32), amount_zat: v.units, units: v.units, nav: { assets_zat: 1, units: 1 }, withdraw_token: v.token }));
  w = await addReceipt(w, hd("fund.receipt", { period: 1, deposit_txid: "44".repeat(32), amount_zat: v.units, units: v.units, nav: { assets_zat: 1, units: 1 }, withdraw_token: v.token }));
  assert.equal(w.holdings.length, 1);
  const leaf = w.holdings[0].leaf_id;
  const p = await addPath(w, hd("fund.merkle_path", { period: 1, leaf_id: leaf, units: v.units, root: v.root, total: v.total, path: v.path }));
  assert.equal(p.ok, true);
  const lied = await addPath(w, hd("fund.merkle_path", { period: 1, leaf_id: leaf, units: v.units, root: v.root, total: v.total + 5, path: v.path }));
  assert.equal(lied.ok, false);

  const paid = await addPayout(p.wallet, hd("fund.payout", { period: 1, leaf_id: leaf, units: 500, amount_zat: 550, nav: { assets_zat: 11, units: 10 }, txid: "55".repeat(32), next_token: "66".repeat(32) }));
  assert.equal(paid.holdings[0].units, v.units - 500);
  assert.notEqual(paid.holdings[0].leaf_id, leaf);
  assert.equal(paid.payouts.length, 1);
  assert.equal(valueOf(paid.holdings[0].units, paid.holdings[0].nav), Math.floor(((v.units - 500) * 11) / 10));
  assert.throws(() => withdrawBody(paid.holdings[0], v.units, "utest1aaaaaaaaaa", 2));
  assert.deepEqual(withdrawBody(paid.holdings[0], "all", " utest1aaaaaaaaaa ", 2), { withdraw_token: "66".repeat(32), units: "all", address: "utest1aaaaaaaaaa", period: 2 });
});
