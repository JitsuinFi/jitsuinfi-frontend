// Audit 2026-10-27, findings 9 and 10: one word for one thing on screen, and no format codes or
// command names where a person reads. Scans the screens' sources. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_NAV, SECTIONS } from "../src/lib/sections.ts";
import { ROOMS } from "../src/app/lobby-data.ts";

const root = new URL("../src/", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx$/.test(f) ? [join(dir, f)] : []));
/** The source without comments, so only what can reach the screen is checked. */
const code = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const screens = [...files(join(root, "pages")), ...files(join(root, "app")), ...files(join(root, "console"))];

test("Sign in and Sign out everywhere, never Log in or Log out", () => {
  for (const f of screens) assert.doesNotMatch(code(f), /\b[Ll]og (in|out)\b|\bLogs out\b/, f);
});

test("the key is the key fingerprint for every role", () => {
  for (const f of screens) assert.doesNotMatch(code(f), /Your test key/, f);
});

test("no format codes or command names in Verify's and the financier's words", () => {
  const verify = code(join(root, "pages/VerifyPage.tsx"));
  assert.doesNotMatch(verify, /\(JTS[A-Z]\)|"JTS[BPX]…|>JTS[BPX]<|jitsuin verify/);
  const fin = code(join(root, "pages/FinancierPage.tsx"));
  assert.doesNotMatch(fin, /jitsuin-flow|\{txid, height|anchored/);
});

test("one kanji per destination: tab, page stamp and lobby agree", () => {
  const verify = PUBLIC_NAV.find((n) => n.to === "/verify")!;
  assert.equal(verify.k, ROOMS.verify.kanji);
  assert.match(code(join(root, "pages/VerifyPage.tsx")), new RegExp(`<b lang="ja">${verify.k}</b>\\s*Public inspection`));
  assert.match(code(join(root, "pages/FinancierPage.tsx")), new RegExp(`${ROOMS.financier.kanji}\\s*</span>\\s*Financier, in your browser`));
  // Home and the account card's stamp no longer share 登
  const home = PUBLIC_NAV.find((n) => n.to === "/app")!;
  assert.doesNotMatch(code(join(root, "pages/AccountPage.tsx")), new RegExp(`className="ac-stamp" lang="ja" aria-hidden="true">\\s*${home.k}\\s*<`));
  // the supplier's advance received and the member's deposit are two slips
  assert.doesNotMatch(code(join(root, "pages/OutsiderPage.tsx")), /入金票/);
  const kanji = Object.values(SECTIONS).flat().map((s) => s.k);
  assert.ok(kanji.length > 0);
});
