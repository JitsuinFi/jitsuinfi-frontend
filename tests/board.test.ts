// HNK-30.T7, W-23: board data falls back from the live node to the last live board kept in this
// browser, then to the bundled copy; each screen can say which one it used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_COPY, boardLine, LIVE_BOARD, loadBoard, type Keep } from "../src/lib/board.ts";

function memory(): Keep & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const live = (tip: number) => async (url: string) =>
  url === LIVE_BOARD ? new Response(JSON.stringify({ entries: [{ txid: "a" }], tip, scanned_at: 5 })) : new Response("[1]");
const down = async (url: string) => {
  if (url === LIVE_BOARD) throw new Error("offline");
  return new Response("[1]");
};

test("live, then the kept live board, then the copy", async () => {
  const keep = memory();
  assert.deepEqual(await loadBoard(live(BOARD_COPY.upToHeight + 10), keep), { json: '[{"txid":"a"}]', source: "live", tip: BOARD_COPY.upToHeight + 10, at: 5 });
  const kept = await loadBoard(down, keep);
  assert.equal(kept.source, "kept");
  assert.equal(kept.json, '[{"txid":"a"}]');
  assert.equal((await loadBoard(down, memory())).source, "copy");
  assert.equal((await loadBoard(down, null)).source, "copy", "no storage");
  const scanning = async (url: string) => (url === LIVE_BOARD ? new Response("{}", { status: 503 }) : new Response("[2]"));
  assert.equal((await loadBoard(scanning, memory())).source, "copy");
});

test("a kept board older than the copy is not used", async () => {
  const keep = memory();
  await loadBoard(live(BOARD_COPY.upToHeight - 1), keep);
  assert.equal((await loadBoard(down, keep)).source, "copy");
});

test("each screen says where the board came from", () => {
  const now = 10_000 * 1000;
  assert.match(boardLine({ json: "[]", source: "live", tip: 9, at: 10_000 - 120 }, now), /live scan up to block 9 \(2 min ago\)/);
  assert.match(boardLine({ json: "[]", source: "kept", tip: 9, at: 10_000 - 7200 }, now), /Last live board this browser saw.*\(2 h ago\)/);
  assert.match(boardLine({ json: "[]", source: "copy", tip: BOARD_COPY.upToHeight, at: 0 }, now), /Bundled copy/);
});
