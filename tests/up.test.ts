// Judge run 2, finding 9: every non-root screen has an in-app way back (PWA standalone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { backTarget, rootsFor, screenName, upFor } from "../src/lib/up.ts";

test("top-level screens need no Back: Home, the tabs, the nav", () => {
  for (const p of ["/app", "/supplier/invoices", "/supplier/invoices/new", "/supplier/contacts", "/supplier/deal"]) assert.equal(upFor(p, "", "supplier", true), null, p);
  for (const p of ["/buyer/invoices", "/buyer/pay", "/buyer/history", "/buyer/contacts"]) assert.equal(upFor(p, "", "buyer", false), null, p);
  for (const p of ["/app", "/try", "/verify", "/account"]) assert.equal(upFor(p, "", null, true), null, p);
  assert.ok(rootsFor("member").has("/member/units"));
});

test("every screen under a section goes up to it", () => {
  assert.deepEqual(upFor("/supplier/deal/abc", "", "supplier", true), { to: "/supplier/invoices", title: "All invoices" });
  assert.deepEqual(upFor("/supplier/deal/abc", "?at=offer", "supplier", true), { to: "/supplier/deal/abc", title: "the deal" });
  assert.deepEqual(upFor("/supplier/deal/abc", "?at=offer", "supplier", false), { to: "/supplier/invoices", title: "All invoices" });
  assert.deepEqual(upFor("/buyer/invoices/xyz", "", "buyer", true), { to: "/buyer/invoices", title: "Invoices" });
  assert.deepEqual(upFor("/buyer/invoices/key", "", "buyer", false), { to: "/buyer/invoices", title: "Invoices" });
  assert.deepEqual(upFor("/buyer/invoices/by-hand", "", "buyer", true), { to: "/buyer/invoices", title: "Invoices" });
  assert.deepEqual(upFor("/buyer/pay/xyz", "", "buyer", true), { to: "/buyer/pay", title: "Pay" });
  assert.deepEqual(upFor("/app/contact", "", "buyer", true), { to: "/buyer/contacts", title: "Contacts" });
});

test("a signed-in person's Verify, Try, Account and the public rooms go up to Home", () => {
  for (const p of ["/verify", "/try", "/account", "/outsider", "/rates", "/apply"]) assert.deepEqual(upFor(p, "", "supplier", true), { to: "/app", title: "Home" }, p);
  assert.deepEqual(upFor("/outsider", "", null, true), { to: "/app", title: "Home" });
  assert.deepEqual(upFor("/try/play", "", null, true), { to: "/try", title: "Try it" });
});

test("Back returns to the previous in-app screen, named; without one it goes up", () => {
  const up = upFor("/verify", "", "supplier", true)!;
  assert.deepEqual(backTarget(up, "/supplier/deal/abc", "/verify", "", "supplier"), { kind: "history", to: "/supplier/deal/abc", title: "the deal" });
  assert.deepEqual(backTarget(up, null, "/verify", "", "supplier"), { kind: "up", to: "/app", title: "Home" });
});

test("a station opened from the inbox goes up to its deal, not to the screen before", () => {
  const up = upFor("/supplier/deal/abc", "?at=advance", "supplier", true)!;
  assert.equal(backTarget(up, "/supplier/contacts", "/supplier/deal/abc", "?at=advance", "supplier").kind, "up");
  assert.equal(backTarget(up, "/supplier/deal/abc", "/supplier/deal/abc", "?at=advance", "supplier").kind, "history");
});

test("screens are named in plain words", () => {
  assert.equal(screenName("/buyer/invoices/x", "buyer"), "the invoice");
  assert.equal(screenName("/buyer/pay", "buyer"), "Pay");
  assert.equal(screenName("/app", null), "Home");
  assert.equal(screenName("/supplier/invoices/new", "supplier"), "Write an invoice");
});

test("a record does not go back to the form that made it, nor to the screen under the inbox (mobile E2E 2026-10-27)", () => {
  const deal = upFor("/supplier/deal/abc", "", "supplier", true)!;
  assert.deepEqual(backTarget(deal, "/supplier/invoices/new", "/supplier/deal/abc", "", "supplier"), { kind: "up", to: "/supplier/invoices", title: "All invoices" });
  assert.equal(backTarget(deal, "/supplier/invoices", "/supplier/deal/abc", "", "supplier").kind, "history");
  const inv = upFor("/buyer/invoices/xyz", "", "buyer", true)!;
  assert.deepEqual(backTarget(inv, "/buyer/invoices/key", "/buyer/invoices/xyz", "", "buyer"), { kind: "up", to: "/buyer/invoices", title: "Invoices" });
  assert.equal(backTarget(inv, "/buyer/invoices", "/buyer/invoices/xyz", "", "buyer").kind, "history");
  const slip = upFor("/buyer/pay/xyz", "", "buyer", true)!;
  assert.deepEqual(backTarget(slip, "/buyer/invoices/xyz", "/buyer/pay/xyz", "", "buyer"), { kind: "history", to: "/buyer/invoices/xyz", title: "the invoice" });
});
