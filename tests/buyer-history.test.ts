// HNK-25.T2: the buyer's history chain on this device, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { append, certFields, decodeBackup, dropTail, emptyHistory, encodeBackup, freeable, head, localNextIndex, reconcile, type CertFields } from "../src/lib/buyer-history.ts";

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

/** A certificate's bytes with only the fields `reconcile` reads: index and identity key. */
function cert(index: number, identity = 0xcc, salt = 0): string {
  const b = new Uint8Array(277);
  b.set([0x4a, 0x54, 0x53, 0x48, 1]);
  new DataView(b.buffer).setUint32(5, index, true);
  b.fill(identity, 181, 213);
  b[276] = salt;
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("the relay copy restores newer certificates and shows a copy that fell behind or forked", () => {
  const id = "cc".repeat(32);
  const two = { certs: [cert(0), cert(1)] };
  const three = { certs: [...two.certs, cert(2)] };
  assert.deepEqual(decodeBackup(encodeBackup(three)), three);
  assert.throws(() => decodeBackup(new TextEncoder().encode('{"v":2,"certs":[]}')), /not readable/);
  assert.equal(reconcile(two, two, id).kind, "same");
  assert.deepEqual(reconcile(emptyHistory(), three, id), { kind: "restored", doc: three, added: 3 });
  assert.deepEqual(reconcile(two, three, id), { kind: "restored", doc: three, added: 1 });
  assert.deepEqual(reconcile(three, two, id), { kind: "relay-behind", doc: three, missing: 1 });
  // another certificate at index 1, someone else's chain, or indices out of order: keep this device's
  assert.equal(reconcile(two, { certs: [cert(0), cert(1, 0xcc, 9), cert(2)] }, id).kind, "diverged");
  assert.equal(reconcile(emptyHistory(), { certs: [cert(0, 0xdd)] }, id).kind, "diverged");
  assert.equal(reconcile(emptyHistory(), { certs: [cert(1)] }, id).kind, "diverged");
  assert.equal(reconcile(emptyHistory(), { certs: ["AAAA"] }, id).kind, "diverged");
});

// E2E audit 2026-10-25: a certificate not on the board yet may still be registered by its
// financier. Freeing its index would let a second certificate carry the same board tag, and two
// registered deals would anchor two invoices at one place in the history.
test("only a certificate whose deal is over frees its index", () => {
  const cert = (index: number, n: string, due: number): CertFields => ({ index, nullifier: n.repeat(64), amount_zat: 1, due_date: due, financier_pk: "f", identity_pk: "i" });
  const certs = [cert(0, "a", 900), cert(1, "b", 900), cert(2, "c", 900)];
  const none = new Set<string>();
  // #1 and #2 are not on the board and not due: their deals may still register, both are kept
  assert.deepEqual(freeable(certs, [2, 1], none, 100), { drop: [], pending: [1, 2] });
  // #1's invoice was registered without its tag (another financier, or no history asked): over
  assert.deepEqual(freeable(certs, [1, 2], new Set(["b".repeat(64)]), 100), { drop: [1, 2], pending: [] });
  // #2's invoice registered elsewhere: only #2 goes, #1 stays pending
  assert.deepEqual(freeable(certs, [1, 2], new Set(["c".repeat(64)]), 100), { drop: [2], pending: [1] });
  // past the due date there is nothing left to finance
  assert.deepEqual(freeable(certs, [1, 2], none, 901), { drop: [1, 2], pending: [] });
  assert.deepEqual(freeable(certs, [], none, 100), { drop: [], pending: [] });
});
