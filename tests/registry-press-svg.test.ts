// The chapter 2 registry press (src/landing/figures/registry-press.svg) is inserted as markup under
// a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style attributes, carry
// the geometry its runtime reads and the parts it moves, leave the runtime's texts empty, and every
// label hook must have an EN/中文 entry in i18n.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/landing/figures/registry-press.svg", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/landing/i18n.ts", import.meta.url), "utf8");
const chapter = readFileSync(new URL("../src/landing/Fingerprint.tsx", import.meta.url), "utf8");

test("the registry press has no script, no <style>, no inline style, no pure black or white", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "lever", "drum", "wheel", "rows", "newRows", "park", "drop", "feedDy", "inDx", "exitDx", "sink", "wire"]) assert.ok(k in g, k);
  assert.ok(g.newRows.length >= 2, "room for the registered and the edited invoice's N");
});

test("the moving parts are there; the lever is a button", () => {
  for (const p of ["paper", "lever", "carriage", "stamp", "lamp", "spokes", "crank", "pulse", "ribs"]) assert.match(svg, new RegExp(`data-part="${p}"`), p);
  for (const s of ["feed", "out", "in"]) assert.match(svg, new RegExp(`data-slot="${s}"`), s);
  assert.match(svg, /class="lever" data-part="lever" tabindex="0" role="button"/);
});

test("the invoice is the chapter's; the amount, the due date and the printed lines are left to the runtime", () => {
  assert.match(svg, />TES-INV-0007</);
  assert.match(chapter, /invoice_id: "TES-INV-0007"/);
  assert.match(svg, /<tspan data-amount=""><\/tspan>/);
  assert.match(svg, /<tspan data-due=""><\/tspan>/);
  for (const m of svg.matchAll(/data-n="">([^<]*)</g)) assert.equal(m[1], "");
  assert.doesNotMatch(svg, /250,000,000|f975…5cd5/);
});

test("every label hook has an en and zh entry", () => {
  const keys = [...svg.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8);
  for (const k of keys) assert.match(i18n, new RegExp(`"${k.replace(/\./g, "\\.")}": \\{[\\s\\S]*?en: [\\s\\S]*?zh: `), k);
});
