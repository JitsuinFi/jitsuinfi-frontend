import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOffer, KIT, type KitWasm } from "../src/lib/kit.ts";

const board = "[]";

test("a seal that fails on the bytes ends at 偽, before the board is read", () => {
  let boardRead = false;
  const w: KitWasm = {
    bundleBuild: () => {
      throw new Error("buyer signature does not verify");
    },
    bundleOnBoard: () => {
      boardRead = true;
      return "{}";
    },
  };
  assert.deepEqual(checkOffer(w, KIT.invoice, KIT.buyerSignature, board), { kind: "forged", reason: "buyer signature does not verify" });
  assert.equal(boardRead, false);
});

test("an entry for N on the board ends at 重", () => {
  const w: KitWasm = {
    bundleBuild: () => "bundle",
    bundleOnBoard: () => JSON.stringify({ register: { status: "DoubleFinanced", txid: KIT.financierA.txid, conflicting: ["x"] } }),
  };
  const withEntry = JSON.stringify([{ txid: KIT.financierA.txid, height: KIT.financierA.height }]);
  assert.deepEqual(checkOffer(w, KIT.invoice, KIT.buyerSignature, withEntry), { kind: "pledged", txid: KIT.financierA.txid, height: KIT.financierA.height, others: 1 });
});

test("no entry means B may finance", () => {
  const w: KitWasm = { bundleBuild: () => "b", bundleOnBoard: () => JSON.stringify({ register: { status: "NotFound" } }) };
  assert.deepEqual(checkOffer(w, KIT.invoice, KIT.buyerSignature, board), { kind: "free" });
});
