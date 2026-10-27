// Finding F10: device sync of a role's records (lib/sync.ts, lib/store.ts `entries`/`putSynced`),
// run with `npm test`. Two devices are two stores with the same keys and their own backends; the
// relay's state is a byte array between them, sealed with the real jitsuin-wasm mailbox seal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as w from "../src/wasm/jitsuin_wasm.js";
import { DealStore, MemoryBackend, type Entry } from "../src/lib/store.ts";
import { canonical, decodeState, encodeState, gzip, KEYS_GIVEN, mergeAll, mergeEntry, pdfAway, sameRecords, slim, STATE_LIMIT, SYNC_BUDGET, syncKey, type SyncState } from "../src/lib/sync.ts";
import { encodeBackup } from "../src/lib/buyer-history.ts";
import { keyAfterOtherDevices, keyGivenNote, keysFloor, keyTakenNote, type GivenKeys } from "../src/lib/key-match.ts";
import type { BuyerInvoice } from "../src/lib/buyer-invoices.ts";

w.initSync({ module: readFileSync(new URL("../src/wasm/jitsuin_wasm_bg.wasm", import.meta.url)) });

const keys = (fill: number) => new Uint8Array(64).fill(fill);
const inbox = new Uint8Array(32).fill(9);
const N1 = "a1".repeat(32);
const N2 = "b2".repeat(32);
const b64 = (n: number, seed = 1) => Buffer.from(Uint8Array.from({ length: n }, (_, i) => (i * 7919 + seed * 104729) % 251)).toString("base64");
/** Incompressible bytes, as a real PDF's are after its own compression. */
const noise = (n: number) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n))).toString("base64");

function inv(over: Partial<BuyerInvoice> = {}): BuyerInvoice {
  return { n: N1, invoice_id: "TES-INV-1", amount_zat: 100000, due_date: 20500, invoice: "JTSIaaaa", key_index: 0, terms_checked: true, received_at: 1000, ref: "abcdefghij", ...over };
}

/** One sync of `dev` through the relay's bytes, as lib/device-sync.ts runs it. */
async function sync(dev: DealStore, relay: { bytes: Uint8Array | null }, role: "buyer" | "supplier" | "member" = "buyer", now = Date.now()) {
  const key = await syncKey(inbox, role);
  const me = JSON.parse(w.mailboxKeysBytes(inbox.slice())) as { mailbox_pk: string };
  const remote = relay.bytes ? await decodeState(role, w.mailboxOpenBytes(inbox.slice(), relay.bytes), key) : null;
  const m = mergeAll(await dev.entries(), remote?.records ?? []);
  for (const e of m.toLocal) await dev.putSynced(e.id, e.doc, e.at);
  const out = await encodeState(role, m.records, key, now);
  if (!remote || !sameRecords(out.state.records, remote.records)) relay.bytes = w.mailboxSeal(me.mailbox_pk, globalThis.crypto.getRandomValues(new Uint8Array(32)), out.bytes);
  return { remote, out, merged: m };
}

// ---------- the store's side ----------
test("each write carries a later `at`; a deletion leaves a tombstone that list and get skip", async () => {
  const s = await DealStore.open("buyer", keys(1), new MemoryBackend());
  await s.put("contact:x", { a: 1 });
  await s.put("contact:x", { a: 2 });
  await s.put("pref:y", { b: 1 });
  await s.delete("pref:y");
  const e = await s.entries();
  const x = e.find((r) => r.id === "contact:x")!;
  const y = e.find((r) => r.id === "pref:y")!;
  assert.deepEqual(x.doc, { a: 2 });
  assert.equal(y.doc, null);
  assert.ok(y.at > x.at, "the deletion is later than the write before it");
  assert.equal(await s.get("pref:y"), undefined);
  assert.deepEqual((await s.list()).map((r) => r.id), ["contact:x"]);
});

test("a record from another device keeps its `at`, and a later write here still comes after it", async () => {
  const s = await DealStore.open("buyer", keys(1), new MemoryBackend());
  const future = Date.now() + 3_600_000; // the other device's clock runs an hour ahead
  await s.putSynced("contact:x", { v: "theirs" }, future);
  assert.equal((await s.entries())[0].at, future);
  await s.put("contact:x", { v: "mine" });
  assert.ok((await s.entries())[0].at > future);
});

