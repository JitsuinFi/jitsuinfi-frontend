// Mobile E2E 2 (TES-INV-MOB2-13631), finding 1: the phone's Desk loaded its deals once at sign-in
// and never again. One data source now refreshes the mail and the deals together: on sign-in, on
// sight, on focus and every 30 s while seen; asks at once share one request; "Needs you now"
// derives from both lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVERY_MS, needs, refresher, updatedLine, type Timers } from "../src/console/feed.ts";

function fakeTimers() {
  const live = new Map<number, () => void>();
  let id = 0;
  const t: Timers & { tick(): void; count(): number } = {
    setInterval: (f) => (live.set(++id, f), id),
    clearInterval: (h) => void live.delete(h as number),
    tick: () => [...live.values()].forEach((f) => f()),
    count: () => live.size,
  };
  return t;
}

function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
}

test("asks at once share one request", async () => {
  let calls = 0;
  const g = gate();
  const r = refresher(async () => (calls++, g.p), { visible: () => true, timers: fakeTimers() });
  const a = r.run();
  const b = r.run();
  assert.equal(a, b);
  assert.equal(r.busy, true);
  g.open();
  await a;
  assert.equal(calls, 1);
  assert.equal(r.busy, false);
  await r.run();
  assert.equal(calls, 2);
});

test("a fresh ask during a load gets one more load after it, shared too", async () => {
  let calls = 0;
  const g = gate();
  const r = refresher(async () => void (++calls === 1 && (await g.p)), { visible: () => true, timers: fakeTimers() });
  const first = r.run();
  const f1 = r.run(true);
  const f2 = r.run(true);
  assert.equal(f1, f2);
  g.open();
  await first;
  await f1;
  assert.equal(calls, 2);
});

test("polls every interval while seen, stops while hidden, starts again when seen", async () => {
  let calls = 0;
  let vis = true;
  const t = fakeTimers();
  const r = refresher(async () => void calls++, { visible: () => vis, timers: t });
  r.seen();
  await r.run();
  assert.equal(calls, 1);
  assert.equal(r.polling, true);
  t.tick();
  await r.run();
  assert.equal(calls, 2);
  // a second `seen` (focus) does not start a second timer
  r.seen();
  assert.equal(t.count(), 1);
  vis = false;
  r.visibility();
  assert.equal(r.polling, false);
  assert.equal(t.count(), 0);
  const before = calls;
  r.seen();
  assert.equal(calls, before, "nothing loads while hidden");
  vis = true;
  r.visibility();
  await r.run();
  assert.equal(r.polling, true);
  assert.ok(calls > before);
});

test("a tick while hidden stops the poll instead of loading", async () => {
  let calls = 0;
  let vis = true;
  const t = fakeTimers();
  const r = refresher(async () => void calls++, { visible: () => vis, timers: t });
  r.seen();
  await r.run();
  vis = false;
  t.tick();
  assert.equal(calls, 1);
  assert.equal(r.polling, false);
});

test("a failing load does not stick and stop ends it all", async () => {
  let calls = 0;
  const t = fakeTimers();
  const r = refresher(async () => {
    calls++;
    throw new Error("node down");
  }, { visible: () => true, timers: t });
  await r.run();
  await r.run();
  assert.equal(calls, 2);
  r.seen();
  await r.run(); // joins the load `seen` started
  r.stop();
  assert.equal(t.count(), 0);
  // after stop nothing loads
  const after = calls;
  await r.run();
  await r.run(true);
  assert.equal(calls, after);
});

// mobile E2E 3: the Desk was 44-47 s behind the node at a 30 s poll
test("polls every 15 s; the Desk coming into view loads fresh, after a load on its way, shared", async () => {
  assert.equal(EVERY_MS, 15_000);
  let calls = 0;
  const g = gate();
  const t = fakeTimers();
  const r = refresher(async () => {
    calls++;
    if (calls === 1) await g.p;
  }, { visible: () => true, timers: t });
  const first = r.run();
  r.seen(true); // the Desk came into view while the first load was on its way
  r.seen(true); // and again: still one more load, not two
  assert.equal(t.count(), 1);
  g.open();
  await first;
  await r.run(); // joins the queued fresh load
  assert.equal(calls, 2);
  r.seen(); // not fresh: no load waits behind one already done
  await r.run();
  r.stop();
});

const offer = (id: string, n: string, more: Record<string, unknown> = {}) => ({ relay_id: id, offer: { ok: true, n, invoice_id: `INV-${id}`, advance_zat: 1, ...more } });
const deal = (n: string, state: string) => ({ n, invoice_id: `INV-${n}`, state });

test("Needs you now derives from the mail and the deals together", () => {
  const mail = [offer("a", "n1"), offer("b", "n2", { accepted: {} }), offer("c", "n3", { accepted: {} }), { relay_id: "d", offer: { ok: false } }, { relay_id: "e" }];
  const deals = [deal("n3", "AwaitConfirmation"), deal("n4", "Pay"), deal("n5", "Done"), deal("n6", "Stopped")];
  const n = needs(deals, mail);
  assert.deepEqual(n.offers.map((m) => m.relay_id), ["a"]);
  // accepted, but the node has no deal for it yet; the one that is a deal shows as the deal
  assert.deepEqual(n.accepted.map((m) => m.relay_id), ["b"]);
  assert.deepEqual(n.acting.map((d) => d.n), ["n4"]);
  assert.deepEqual(n.moving.map((d) => d.n), ["n3"]);
  assert.deepEqual(n.rest.map((d) => d.n), ["n5", "n6"]);
  assert.equal(n.none, false);
  assert.equal(n.loading, false);
});

test("a new deal appears in Needs you now as soon as the deals list has it", () => {
  const mail = [offer("a", "n1", { accepted: {} })];
  const before = needs([], mail);
  assert.equal(before.moving.length, 0);
  assert.equal(before.accepted.length, 1);
  const after = needs([deal("n1", "AwaitSupplierSignature")], mail);
  assert.deepEqual(after.moving.map((d) => d.n), ["n1"]);
  assert.equal(after.accepted.length, 0);
});

test("unknown until both lists answered", () => {
  assert.equal(needs(null, []).loading, true);
  assert.equal(needs([], null).loading, true);
  assert.equal(needs(null, [offer("a", "n1", { accepted: {} })]).accepted.length, 0);
  assert.equal(needs([], []).none, true);
});

test("the line under Refresh", () => {
  const now = 1_000_000;
  assert.equal(updatedLine(now - 5_000, now), "Updated just now");
  assert.equal(updatedLine(now - 60_000, now), "Updated a minute ago");
  assert.equal(updatedLine(now - 300_000, now), "Updated 5 min ago");
  assert.equal(updatedLine(null, now, true), "Updating…");
  assert.equal(updatedLine(now - 5_000, now, false, "Could not update: node down."), "Could not update: node down. Last updated just now.");
});
