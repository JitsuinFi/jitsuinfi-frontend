// HNK-34.T4: the handed-in sheet on #/verify (src/pages/verify/sheet.ts) is inserted as markup
// under a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style attributes,
// use DS-PAL inks only, and give every read line a mark the loupe can press. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AZ, P, docSvg, layout, markSvg, unproject, wrap, type Sheet } from "../src/pages/verify/sheet.ts";

const PAL = new Set(["#020D2F", "#032C7D", "#0841C9", "#1D97F1", "#C4C7F2", "#461D3A", "#502A50", "#7E2A53", "#BA71A2", "#ECD0EC", "#F6F5FC", "#FCFCFE"]);

const sheet: Sheet = {
  kind: "Verification bundle (JTSB)",
  code: "SlRTQgEBiABKVFNJARJURVMtSU5WLUUyRTEtNzcyMTDD17aIWvkL7tcl",
  rows: [
    { g: "seal", what: "Buyer's signature", found: "holds for these exact invoice bytes", stamp: "認" },
    { g: "doc", what: "Invoice", found: "TES-INV-E2E1-77210 <&>", stamp: "" },
    { g: "seals3", what: "Assignment letter", found: "waiting for the financier's seal", stamp: "待", open: 1 },
    { g: "n", what: "Fingerprint N", found: "9043345834514421fc558049b78441ab01d89a35f8eaae95682bbfc50c83dfc0", stamp: "", mono: true },
    { g: "board", what: "Registration", found: "registered for 2 financiers", stamp: "重" },
    { g: "settled", what: "Settled", found: "not read", stamp: "", unread: true },
  ],
};

test("the sheet has no script, no <style>, no inline style, DS-PAL inks only", () => {
  for (const narrow of [false, true]) {
    for (const s of [sheet, null]) {
      const svg = docSvg(layout(s, narrow), s);
      assert.doesNotMatch(svg, /<script/i);
      assert.doesNotMatch(svg, /<style/i);
      assert.doesNotMatch(svg, /\sstyle=/i);
      for (const [hex] of svg.matchAll(/#[0-9A-Fa-f]{3,6}\b/g)) assert.ok(PAL.has(hex.toUpperCase()), hex);
    }
  }
});

test("every read line has one mark; an unread line has none; text is escaped", () => {
  const svg = docSvg(layout(sheet, false), sheet);
  const rows = svg.split('<g class="vf-row"').slice(1);
  assert.equal(rows.length, sheet.rows.length);
  rows.forEach((r, i) => assert.equal((r.match(/class="vf-mark"/g) ?? []).length, sheet.rows[i].unread ? 0 : 1, sheet.rows[i].what));
  assert.match(svg, /TES-INV-E2E1-77210 &lt;&amp;&gt;/);
  assert.match(markSvg({ g: "board", what: "", found: "", stamp: "重" }), /fill="#7E2A53"/);
  assert.match(markSvg({ g: "seal", what: "", found: "", stamp: "待" }), /stroke-dasharray/);
  assert.match(markSvg({ g: "doc", what: "", found: "", stamp: "" }), /data-dot="1"/);
});

test("lines are laid out top to bottom and long text wraps inside the sheet", () => {
  const L = layout(sheet, true);
  for (let i = 1; i < L.rows.length; i++) assert.equal(L.rows[i].y, L.rows[i - 1].y + L.rows[i - 1].h);
  assert.ok(L.rows[3].lines.length >= 2, "N is chunked on a phone");
  assert.ok(L.H >= L.rows.at(-1)!.y + L.rows.at(-1)!.h);
  assert.deepEqual(wrap("one two three", 7), ["one two", "three"]);
});

test("the sheet is turned about 4° so marks stay level with their labels", () => {
  assert.ok(Math.abs((AZ * 180) / Math.PI - 4) < 1e-9);
  const [x, y] = P(300, 200);
  const [u, v] = unproject(x, y);
  assert.ok(Math.abs(u - 300) < 1e-9 && Math.abs(v - 200) < 1e-9);
});
