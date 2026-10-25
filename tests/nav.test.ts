// Nav audit 2026-10-25: the phone tab bar's five screens, the public walk's next room, the
// applicant's reminder and the console's links to the app. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneTabs, screens } from "../src/lib/screens.ts";
import { nextRoom, PUBLIC_WALK, ROOMS } from "../src/app/lobby-data.ts";
import { APPLY_OPENED, APPLY_SENT, sentDay, waitingApplication } from "../src/lib/apply-state.ts";
import { appHref, isConsoleHost } from "../src/lib/hosts.ts";
import { handToVerify, takeForVerify } from "../src/lib/verify-handoff.ts";

const tos = (xs: Array<{ to: string }>) => xs.map((x) => x.to);

test("the desktop nav keeps every screen, in its order", () => {
  assert.deepEqual(tos(screens(null)), ["/app", "/try", "/verify", "/outsider", "/rates", "/account"]);
  assert.deepEqual(tos(screens("buyer")), ["/app", "/buyer", "/try", "/verify", "/outsider", "/rates", "/account"]);
  assert.equal(screens(null).at(-1)!.label, "Sign in");
  assert.equal(screens("member").at(-1)!.label, "Account");
  assert.equal(screens("member")[1].label, "Fund member");
});

test("the phone tab bar holds five screens: Home, Try, Verify, then role and Account, or Outsiders and Sign in", () => {
  assert.deepEqual(tos(phoneTabs(null)), ["/app", "/try", "/verify", "/outsider", "/account"]);
  assert.deepEqual(phoneTabs(null).map((s) => s.short), ["Home", "Try", "Verify", "Outsiders", "Sign in"]);
  for (const role of ["supplier", "buyer", "member"] as const) {
    const tabs = phoneTabs(role);
    assert.equal(tabs.length, 5);
    assert.deepEqual(tos(tabs), ["/app", "/try", "/verify", `/${role}`, "/account"]);
  }
  assert.deepEqual(phoneTabs("member").map((s) => s.short), ["Home", "Try", "Verify", "Fund", "Account"]);
  // short labels: at 13 px a tab is about 7 px a letter plus 24 px of padding; five fit 390 - 24 px
  for (const role of [null, "supplier", "buyer", "member"] as const) {
    const w = phoneTabs(role).reduce((n, s) => n + s.short.length * 7.2 + 24, 8);
    assert.ok(w <= 366, `${role}: ${w}`);
  }
});

test("a public page's next room walks Try, Verify, Outsiders, Rates, then the lobby", () => {
  assert.deepEqual(PUBLIC_WALK, ["try", "verify", "outsider", "rates"]);
  assert.equal(nextRoom("try").to, "/verify");
  assert.equal(nextRoom("verify").to, "/outsider");
  assert.equal(nextRoom("outsider").to, "/rates");
  assert.equal(nextRoom("rates").to, "/app");
  assert.equal(nextRoom("rates").kanji, "登");
  assert.equal(nextRoom("try").kanji, ROOMS.verify.kanji);
});

test("the financier's room is the demo console, on its own host", () => {
  assert.equal(ROOMS.financier.ext, true);
  assert.equal(ROOMS.financier.to, "https://jitsuinfi-console-demo.vercel.app/console");
  for (const r of Object.values(ROOMS)) if (!r.ext) assert.match(r.to, /^\/[a-z]+$/);
});

test("the applicant's reminder: from sending the application until the invite is opened", () => {
  const kv = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  assert.equal(waitingApplication(kv({})), null);
  assert.deepEqual(waitingApplication(kv({ [APPLY_SENT]: "2026-10-25T09:30:00.000Z" })), { day: "25 October 2026" });
  assert.equal(waitingApplication(kv({ [APPLY_SENT]: "2026-10-25T09:30:00.000Z", [APPLY_OPENED]: "2026-10-27T10:00:00.000Z" })), null);
  assert.equal(waitingApplication(kv({ [APPLY_SENT]: "not a date" })), null);
  assert.equal(
    waitingApplication(() => {
      throw new Error("storage blocked");
    }),
    null,
  );
  assert.equal(APPLY_SENT, "jitsuin.apply.sent");
  assert.equal(sentDay("2026-01-05T12:00:00.000Z"), "5 January 2026");
});

test("console links to the app go to the app's host only from a console's host", () => {
  assert.ok(isConsoleHost("jitsuinfi-console.vercel.app"));
  assert.ok(isConsoleHost("jitsuinfi-console-demo.vercel.app"));
  assert.ok(!isConsoleHost("jitsuinfi.vercel.app"));
  assert.ok(!isConsoleHost("localhost"));
  assert.equal(appHref("/verify", "jitsuinfi-console-demo.vercel.app"), "https://jitsuinfi.vercel.app/verify");
  assert.equal(appHref("/app", "jitsuinfi-console.vercel.app"), "https://jitsuinfi.vercel.app/app");
  assert.equal(appHref("/app", "localhost"), "/app");
});

test("a bundle handed to Verify is taken once", () => {
  assert.equal(takeForVerify(), null);
  handToVerify("  JTSBabc  ");
  assert.equal(takeForVerify(), "JTSBabc");
  assert.equal(takeForVerify(), null);
});
