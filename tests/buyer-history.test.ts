// HNK-25.T2: the buyer's history chain on this device, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { append, certFields, dropTail, emptyHistory, head, localNextIndex } from "../src/lib/buyer-history.ts";

test("certificates are added in order and the next index follows the chain", () => {
  let h = emptyHistory();
  assert.equal(localNextIndex(h), 0);
  assert.equal(head(h), "");
  h = append(h, 0, "c0");
  h = append(h, 1, "c1");
  assert.equal(localNextIndex(h), 2);
  assert.equal(head(h), "c1");
  assert.throws(() => append(h, 3, "c3"), /not the next one/);
  assert.throws(() => append(h, 1, "again"), /not the next one/);
});

test("only a trailing run of never-anchored certificates can be dropped", () => {
  const h = { certs: ["c0", "c1", "c2", "c3"] };
  assert.deepEqual(dropTail(h, []), h);
  assert.deepEqual(dropTail(h, [3, 2]), { certs: ["c0", "c1"] });
  assert.throws(() => dropTail(h, [1]), /only the newest/);
  assert.throws(() => dropTail(h, [1, 3]), /only the newest/);
});

test("a certificate's public fields are read from its bytes", () => {
  const b = new Uint8Array(277);
  b.set([0x4a, 0x54, 0x53, 0x48, 1]); // "JTSH", v1
  const v = new DataView(b.buffer);
  v.setUint32(5, 3, true);
  b.fill(0xaa, 73, 105);
  v.setBigUint64(105, 1_000_000n, true);
  v.setUint32(113, 20_800, true);
  b.fill(0xbb, 117, 149);
  b.fill(0xcc, 181, 213);
  const s = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const f = certFields(s);
  assert.deepEqual(f, { index: 3, nullifier: "aa".repeat(32), amount_zat: 1_000_000, due_date: 20_800, financier_pk: "bb".repeat(32), identity_pk: "cc".repeat(32) });
  assert.throws(() => certFields("AAAA"));
});
