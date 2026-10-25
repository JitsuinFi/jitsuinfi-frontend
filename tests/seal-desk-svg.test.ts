// The chapter 3 seal desk (src/landing/figures/seal-desk.svg) is inserted as markup under a CSP
// without 'unsafe-inline': it must stay free of scripts, <style> and style attributes, carry the
// geometry its runtime reads, and every label hook must have an EN/中文 entry in i18n.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/landing/figures/seal-desk.svg", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/landing/i18n.ts", import.meta.url), "utf8");

test("the seal desk has no script, no <style>, no inline style", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
});

test("three pressable seals, the financier's is 融", () => {
  const seals = [...svg.matchAll(/class="seal" data-seal="(\d)"/g)].map((m) => m[1]);
  assert.deepEqual(seals, ["0", "1", "2"]);
  assert.match(svg, /data-seal="2"[^>]*>[\s\S]*?>融<\/text>/);
  assert.doesNotMatch(svg, />金</);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "sealAt", "circles", "a", "ax", "up", "len", "sRest", "sGate", "rest"]) assert.ok(k in g, k);
  assert.equal(g.sealAt.length, 3);
});

test("every label hook has an en and zh entry", () => {
  const keys = [...svg.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8);
  for (const k of keys) assert.match(i18n, new RegExp(`"${k.replace(/\./g, "\\.")}": \\{[\\s\\S]*?en: [\\s\\S]*?zh: `), k);
});
