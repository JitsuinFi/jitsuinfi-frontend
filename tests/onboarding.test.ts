// Audit 2026-10-27, finding 1: the Ready step after sign-up ends on any move to another screen, so
// a tab never changes the address without changing the page. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaveOnboarding, onboarding, onScreenChange } from "../src/lib/onboarding.ts";

test("a move to another screen ends the Ready step; the same screen keeps it", () => {
  let calls = 0;
  const off = onboarding.subscribe(() => calls++);
  onboarding.set(true);
  assert.equal(onboarding.on, true);
  onScreenChange(null, "/supplier/invoices"); // the shell's first look
  onScreenChange("/supplier/invoices", "/supplier/invoices");
  assert.equal(onboarding.on, true);
  onScreenChange("/supplier/invoices", "/supplier/contacts");
  assert.equal(onboarding.on, false);
  assert.equal(calls, 2);
  off();
});

test("a pressed tab or nav link ends it even on the screen it is on", () => {
  onboarding.set(true);
  leaveOnboarding();
  assert.equal(onboarding.on, false);
  let calls = 0;
  const off = onboarding.subscribe(() => calls++);
  leaveOnboarding(); // already ended: nobody repaints
  assert.equal(calls, 0);
  off();
});
