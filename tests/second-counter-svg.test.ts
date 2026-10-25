// The chapter 4 second financier's counter (src/landing/figures/second-counter.svg) is inserted as
// markup under a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style
// attributes, carry the geometry its runtime reads and the parts it moves, leave the runtime's texts
// (N, A's commitment) empty, show the chapter's real invoice and board rows, and every label hook
// must have an EN/中文 entry in i18n.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/landing/figures/second-counter.svg", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/landing/i18n.ts", import.meta.url), "utf8");
const chapter = readFileSync(new URL("../src/landing/Twice.tsx", import.meta.url), "utf8");
const press = readFileSync(new URL("../src/landing/figures/registry-press.svg", import.meta.url), "utf8");

test("the counter has no script, no <style>, no inline style, no pure black or white", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "w1", "w2", "head", "scan", "paperRest", "shutOpen", "slipIn"]) assert.ok(k in g, k);
  assert.ok(g.w1.length >= 2 && g.w2.length >= 2);
});

test("the moving parts are there; the figure is the button", () => {
  for (const p of ["paper", "slip", "curtain", "lamp", "beam", "headLed", "pled", "scrN", "scrV", "hlN", "hlA", "rowNo", "rowN", "rowA", "pulse1", "pulse1Halo", "pulse2", "pulse2Halo"]) {
    assert.match(svg, new RegExp(`data-part="${p}"`), p);
  }
  assert.match(svg, /<svg[^>]* role="button" tabindex="0"/);
  // clip paths are page-wide ids: prefixed so they never meet another chapter's
  for (const m of svg.matchAll(/<clipPath id="([^"]+)"/g)) assert.match(m[1], /^tc-/);
});

test("the invoice and the board are the chapter's; N and the commitment are left to the runtime", () => {
  assert.match(svg, />TES-INV-0007</);
  assert.match(chapter, /invoice_id: "TES-INV-0007"/);
  assert.match(svg, />40,000 zat</);
  assert.match(svg, />2026-12-18</);
  // the board's earlier lines are the same real fingerprints chapter 2 shows (rows 4-6)
  const old = (s: string) => [...s.matchAll(/class="ui entry-n old"[^>]*>(N [^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(old(svg), old(press));
  for (const m of svg.matchAll(/data-n="">([^<]*)</g)) assert.equal(m[1], "");
  assert.match(svg, /<tspan class="entry-c" data-c=""><\/tspan>/);
  assert.doesNotMatch(svg, /f975…5cd5|3b9e|250,000,000|2 841/);
});

test("every label hook has an en and zh entry", () => {
  const keys = [...svg.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 12);
  for (const k of keys) assert.match(i18n, new RegExp(`"${k.replace(/\./g, "\\.")}": \\{[\\s\\S]*?en: [\\s\\S]*?zh: `), k);
  for (const k of new Set(keys)) assert.match(chapter, new RegExp(`"${k.replace(/\./g, "\\.")}"`), `${k} is set by the chapter`);
});
