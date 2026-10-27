// DS-MOB L5: a screen that truly needs two trees (a phone's fold, a desktop's open section) keeps
// its draft above the switch, so the tree drawn after a resize starts from what was typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keptStore, scopeOf } from "../src/lib/kept.ts";

test("a draft written by one tree is read by the other", () => {
  const k = keptStore();
  const s = scopeOf("member:abc", "member/units/deposit");
  k.set(s, "card", "jitsuin-fund-v1:xyz");
  k.set(s, "amount", "0.01");
  // the phone's fold unmounts, the desktop's section mounts: it reads the same draft
  assert.equal(k.get<string>(s, "card"), "jitsuin-fund-v1:xyz");
  assert.equal(k.get<string>(s, "amount"), "0.01");
  assert.deepEqual(k.draft(s), { card: "jitsuin-fund-v1:xyz", amount: "0.01" });
});

test("a chosen file is kept as the File itself, with its name", () => {
  const k = keptStore();
  const s = scopeOf("supplier:f1", "supplier/invoices/new");
  const f = new File([new Uint8Array([37, 80, 68, 70])], "invoice-TES-INV-DUMMY-0002.pdf", { type: "application/pdf" });
  k.set(s, "pdf", f);
  const back = k.get<File>(s, "pdf")!;
  assert.equal(back, f);
  assert.equal(back.name, "invoice-TES-INV-DUMMY-0002.pdf");
});

test("drafts are per screen: one screen's draft is not another's", () => {
  const k = keptStore();
  const a = scopeOf("supplier:f1", "deal/n1/offer");
  const b = scopeOf("supplier:f1", "deal/n2/offer");
  k.set(a, "address", "utest1aaa");
  assert.equal(k.get(b, "address"), undefined);
  k.clear(a);
  assert.equal(k.get(a, "address"), undefined);
  assert.deepEqual(k.draft(a), {});
});

test("undefined drops one value; an emptied draft is forgotten", () => {
  const k = keptStore();
  const s = scopeOf("buyer:b1", "x");
  k.set(s, "card", "c");
  k.set(s, "card", undefined);
  assert.equal(k.get(s, "card"), undefined);
  assert.deepEqual(k.draft(s), {});
  k.set(s, "nothing", undefined);
  assert.deepEqual(k.draft(s), {});
});

test("another account signing in drops every draft that is not its own; locking drops all", () => {
  const k = keptStore();
  const mine = scopeOf("member:abc", "member/units/deposit");
  const theirs = scopeOf("member:def", "member/units/deposit");
  k.set(mine, "card", "1");
  k.set(theirs, "card", "2");
  k.keepOnly("member:abc");
  assert.equal(k.get(mine, "card"), "1");
  assert.equal(k.get(theirs, "card"), undefined);
  // the owner is matched whole, not as a prefix of another owner
  k.set(scopeOf("member:abcd", "s"), "card", "3");
  k.keepOnly("member:abc");
  assert.equal(k.get(scopeOf("member:abcd", "s"), "card"), undefined);
  k.keepOnly("");
  assert.equal(k.get(mine, "card"), undefined);
});
