// Nav audit 2026-10-25: the public walk's next room, the applicant's reminder and the console's
// links to the app (the nav itself: tests/ia.test.ts). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRoom, PUBLIC_WALK, ROOMS } from "../src/app/lobby-data.ts";
import { APPLY_OPENED, APPLY_SENT, sentDay, waitingApplication } from "../src/lib/apply-state.ts";
import { appHref, isConsoleHost } from "../src/lib/hosts.ts";
import { handToVerify, takeForVerify } from "../src/lib/verify-handoff.ts";


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
