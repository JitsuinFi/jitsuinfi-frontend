// Finding F10: reload-safe forms (lib/drafts.ts, lib/kept.ts `load`/`onWrite`), run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_PREFIX, draftKey, dropDrafts, fileMeta, loadDrafts, ownerTag, saveDraft, writable, type DraftStorage } from "../src/lib/drafts.ts";
import { keptStore, scopeOf } from "../src/lib/kept.ts";

/** sessionStorage as a Map. */
function storage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const inbox = new Uint8Array(32).fill(4);
const owner = "supplier:AB-CD-EF";

test("a Write-an-invoice draft comes back after a reload, sealed in storage", async () => {
  const st = storage();
  const tag = await ownerTag(owner);
  const pdf = new File([new Uint8Array([37, 80, 68, 70, 1, 2, 3])], "invoice-0002.pdf", { type: "application/pdf" });
  const draft = { "Invoice number": "TES-INV-77", "Amount due in ZEC": "0.0012", "Due date": "2026-11-20", "The buyer this invoice is for": "key:abc", "file:The invoice PDF": await fileMeta(pdf), pdfItself: pdf };
  await saveDraft(st, await draftKey(inbox, "supplier"), tag, "supplier/invoices/new", draft);
  // what storage holds: no field value, no file name
  const [item, value] = [...st.map.entries()][0];
  assert.equal(item, `${DRAFT_PREFIX}${tag}:supplier/invoices/new`);
  for (const s of ["TES-INV-77", "0.0012", "invoice-0002", "key:abc"]) assert.ok(!atob(value).includes(s) && !value.includes(s), s);
  // the reload: a new key from the same passkey (same inbox output), the same storage
  const back = await loadDrafts(st, await draftKey(inbox, "supplier"), tag);
  const d = back.get("supplier/invoices/new")!;
  assert.equal(d["Invoice number"], "TES-INV-77");
  assert.equal(d["Due date"], "2026-11-20");
  assert.equal(d.pdfItself, undefined, "a File cannot be written down");
  assert.deepEqual(d["file:The invoice PDF"], { name: "invoice-0002.pdf", bytes: 7, sha256: (await fileMeta(pdf)).sha256 });
});

test("another account's or another role's key does not open a draft, and it is dropped", async () => {
  const st = storage();
  const tag = await ownerTag(owner);
  await saveDraft(st, await draftKey(inbox, "supplier"), tag, "s", { a: "1" });
  assert.equal((await loadDrafts(st, await draftKey(new Uint8Array(32).fill(5), "supplier"), tag)).size, 0);
  assert.equal(st.map.size, 0);
  await saveDraft(st, await draftKey(inbox, "supplier"), tag, "s", { a: "1" });
  assert.equal((await loadDrafts(st, await draftKey(inbox, "buyer"), tag)).size, 0);
});

test("a draft moved to another screen's name does not open", async () => {
  const st = storage();
  const tag = await ownerTag(owner);
  const key = await draftKey(inbox, "supplier");
  await saveDraft(st, key, tag, "supplier/deal/x/offer", { addr: "utest1" });
  const v = st.map.get(`${DRAFT_PREFIX}${tag}:supplier/deal/x/offer`)!;
  st.map.clear();
  st.map.set(`${DRAFT_PREFIX}${tag}:supplier/deal/y/offer`, v);
  assert.equal((await loadDrafts(st, key, tag)).size, 0);
});

test("an emptied draft is removed; sign-out drops only this account's drafts", async () => {
  const st = storage();
  const key = await draftKey(inbox, "supplier");
  const mine = await ownerTag(owner);
  const theirs = await ownerTag("buyer:ZZ");
  await saveDraft(st, key, mine, "a", { x: "1" });
  await saveDraft(st, key, mine, "b", { x: "1" });
  await saveDraft(st, key, theirs, "a", { x: "1" });
  await saveDraft(st, key, mine, "b", {});
  assert.equal(st.map.size, 2);
  dropDrafts(st, mine);
  assert.deepEqual([...st.map.keys()], [`${DRAFT_PREFIX}${theirs}:a`]);
});

test("writable keeps JSON values only", () => {
  assert.deepEqual(writable({ a: "x", b: 2, c: { d: [1] }, f: new Blob(["x"]), u: undefined }), { a: "x", b: 2, c: { d: [1] } });
});

test("a restored draft fills the kept store; what was typed in this tab since wins", () => {
  const k = keptStore();
  const s = scopeOf(owner, "supplier/invoices/new");
  const writes: string[] = [];
  k.onWrite((x) => writes.push(x));
  k.set(s, "Amount due in ZEC", "0.5");
  k.load(s, { "Amount due in ZEC": "0.1", "Invoice number": "TES-1" });
  assert.equal(k.get(s, "Amount due in ZEC"), "0.5");
  assert.equal(k.get(s, "Invoice number"), "TES-1");
  assert.deepEqual(writes, [s], "load itself writes nothing back");
  k.clear(s);
  assert.deepEqual(k.draft(s), {});
  assert.deepEqual(writes, [s, s], "clearing (submit, cancel) is written, so storage forgets it too");
});
