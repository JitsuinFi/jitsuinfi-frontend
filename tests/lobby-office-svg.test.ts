// The lobby's registry office (src/app/figures/lobby-office.svg, HNK-34.T1) is inserted as markup
// under a CSP without 'unsafe-inline': it must stay free of scripts, <style> and style attributes,
// carry the geometry its runtime reads and the parts it moves, and give every room a floor spot, a
// hit area and a pin (whose position is a generated CSS rule, not an inline style). The board's data
// (TES-INV-0003's N and its two blocks) is left to the runtime, which reads it from the board copy
// bundled with the app: checked here on that copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockText, nShort, twiceOf } from "../src/app/lobby-data.ts";
import { KIT } from "../src/lib/kit.ts";
import { BOARD_COPY } from "../src/lib/board.ts";

const svg = readFileSync(new URL("../src/app/figures/lobby-office.svg", import.meta.url), "utf8");
const pins = readFileSync(new URL("../src/app/figures/lobby-office-pins.css", import.meta.url), "utf8");
// the lobby and its rooms' copy (src/app/lobby-data.ts ROOMS since the nav audit of 2026-10-25)
const lobby = readFileSync(new URL("../src/app/Lobby.tsx", import.meta.url), "utf8") + readFileSync(new URL("../src/app/lobby-data.ts", import.meta.url), "utf8");
const ROOMS = ["supplier", "buyer", "financier", "outsider", "member", "verify", "try", "rates"];

test("the office has no script, no <style>, no inline style, no pure black or white", () => {
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<style/i);
  assert.doesNotMatch(svg, /\sstyle=/i);
  assert.doesNotMatch(svg, /#(?:000|fff)(?:000|fff)?\b/i);
  assert.doesNotMatch(lobby, /\sstyle=\{/);
});

test("the runtime's geometry is on the root", () => {
  const raw = svg.match(/data-geometry="([^"]+)"/)?.[1];
  assert.ok(raw);
  const g = JSON.parse(raw.replace(/&quot;/g, '"'));
  for (const k of ["P", "door", "doorMax", "sealAt", "circ", "w1", "chute", "waterZ", "land", "lift", "press"]) assert.ok(k in g, k);
  assert.equal(g.sealAt.length, 3);
  assert.equal(g.circ.length, 3);
});

test("the moving parts are there; the figure is an image, its rooms are links in the page", () => {
  const parts = ["seal0", "seal1", "seal2", "imp0", "imp1", "imp2", "sheetN", "rowN", "rowH", "rowHl", "boardLed", "pulse1", "pulse1Halo", "coin", "ripple0", "ripple1", "ripple2", "door", "doorFace", "doorArt", "doorTop", "doorEdge", "openT", "lamp", "lampGlow", "vRow1", "vStamp", "tryStamp", "rateScan", "vN", "v1", "v2", "tryN0", "tryN1"];
  for (const p of parts) assert.match(svg, new RegExp(`data-part="${p}"`), p);
  assert.match(svg, /<svg[^>]* role="img" aria-label="[^"]+"/);
  assert.doesNotMatch(svg, /tabindex/);
  // clip paths are page-wide ids: prefixed so they never meet chapter 6's (ro-)
  const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.match(id, /^lo-/);
});

test("every room has a floor spot, a hit area, a pin and a directory line; the back wall's panes light", () => {
  for (const r of ROOMS) {
    assert.match(svg, new RegExp(`class="spot" data-room="${r}"`), `spot ${r}`);
    assert.match(svg, new RegExp(`class="hit" data-room="${r}"`), `hit ${r}`);
    const m = pins.match(new RegExp(`\\.pin\\[data-room="${r}"\\] \\{ left: ([\\d.]+)%; top: ([\\d.]+)%; \\}`));
    assert.ok(m, `pin ${r}`);
    for (const v of [Number(m[1]), Number(m[2])]) assert.ok(v > 0 && v < 100, `pin ${r} inside the figure`);
    assert.match(lobby, new RegExp(`^  ${r}: \\{`, "m"), `room ${r}`);
  }
  for (const r of ["outsider", "verify", "rates"]) assert.match(svg, new RegExp(`class="pane-lit" data-room="${r}"`), r);
});

test("the directory leads to every room; the financier's line opens the demo console and offers to apply", () => {
  for (const to of ["/try", "/verify", "/outsider", "/rates", "/supplier", "/buyer", "/member"]) assert.match(lobby, new RegExp(`to: "${to}"`), to);
  assert.match(lobby, /financier: \{ to: CONSOLE_DEMO_URL, ext: true, kanji: "融", title: "Financier"/);
  assert.match(lobby, /<Link to="\/apply">Apply as a financier<\/Link>/);
  assert.match(lobby, /<Link to="\/apply">Check for your invite<\/Link>/);
  assert.match(lobby, /<Link to="\/financier">Write an assignment letter<\/Link>/);
  assert.match(lobby, /target="_blank" rel="noopener"/);
});

test("the invoice is real; N and the blocks are left to the runtime", () => {
  assert.match(svg, />TES-INV-0003</);
  for (const p of ["rowN", "rowH", "vN", "v1", "v2", "tryN0", "tryN1"]) assert.match(svg, new RegExp(`data-part="${p}"></text>`), p);
  assert.doesNotMatch(svg, /56ed|4 509 299|4 509 521/);
});

test("the board copy gives TES-INV-0003's N, registered at 4 509 299 and again at 4 509 521", () => {
  const board = readFileSync(new URL(`../public${BOARD_COPY.url}`, import.meta.url), "utf8");
  // what jitsuin-wasm's boardMemoDescribe reads from a memo: after the "JTS1" header, the type byte
  // (1: register) and N, the next 32 bytes
  const describe = (memo: string) => {
    const b = Buffer.from(memo, "base64url");
    assert.equal(b.subarray(1, 5).toString(), "JTS1");
    return JSON.stringify({ kind: b[5] === 1 ? "Register" : "Settled", nullifier: b.subarray(6, 38).toString("hex") });
  };
  const t = twiceOf(board, describe, KIT.financierA.txid);
  assert.ok(t);
  assert.equal(t.n, "56edc4f5ed4b4fcd4db71ac55a209bc4d774dce26d4328713319412222508450");
  assert.deepEqual(t.heights, [4509299, 4509521]);
  assert.equal(nShort(t.n), "N 56ed…8450");
  assert.equal(blockText(t.heights[1]), "4 509 521");
  assert.equal(twiceOf(board, describe, "not-on-the-board"), null);
});
