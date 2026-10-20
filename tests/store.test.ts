// HNK-24.T3: encrypted deal store, run with `npm test` (Node built-in test runner, WebCrypto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DealStore, MemoryBackend } from "../src/lib/store.ts";

function keys(fill: number): Uint8Array {
  return new Uint8Array(64).fill(fill);
}

const N = "ab".repeat(32);
const doc = { invoice: "JTSI...", buyer_signature: "00".repeat(64), seals: ["s0"] };

test("a document survives a new store opened with the same keys (a new session)", async () => {
  const backend = new MemoryBackend();
  const a = await DealStore.open("supplier", keys(1), backend);
  await a.put(N, doc);
  const b = await DealStore.open("supplier", keys(1), backend);
  assert.deepEqual(await b.get(N), doc);
  assert.deepEqual(await b.list(), [{ id: N, doc }]);
});

test("the key bytes are zeroed, also when opening fails", async () => {
  const k = keys(7);
  await DealStore.open("buyer", k, new MemoryBackend());
  assert.ok(k.every((b) => b === 0));
  const short = new Uint8Array(16).fill(3);
  await assert.rejects(DealStore.open("buyer", short, new MemoryBackend()));
  assert.ok(short.every((b) => b === 0));
});

test("the record name does not show the id and the content is encrypted", async () => {
  const backend = new MemoryBackend();
  const s = await DealStore.open("supplier", keys(1), backend);
  await s.put(N, doc);
  const [r] = await backend.all();
  assert.ok(r.name.startsWith("supplier:"));
  assert.ok(!r.name.includes(N));
  assert.ok(!new TextDecoder().decode(r.ct).includes("JTSI"));
  assert.equal(r.iv.length, 12);
});

test("another passkey (other keys) cannot read, and an altered record is refused", async () => {
  const backend = new MemoryBackend();
  const s = await DealStore.open("supplier", keys(1), backend);
  await s.put(N, doc);
  const other = await DealStore.open("supplier", keys(2), backend);
  assert.equal(await other.get(N), undefined); // different HMAC name
  assert.deepEqual(await other.list(), []); // cannot decrypt
  const [r] = await backend.all();
  r.ct[0] ^= 1;
  await assert.rejects(s.get(N));
  assert.deepEqual(await s.list(), []);
});

test("roles are separate, replace and delete work", async () => {
  const backend = new MemoryBackend();
  const sup = await DealStore.open("supplier", keys(1), backend);
  const buy = await DealStore.open("buyer", keys(1), backend);
  await sup.put(N, doc);
  await buy.put(N, { mine: true });
  assert.deepEqual(await sup.get(N), doc);
  assert.deepEqual(await buy.get(N), { mine: true });
  await sup.put(N, { ...doc, seals: ["s0", "s1"] });
  assert.deepEqual((await sup.get<typeof doc>(N))?.seals, ["s0", "s1"]);
  await sup.delete(N);
  assert.equal(await sup.get(N), undefined);
  assert.deepEqual(await buy.get(N), { mine: true });
});

test("a memory backend is reported as not persistent", async () => {
  const s = await DealStore.open("buyer", keys(1), new MemoryBackend());
  assert.equal(s.persistent, false);
});