test("a record written before sync (no `at`) reads as written at 0", async () => {
  const backend = new MemoryBackend();
  const s = await DealStore.open("buyer", keys(1), backend);
  await s.put("contact:x", { v: 1 });
  // rewrite it the way the store wrote records before this change: {id, doc} only
  const subtle = globalThis.crypto.subtle;
  const k = keys(1);
  const encKey = await subtle.importKey("raw", k.slice(0, 32), "AES-GCM", false, ["encrypt"]);
  const [r] = await backend.all();
  const ct = await subtle.encrypt({ name: "AES-GCM", iv: r.iv, additionalData: new TextEncoder().encode(`jitsuinfi-store-v1:${r.name}`) }, encKey, new TextEncoder().encode(JSON.stringify({ id: "contact:x", doc: { v: 1 } })));
  await backend.put({ ...r, ct: new Uint8Array(ct) });
  assert.deepEqual(await s.entries(), [{ id: "contact:x", at: 0, doc: { v: 1 } }]);
});

// ---------- merge rules ----------
test("per record the later write wins, and both devices pick the same on a tie", () => {
  const a: Entry = { id: "pref:x", at: 5, doc: { v: "a" } };
  const b: Entry = { id: "pref:x", at: 7, doc: { v: "b" } };
  assert.deepEqual(mergeEntry(a, b).doc, { v: "b" });
  assert.deepEqual(mergeEntry(b, a).doc, { v: "b" });
  const c: Entry = { id: "pref:x", at: 7, doc: { v: "c" } };
  assert.deepEqual(mergeEntry(b, c), mergeEntry(c, b));
});

test("a buyer's signature and every seal survive an older or newer copy without them", () => {
  // device 1 signed and sealed; device 2 wrote the record later (it saw a reminder) without them
  const d1: Entry = { id: `invoice:${N1}`, at: 10, doc: inv({ signature: "SIG", signature_sent_at: 11, assignment: { letter: "L", supplier_seal: "S0", buyer_seal: "S1", financier_seal: "S2", pdf: b64(30) } }) };
  const d2: Entry = { id: `invoice:${N1}`, at: 20, doc: inv({ reminders_seen: ["d-7"], terms_checked: false, assignment: { letter: "L" } }) };
  for (const m of [mergeEntry(d1, d2), mergeEntry(d2, d1)]) {
    const r = m.doc as BuyerInvoice;
    assert.equal(m.at, 20);
    assert.equal(r.signature, "SIG");
    assert.equal(r.signature_sent_at, 11);
    assert.deepEqual([r.assignment?.supplier_seal, r.assignment?.buyer_seal, r.assignment?.financier_seal], ["S0", "S1", "S2"]);
    assert.equal(r.assignment?.pdf, b64(30));
    assert.deepEqual(r.reminders_seen, ["d-7"]);
    assert.equal(r.terms_checked, true);
  }
  assert.equal(canonical(mergeEntry(d1, d2)), canonical(mergeEntry(d2, d1)));
});

test("seals of another letter are not mixed into this one", () => {
  const a: Entry = { id: `invoice:${N1}`, at: 10, doc: inv({ assignment: { letter: "L1", supplier_seal: "S0-of-L1" } }) };
  const b: Entry = { id: `invoice:${N1}`, at: 20, doc: inv({ assignment: { letter: "L2" } }) };
  assert.equal((mergeEntry(a, b).doc as BuyerInvoice).assignment?.supplier_seal, undefined);
});

test("PDF bytes win over a note that they are on another device", async () => {
  const full: Entry = { id: `invoice:${N1}`, at: 10, doc: inv({ terms_pdf: { name: "t.pdf", b64: b64(100) } }) };
  const thin = await slim({ ...full, at: 30 });
  assert.equal(pdfAway((thin.doc as BuyerInvoice).terms_pdf), true);
  assert.equal((thin.doc as BuyerInvoice).terms_pdf?.name, "t.pdf");
  assert.match((thin.doc as BuyerInvoice).terms_pdf!.away!.sha256, /^[0-9a-f]{64}$/);
  const m = mergeEntry(full, thin).doc as BuyerInvoice;
  assert.equal(m.terms_pdf?.b64, b64(100));
  assert.equal(m.terms_pdf?.away, undefined);
});

