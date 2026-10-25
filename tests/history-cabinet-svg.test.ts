// The chapter 5 history cabinet (src/landing/figures/history-cabinet.svg) is inserted as markup
// under a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style attributes,
// carry the geometry its runtime reads and the parts it moves, leave the runtime's texts (each
// certificate's N, the station's screen, the flaps) empty or at rest, show the chapter's real
// dates (#4 due 14 Aug, paid 17 Aug, three days late), and every label hook must have an EN/中文
// entry in i18n.ts that the chapter sets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/landing/figures/history-cabinet.svg", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/landing/i18n.ts", import.meta.url), "utf8");
const chapter = readFileSync(new URL("../src/landing/History.tsx", import.meta.url), "utf8");

test("the cabinet has no script, no <style>, no inline style, no pure black or white", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "cx", "park", "look", "outY", "rise", "w1", "w2", "railTop", "railZ", "mastFront", "stTop", "mx", "lensY", "lensZ", "cardY", "cardHw", "scanZ", "win", "winZ", "vy"]) assert.ok(k in g, k);
  assert.equal(g.cx.length, 5);
  assert.equal(g.win.length, 3);
});

test("the moving parts are there; the figure is the button", () => {
  const parts = ["carriage", "beam", "headLed", "pled", "scrNo", "scrN", "scrV", "scrX", "pulseG", "pulseGHalo", "pulse1", "pulse1Halo", "pulse2", "pulse2Halo"];
  for (let i = 0; i < 5; i++) parts.push(`trayB${i}`, `trayF${i}`, `panel${i}`, `card${i}`, `stamp${i}`, `row${i}`, `hl${i}`, `rowNo${i}`);
  for (let i = 1; i < 5; i++) parts.push(`link${i}`);
  for (let i = 0; i < 3; i++) parts.push(`flapIn${i}`, `digit${i}`);
  for (const p of parts) assert.match(svg, new RegExp(`data-part="${p}"`), p);
  assert.doesNotMatch(svg, /data-part="link0"/);
  assert.match(svg, /<svg[^>]* role="button" tabindex="0"/);
  // clip paths are page-wide ids: prefixed so they never meet another chapter's
  for (const m of svg.matchAll(/<clipPath id="([^"]+)"/g)) assert.match(m[1], /^hc-/);
});

test("the dates are the chapter's; N, the screen and the flaps are left to the runtime", () => {
  assert.match(chapter, /\{ amount: 27500, due: "2026-08-14", paid: "2026-08-17" \}/);
  const dues = [...svg.matchAll(/data-i18n="hs\.due" data-i18n-d="([^"]+)"/g)].map((m) => m[1]);
  const paid = [...svg.matchAll(/data-i18n="hs\.paidOn" data-i18n-d="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(dues, ["2026-04-15", "2026-05-15", "2026-06-12", "2026-07-15", "2026-08-14"]);
  assert.deepEqual(paid, ["2026-04-14", "2026-05-15", "2026-06-10", "2026-07-15", "2026-08-17"]);
  for (const [i, d] of dues.entries()) assert.match(chapter, new RegExp(`due: "${d}", paid: "${paid[i]}"`));
  assert.match(svg, />due 14 Aug</);
  assert.match(svg, />paid 17 Aug</);
  // only #4 was late, three days
  assert.deepEqual([...svg.matchAll(/data-i18n="hs\.late" data-i18n-n="(\d+)">(\d+) days late</g)].map((m) => [m[1], m[2]]), [["3", "3"]]);
  // the board rows are inked at runtime; nothing made up sits in them
  const ns = [...svg.matchAll(/data-n="">([^<]*)</g)];
  assert.equal(ns.length, 5);
  for (const m of ns) assert.equal(m[1], "");
  assert.match(svg, /data-part="scrNo"[^>]*>#—</);
  assert.match(svg, /data-part="scrN"[^>]*>N ——</);
  for (const m of svg.matchAll(/data-part="digit\d"[^>]*>([^<]*)</g)) assert.equal(m[1], "–");
  for (const m of svg.matchAll(/<g class="stamp" data-part="stamp\d"[^>]*opacity="0"/g)) assert.ok(m);
  assert.doesNotMatch(svg, /5c3e…a917|8f02…41bd|61fe…7d20/);
});

test("every label hook has an en and zh entry, set by the chapter", () => {
  const keys = [...svg.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.match(i18n, new RegExp(`"${k.replace(/\./g, "\\.")}": \\{[\\s\\S]*?en: [\\s\\S]*?zh: `), k);
  for (const k of new Set(keys)) assert.match(chapter, new RegExp(`"${k.replace(/\./g, "\\.")}"`), `${k} is set by the chapter`);
});
