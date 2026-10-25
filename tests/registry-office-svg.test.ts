// The chapter 6 registry office (src/landing/figures/registry-office.svg) is inserted as markup under
// a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style attributes, carry
// the geometry its runtime reads and the parts it moves, leave the runtime's texts (N and the block
// on the board) empty, show the real invoice and the board's real earlier lines, and every label
// hook must have an EN/中文 entry in i18n.ts. The N the chapter shows is read from TES-INV-0003's
// real register memo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/landing/figures/registry-office.svg", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/landing/i18n.ts", import.meta.url), "utf8");
const chapter = readFileSync(new URL("../src/landing/Finale.tsx", import.meta.url), "utf8");

test("the office has no script, no <style>, no inline style, no pure black or white", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "door", "doorMax", "sealAt", "circ", "w1", "chute", "waterZ", "land", "lift", "press"]) assert.ok(k in g, k);
  assert.equal(g.sealAt.length, 3);
  assert.equal(g.circ.length, 3);
  assert.ok(g.w1.length >= 2);
});

test("the moving parts are there; the figure is the button", () => {
  const parts = ["seal0", "seal1", "seal2", "imp0", "imp1", "imp2", "sheetN", "rowN", "rowH", "rowHl", "boardLed", "pulse1", "pulse1Halo", "coin", "ripple0", "ripple1", "ripple2", "door", "doorFace", "doorArt", "doorTop", "doorEdge", "openT", "lamp", "lampGlow", "loupe", "lpN", "lpH"];
  for (const p of parts) assert.match(svg, new RegExp(`data-part="${p}"`), p);
  assert.match(svg, /<svg[^>]* role="button" tabindex="0"/);
  // clip paths are page-wide ids: prefixed so they never meet another chapter's
  for (const m of svg.matchAll(/<clipPath id="([^"]+)"/g)) assert.match(m[1], /^ro-/);
});

test("the invoice and the board are real; N and the block are left to the runtime", () => {
  assert.match(svg, />TES-INV-0003</);
  assert.match(chapter, /const INVOICE_ID = "TES-INV-0003"/);
  // the board's earlier lines: its real register entries just before TES-INV-0003's
  assert.deepEqual([...svg.matchAll(/class="ui scr-n old"[^>]*>([^<]+)</g)].map((m) => m[1]), ["N 4242…4242", "N d415…228c"]);
  assert.deepEqual([...svg.matchAll(/class="ui scr-h"[^>]*>([^<]+)</g)].map((m) => m[1]), ["4 509 045", "4 509 085"]);
  for (const p of ["rowN", "rowH", "lpN"]) assert.match(svg, new RegExp(`data-part="${p}"></t`), p);
  assert.match(svg, /data-part="lpH"><\/tspan>/);
  assert.doesNotMatch(svg, /56ed|f975|4 509 299/);
});

test("the chapter's memo is TES-INV-0003's register entry, and its N is the real one", () => {
  const memo = chapter.match(/const REGISTER_MEMO =\s*"([^"]+)"/)?.[1];
  assert.ok(memo);
  const b = Buffer.from(memo, "base64url");
  assert.equal(b.subarray(0, 6).toString("hex"), "ff4a54533101"); // JTS1, register
  assert.equal(b.subarray(6, 38).toString("hex"), "56edc4f5ed4b4fcd4db71ac55a209bc4d774dce26d4328713319412222508450");
  assert.match(chapter, /txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", block: 4509299/);
});

test("every label hook has an en and zh entry", () => {
  const keys = [...svg.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 9);
  const used = [...keys, "fn.fig.hint", "fn.fig.st.ready", "fn.fig.st.seal", "fn.fig.st.sealed", "fn.fig.st.n", "fn.fig.st.board", "fn.fig.st.pool", "fn.fig.st.open"];
  for (const k of used) assert.match(i18n, new RegExp(`"${k.replace(/\./g, "\\.")}": \\{[\\s\\S]*?en: [\\s\\S]*?zh: `), k);
  for (const k of new Set(used)) assert.match(chapter, new RegExp(`"${k.replace(/\./g, "\\.")}"`), `${k} is set by the chapter`);
});