test("a supplier's deal keeps every step either device reached; a declined offer does not come back", () => {
  const base = { n: N2, invoice_id: "TES-INV-2", buyer_pk: "bb", supplier_pk: "ss", amount_zat: 5, due_date: 9, invoice: "JTSIbbbb", created_at: 100, ref: "kkkkkkkkkk" };
  const d1: Entry = { id: N2, at: 10, doc: { ...base, buyer_signature: "SIG", offer: { financier_pk: "F1", advance_zat: 4, supplier_address: "utest", sent: { to: "m", at: 9 } } } };
  const d2: Entry = { id: N2, at: 20, doc: { ...base, sign_request: { to: "mb", at: 3 } } };
  const m = mergeEntry(d1, d2).doc as Record<string, unknown>;
  assert.equal(m.buyer_signature, "SIG");
  assert.ok(m.offer, "the offer made on device 1 stays");
  assert.ok(m.sign_request);
  const declined: Entry = { id: N2, at: 30, doc: { ...base, buyer_signature: "SIG", declined: [{ financier_pk: "F1", reason: "no", at: 25 }] } };
  const m2 = mergeEntry(d1, declined).doc as Record<string, unknown>;
  assert.equal(m2.offer, undefined, "the decline cleared it");
  assert.equal((m2.declined as unknown[]).length, 1);
});

test("the keys handed out are a set: nothing handed out on either device is lost, even by a deletion", () => {
  const a: Entry = { id: KEYS_GIVEN, at: 10, doc: { given: [{ k: 0, to: "S1", at: 5 }] } };
  const b: Entry = { id: KEYS_GIVEN, at: 20, doc: { given: [{ k: 0, to: "S1", at: 7 }, { k: 0, to: "copied", at: 8 }] } };
  assert.deepEqual(mergeEntry(a, b).doc, { given: [{ k: 0, to: "S1", at: 5 }, { k: 0, to: "copied", at: 8 }] });
  assert.deepEqual(mergeEntry(a, { id: KEYS_GIVEN, at: 30, doc: null }).doc, a.doc);
});

test("a member's withdraw tokens from either device are kept; a payout's new leaf replaces the old one", () => {
  const h = (leaf: string, dep?: string, units = 10) => ({ fund_pk: "F", fund_mailbox: "M", token: `t-${leaf}`, leaf_id: leaf, units, period: 1, nav: { assets_zat: 1, units: 1 }, ...(dep ? { deposit_txid: dep } : {}) });
  const a: Entry = { id: "fund:wallet", at: 10, doc: { holdings: [h("L1", "D1"), h("L2", "D2")], payouts: [] } };
  const b: Entry = { id: "fund:wallet", at: 20, doc: { holdings: [h("L1b", "D1", 4)], payouts: [{ fund_pk: "F", period: 1, units: 6, amount_zat: 6, txid: "T" }] } };
  const m = mergeEntry(a, b).doc as { holdings: Array<{ leaf_id: string }>; payouts: unknown[] };
  assert.deepEqual(m.holdings.map((x) => x.leaf_id).sort(), ["L1b", "L2"]);
  assert.equal(m.payouts.length, 1);
});

test("a deletion wins when it is newer, and stays a tombstone", () => {
  const live: Entry = { id: "buyerkey:x", at: 10, doc: { invoice_pk: "x" } };
  const gone: Entry = { id: "buyerkey:x", at: 20, doc: null };
  assert.equal(mergeEntry(live, gone).doc, null);
  assert.deepEqual(mergeEntry({ ...live, at: 30 }, gone).doc, { invoice_pk: "x" });
});

test("the merge says what this device writes; the history is never written here by the sync", () => {
  const local: Entry[] = [{ id: "contact:a", at: 5, doc: { a: 1 } }, { id: "sync:meta", at: 1, doc: {} }];
  const remote: Entry[] = [{ id: "contact:b", at: 6, doc: { b: 1 } }, { id: "history", at: 7, doc: { certs: ["x"] } }];
  const m = mergeAll(local, remote);
  assert.deepEqual(m.records.map((r) => r.id), ["contact:a", "contact:b", "history"]);
  assert.deepEqual(m.toLocal.map((r) => r.id), ["contact:b"]);
});

// ---------- the sealed state ----------
test("the state opens only with the account's key; one sealed to the public mailbox key by anyone else is refused", async () => {
  const key = await syncKey(inbox, "buyer");
  const recs: Entry[] = [{ id: `invoice:${N1}`, at: 1, doc: inv() }];
  const e = await encodeState("buyer", recs, key, 123);
  const back = await decodeState("buyer", e.bytes, key);
  assert.deepEqual(back.records, recs);
  assert.equal(back.written_at, 123);
  // the relay (or anyone) knows the mailbox key, so it can seal a state: without the inner key it does not open
  const forged = await encodeState("buyer", [{ id: `invoice:${N1}`, at: 9e12, doc: inv({ signature: "FAKE" }) }], await syncKey(new Uint8Array(32).fill(1), "buyer"), 1);
  await assert.rejects(decodeState("buyer", forged.bytes, key));
  // another role's state does not open as this role's
  await assert.rejects(decodeState("supplier", e.bytes, await syncKey(inbox, "supplier")));
  // nothing readable in it
  assert.ok(!Buffer.from(e.bytes).toString("latin1").includes("TES-INV"));
});

