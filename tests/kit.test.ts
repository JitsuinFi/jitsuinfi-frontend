import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOffer, KIT, loadBoard, type KitWasm } from "../src/lib/kit.ts";

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

test("the live board is used when the node answers, the copy otherwise", async () => {
  const live = async (url: string) =>
    url === KIT.liveBoard ? new Response(JSON.stringify({ entries: [{ txid: "a" }], tip: 9, scanned_at: 5 })) : new Response("[]");
  assert.deepEqual(await loadBoard(live), { json: '[{"txid":"a"}]', source: "live", tip: 9, at: 5 });
  const down = async (url: string) => {
    if (url === KIT.liveBoard) throw new Error("offline");
    return new Response("[1]");
  };
  const b = await loadBoard(down);
  assert.equal(b.source, "copy");
  assert.equal(b.json, "[1]");
  assert.equal(b.tip, KIT.board.upToHeight);
  const scanning = async (url: string) => (url === KIT.liveBoard ? new Response("{}", { status: 503 }) : new Response("[2]"));
  assert.equal((await loadBoard(scanning)).source, "copy");
});