test("the buyer's version 1 history copy is read as the history record", async () => {
  const v1 = encodeBackup({ certs: ["SlRTSAAA"] });
  const s = await decodeState("buyer", v1, await syncKey(inbox, "buyer"));
  assert.deepEqual(s.records, [{ id: "history", at: 0, doc: { certs: ["SlRTSAAA"] } }]);
});

test("size: within the relay's 64 KiB, PDF bytes go first, then the oldest settled records; history and keys always stay", async () => {
  const key = await syncKey(inbox, "buyer");
  const recs: Entry[] = [
    { id: "history", at: 1, doc: { certs: ["Y2VydA"] } },
    { id: KEYS_GIVEN, at: 1, doc: { given: [{ k: 0, to: "S", at: 1 }] } },
  ];
  for (let i = 0; i < 6; i++) recs.push({ id: `invoice:${String(i).padStart(64, "0")}`, at: 10 + i, doc: inv({ n: String(i), invoice_id: `TES-${i}`, terms_pdf: { name: `p${i}.pdf`, b64: noise(20_000) }, ...(i < 2 ? { bundle: noise(3000) } : {}) }) });
  const e = await encodeState("buyer", recs, key, 1);
  assert.ok(e.bytes.length + 48 <= STATE_LIMIT + 48, `${e.bytes.length} bytes`);
  assert.equal(e.state.slimmed, 6, "every PDF left out");
  assert.equal(e.state.held_back, 0, "the records themselves fit");
  const back = await decodeState("buyer", e.bytes, key);
  assert.ok(back.records.every((r) => r.id === "history" || r.id === KEYS_GIVEN || pdfAway((r.doc as BuyerInvoice).terms_pdf)));
  // a small budget: settled (bundle) records go first, the oldest first; history and keys stay
  const tight = await encodeState("buyer", recs, key, 1, 4000);
  const ids = tight.state.records.map((r) => r.id);
  assert.ok(ids.includes("history") && ids.includes(KEYS_GIVEN));
  assert.ok(tight.state.held_back > 0);
  assert.ok(!ids.includes(recs[2].id), "the oldest settled invoice went first");
  assert.ok((await gzip(new TextEncoder().encode(JSON.stringify(tight.state)))).length <= 4000);
  // small PDFs travel with their records when there is room
  const small = await encodeState("buyer", [{ id: `invoice:${N1}`, at: 1, doc: inv({ terms_pdf: { name: "s.pdf", b64: b64(2000) } }) }], key, 1);
  assert.equal(small.state.slimmed, 0);
  assert.ok(SYNC_BUDGET < STATE_LIMIT);
});

test("a held-back record is not a deletion: the device that has it keeps it", async () => {
  const relay = { bytes: null as Uint8Array | null };
  const d1 = await DealStore.open("buyer", keys(1), new MemoryBackend());
  await d1.put(`invoice:${N1}`, inv());
  await sync(d1, relay);
  // the relay's state now lacks it (as if held back); device 1 syncs again
  const key = await syncKey(inbox, "buyer");
  const me = JSON.parse(w.mailboxKeysBytes(inbox.slice())) as { mailbox_pk: string };
  relay.bytes = w.mailboxSeal(me.mailbox_pk, new Uint8Array(32).fill(3), (await encodeState("buyer", [], key, 2)).bytes);
  await sync(d1, relay);
  assert.ok(await d1.get(`invoice:${N1}`));
});

// ---------- two devices ----------
test("device 2 gets device 1's signed and sealed invoice (its Pay slip) and the keys it handed out", async () => {
  const relay = { bytes: null as Uint8Array | null };
  const d1 = await DealStore.open("buyer", keys(1), new MemoryBackend());
  const d2 = await DealStore.open("buyer", keys(1), new MemoryBackend());
  await d1.put(`invoice:${N1}`, inv({ signature: "SIG", assignment: { letter: "L", supplier_seal: "S0", buyer_seal: "S1", financier_seal: "S2" } }));
  await d1.put(KEYS_GIVEN, { given: [{ k: 0, to: "S1MAILBOX", at: 5 }] });
  await d1.put("contact:S1MAILBOX", { role: "supplier", mailbox_pk: "S1MAILBOX", fingerprint: "AB-CD", username: "s1" });
  await d1.put("history", { certs: ["Y2VydDA"] });
  await sync(d1, relay);
  const r = await sync(d2, relay);
  const got = await d2.get<BuyerInvoice>(`invoice:${N1}`);
  assert.equal(got?.assignment?.financier_seal, "S2", "the Pay slip's three seals are on device 2");
  assert.ok(await d2.get("contact:S1MAILBOX"));
  assert.equal(await d2.get("history"), undefined, "the history waits for the board check on the key screen");
  assert.deepEqual((r.remote?.records.find((x) => x.id === "history")?.doc as { certs: string[] }).certs, ["Y2VydDA"]);
  // key reuse across devices: device 2 never saw key #0 used, but the synced records say it is
  const invoices = (await d2.list<BuyerInvoice>()).filter((x) => x.id.startsWith("invoice:")).map((x) => x.doc);
  const given = (await d2.get<GivenKeys>(KEYS_GIVEN))!;
  assert.equal(keysFloor(invoices, given), 1);
  assert.match(keyTakenNote(0, invoices.filter((x) => x.key_index === 0).map((x) => ({ invoice_id: x.invoice_id, signed: !!x.signature })))!.title, /Key #0 is on TES-INV-1/);
  // the certificate device 1 issued moves device 2's offer to key #1, even with the board unread
  assert.deepEqual(keyAfterOtherDevices(0, 0, 1), { k: 1, moved: true });
  assert.deepEqual(keyAfterOtherDevices(1, 1, 1), { k: 1, moved: false });
});

test("a key handed out on device 1 with no invoice yet is named on device 2", async () => {
  const note = keyGivenNote(0, { given: [{ k: 0, to: "S1MAILBOX", at: Date.parse("2026-10-27") }] }, (to) => (to === "S1MAILBOX" ? "@s1" : "?"));
  assert.match(note!.title, /Key #0 was handed out on 2026-10-27: @s1/);
  assert.equal(keyGivenNote(1, { given: [{ k: 0, to: "x", at: 1 }] }, String), null);
});

test("both devices change one deal at once: after two syncs each has both changes", async () => {
  const relay = { bytes: null as Uint8Array | null };
  const d1 = await DealStore.open("supplier", keys(2), new MemoryBackend());
  const d2 = await DealStore.open("supplier", keys(2), new MemoryBackend());
  const base = { n: N2, invoice_id: "TES-INV-2", buyer_pk: "bb", supplier_pk: "ss", amount_zat: 5, due_date: 9, invoice: "JTSIbbbb", created_at: 100, ref: "kkkkkkkkkk" };
  await d1.put(N2, base);
  await sync(d1, relay, "supplier");
  await sync(d2, relay, "supplier");
  // offline at once: device 1 gets the signature, device 2 sends the sign request
  await d1.put(N2, { ...base, buyer_signature: "SIG" });
  await d2.put(N2, { ...base, sign_request: { to: "mb", at: 7 } });
  await sync(d2, relay, "supplier");
  await sync(d1, relay, "supplier");
  await sync(d2, relay, "supplier");
  for (const d of [d1, d2]) {
    const x = (await d.get<Record<string, unknown>>(N2))!;
    assert.equal(x.buyer_signature, "SIG");
    assert.deepEqual(x.sign_request, { to: "mb", at: 7 });
  }
  // nothing new: the next sync sends nothing
  const before = relay.bytes;
  await sync(d1, relay, "supplier");
  assert.equal(relay.bytes, before);
});

test("the relay handing back an older state does not undo a newer record", async () => {
  const relay = { bytes: null as Uint8Array | null };
  const d1 = await DealStore.open("buyer", keys(1), new MemoryBackend());
  await d1.put(`invoice:${N1}`, inv());
  await sync(d1, relay);
  const old = relay.bytes;
  await d1.put(`invoice:${N1}`, inv({ signature: "SIG" }));
  await sync(d1, relay);
  relay.bytes = old; // rollback
  const r = await sync(d1, relay);
  assert.equal((await d1.get<BuyerInvoice>(`invoice:${N1}`))?.signature, "SIG");
  assert.ok((r.remote as SyncState).written_at < r.out.state.written_at);
});
