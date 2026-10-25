// Chapter 4 figure, the second financier's counter (HNK-33.T4): the supplier already financed the
// hero's invoice TES-INV-0007 with financier A and now offers it to financier B. The offer slides
// out of an intake slot onto a tray; B's board reader scans it and looks its fingerprint N up on
// the public board at the back, where the same N is already registered under A's commitment. The
// 重 lamp on B's counter lights, a rolling shutter comes down over B's Zcash drawer (no money
// moves) and a small printer at the front prints Exhibit A: the supplier signed twice.
//
// Rebuild (only when the drawing changes; the output is committed):
//   node scripts/figures/second-counter.build.mjs
// It needs the anatomy skill kit (iso-kit.mjs, lathe.mjs): ANATOMY_KIT=/path/to/kit overrides
// the default ~/.claude/skills/anatomy/kit. The invoice and the board's earlier lines are real:
// TES-INV-0007 and the fingerprints of TES-INV-0004..0006 (board rows 4-6), from
// scripts/landing-keys.mjs and jitsuin-wasm (src/wasm).
//
// Output: src/landing/figures/second-counter.svg, static markup only. No <script>, no <style>, no
// inline style attributes (the site CSP has no 'unsafe-inline'): every colour comes from the
// .tc-* rules in src/landing/landing.css, which map the kit's --anatomy-* variables onto the
// DS-PAL tokens. The geometry the runtime needs (projection, wires, scan head, offsets) travels on
// the root as data-geometry; src/landing/figures/second-counter.ts reads it. What the chapter
// computes at runtime (N on the board, on the reader's screen and on Exhibit A; A's commitment) is
// left empty here and set by the runtime. Small English labels carry data-i18n="<key>" (aria
// labels: data-i18n-aria) so the chapter can set them per language.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT = process.env.ANATOMY_KIT ?? join(homedir(), ".claude/skills/anatomy/kit");
const k = await import(pathToFileURL(join(KIT, "iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "lathe.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "src", "landing", "figures", "second-counter.svg");
const WIDTH = 640, HEIGHT = 470;

// ---------- truth ----------
const keys = JSON.parse(execFileSync("node", [join(ROOT, "scripts", "landing-keys.mjs"), join(ROOT, "src", "wasm")], { encoding: "utf8" }));
const HERO = keys.hero; // must match INVOICE in src/landing/Twice.tsx
if (HERO.invoice_id !== "TES-INV-0007" || keys.heroN !== "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5") throw new Error("the hero invoice changed");
const short = (h) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const iso = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10);
// board rows 4, 5, 6 (TES-INV-0004..0006); the hero's invoice is row 7, as in chapter 2
const FIRST_ROW = 4;
const EARLIER = keys.boardRows.slice(3, 6).map((n) => `N ${short(n)}`);

// ---------- world (same base plate and camera as chapters 2 and 3) ----------
const BASE = { x: -150, y: -125, w: 300, d: 225, r: 10 };
const BASE_H = 12, FOOT_H = 5;

// intake (left): slot housing, tray, the offered invoice
const INBOX = { x: -142, y: 22, w: 22, d: 68, r: 1.5 };
const INBOX_H = 34, SLOT_X = INBOX.x + INBOX.w;
const TRAY = { x: -118, y: 28, w: 62, d: 56, r: 1.5 };
const TRAY_Z = 12, TRAY_TOP = 15;
const PAPER = { x: -114, y: 33, w: 52, d: 46, r: 0.6 };
const PAPER_T = 0.6;
const PAPER_REST = -36; // at rest the offer is half out of the slot

// board reader (middle) with its scanner arm over the tray
const RPL = { x: -42, y: 18, w: 40, d: 44, r: 2 };
const RB = { x: -40, y: 20, w: 36, d: 40, r: 2 };
const RB_Z0 = 4, RB_TOP = 32;
const COL = [-34, 52];
const ARM = { x: -88, y: 48, w: 58, d: 8, r: 1 };
const ARM_Z = 48, ARM_T = 4;
const HEAD = [-80, 52], HEAD_Z = 40, NOZ_Z = 37;
const SCREEN = { x0: -36, x1: -8, z0: 11, z1: 27 };

// public board (back left): the same open ledger as chapter 2, on a stand
const STAND = { x: -142, y: -118, w: 122, d: 76, r: 3 };
const VT = 16;
const BX = -164, BY = -6; // offset from the chapter 2 ledger
const COVER = { x: 28 + BX, y: -106 + BY, w: 112, d: 66, r: 2 };
const PAGE_L = { x: 32 + BX, y: -102 + BY, w: 52, d: 58, r: 0.4 };
const PAGE_R = { x: 84 + BX, y: -102 + BY, w: 52, d: 58, r: 0.4 };
const COVER_T = 1.6, PAGE_TOP = VT + 4;
const ROWS = Array.from({ length: 7 }, (_, i) => -91 + BY + i * 7);
const ROW_N = 3, ROW_A = 4; // the hero's line (board row 7) and A's commitment under it

// B's counter (right): kiosk, deep blue Zcash drawer, rolling shutter, 重 lamp
const KX0 = 50, KX1 = 136, KY0 = -64, KY1 = -8, KH = 62;
const CAB = { x: 60, y: -60, w: 66, d: 32, r: 2 };
const CAB_H = 22;
const DRAWER = { x: 68, y: -30, w: 50, d: 14, r: 1 };
const DR_Z0 = 8, DR_Z1 = 19;
const STACKS = [[76, 4.4], [87, 6.2], [98, 3.4], [109, 5.4]];
const CURT = { x0: 54, x1: 132, y: -6, z0: 0, z1: 52 };
const SHUT_OPEN = 47; // rolled up: only the bottom bar shows under the housing
const LAMP = { x: 93, y: -6, z: 78, r: 10, lens: 8.2 };

// printer (front) and its catch tray
const PR = { x: 16, y: 30, w: 36, d: 34, r: 3 };
const PR_H = 13;
const SLOT_Z = 8.4;
const CATCH = { x: 52, y: 34, w: 50, d: 28, r: 1 };
const SLIP = { x: 53, y: 36, w: 46, d: 24, r: 0.4 };
const SLIP_IN = -48;

// wires: reader -> board (lookup), reader -> counter (verdict)
const W1 = [[RB.x + RB.w, 28, 10], [2, 28, 0.6], [2, -66, 0.6], [-16, -66, 0.6], [STAND.x + STAND.w, -66, 5]];
const W2 = [[RB.x + RB.w, 46, 10], [8, 46, 0.6], [8, 4, 0.6], [46, 4, 1.4]];

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [LAMP.x, LAMP.y, LAMP.z + LAMP.r + 2], [KX1 + 2, KY0 - 2, KH + 4], [ARM.x, ARM.y, ARM_Z + ARM_T + 2]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const g = (cls, inner, extra = "") => `<g class="${cls}"${extra}>${inner}</g>`;
const path = (pts, close = true) => k.pathOf(pts.map(at), close);
const f1 = (v) => v.toFixed(1);
const camK = P.scale * Math.sqrt(1.6);
const move = ([dx, dy, dz]) => { const o = at([0, 0, 0]), m = at([dx, dy, dz]); return `translate(${(m[0] - o[0]).toFixed(2)} ${(m[1] - o[1]).toFixed(2)})`; };
const kj = (m, ch, size, cls = "kj") => `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
// small text in the drawing; `i18n` marks an English label the chapter translates
const tx = (m, s, size, { cls = "ui", anchor = "middle", i18n, extra = "" } = {}) =>
  `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="central"${i18n ? ` data-i18n="${i18n}"` : ""}${extra}>${s}</text>`;
const yFace = (x0, x1, y, z0, z1) => path([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const xFace = (x, y0, y1, z0, z1) => path([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
const hanko = (m, ch, r, rot) => `<g transform="${m} rotate(${rot})"><circle r="${r}" class="hanko-ring"/><circle r="${(r * 0.85).toFixed(2)}" class="hanko-ring thin"/><text class="kj hanko-k" font-size="${(r * 1.1).toFixed(2)}" text-anchor="middle" dominant-baseline="central">${ch}</text></g>`;

// ---------- base ----------
function base() {
  const o = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  const feet = k.corners(BASE, 20).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
  for (const [x, y] of feet) {
    o.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "mid" }));
    o.push(S(k.cylinder(x, y, 6, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  o.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(BASE, -4, P, 8), { tone: "faint" }) }));
  o.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 10);
  o.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  o.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55, tone: "hi" }));
  // ruler strip along the front edge
  const strip = { x: -128, y: 88, w: 256, d: 6, r: 1 };
  o.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  o.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  // label plate, front right
  const plate = { x: 104, y: 62, w: 34, d: 22, r: 1.5 };
  o.push(S(k.slabOf(plate, 0, 0.8, P, 3, 0.4), { tone: "mid" }));
  for (const [y, w] of [[68, 22], [73, 16], [78, 19]]) o.push(L(k.lineOnTop([plate.x + 5, y], [plate.x + 5 + w, y], 0.8, P), { tone: "lo", free: true }));
  o.push(D(k.corners(plate, 2.4).map(([x, y]) => at([x, y, 0.8])), { size: 0.45, tone: "hi" }));
  return o.join("");
}

// ---------- public board ----------
function board() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(STAND, 0, VT, P)}"/>`);
  const xF = STAND.x + STAND.w, yF = STAND.y + STAND.d;
  const inner = L(k.sideSeam(STAND, 4, P, 3) + k.sideSeam(STAND, VT - 3, P, 3), { tone: "faint" }) +
    // two drawers on the +y face
    `<path class="plate-face" d="${yFace(STAND.x + 10, STAND.x + 56, yF, 6.5, 10.5)}"/><path class="plate-face" d="${yFace(STAND.x + 66, STAND.x + 112, yF, 6.5, 10.5)}"/>`;
  o.push(g("m-stand", S(k.slabOf(STAND, 0, VT, P, 3, 0.8), { tone: "mid", inner })));
  o.push(D([[STAND.x + 33, yF, 8.5], [STAND.x + 89, yF, 8.5]].map(at), { size: 0.7, tone: "hi" }));
  o.push(D([[xF, STAND.y + 4, VT - 1.5], [xF, yF - 4, VT - 1.5], [xF, STAND.y + 4, 2], [xF, yF - 4, 2]].map(at), { size: 0.5, tone: "hi" }));
  // wire gland on the +x face
  o.push(g("m-stand", S(G.disc(0, 1.6, 2.4, G.frameAlong([xF, -66, 5], [1, 0, 0]), P), { tone: "mid" })));
  // ledger: cover, pages
  o.push(g("m-cover", S(k.slabOf(COVER, VT, COVER_T, P, 3, 0.4), { tone: "mid" })));
  for (const pg of [PAGE_L, PAGE_R]) {
    const pin = L(k.sideSeam(pg, VT + COVER_T + 0.8, P, 2) + k.sideSeam(pg, VT + COVER_T + 1.6, P, 2), { tone: "faint" });
    o.push(g("m-page", S(k.slabOf(pg, VT + COVER_T, PAGE_TOP - VT - COVER_T, P, 2), { tone: "mid", inner: pin })));
  }
  const z = PAGE_TOP;
  // highlight bands under the looked-up rows (hidden until the lookup)
  const band = (r) => path([[PAGE_L.x + 0.6, ROWS[r] - 5.6, z], [PAGE_R.x + PAGE_R.w - 0.6, ROWS[r] - 5.6, z], [PAGE_R.x + PAGE_R.w - 0.6, ROWS[r] + 0.4, z], [PAGE_L.x + 0.6, ROWS[r] + 0.4, z]]);
  o.push(`<path class="row-hl" data-part="hlN" d="${band(ROW_N)}"/>`);
  o.push(`<path class="row-hl soft" data-part="hlA" d="${band(ROW_A)}"/>`);
  // spine, margin rules, ruled lines (each runs edge to edge)
  const sx = PAGE_L.x + PAGE_L.w;
  o.push(L(k.lineOnTop([sx, PAGE_L.y], [sx, PAGE_L.y + PAGE_L.d], z, P), { tone: "mid" }));
  o.push(L(k.lineOnTop([PAGE_L.x + 7, PAGE_L.y], [PAGE_L.x + 7, PAGE_L.y + PAGE_L.d], z, P) + k.lineOnTop([PAGE_R.x + 32, PAGE_R.y], [PAGE_R.x + 32, PAGE_R.y + PAGE_R.d], z, P), { tone: "lo", className: "margin" }));
  o.push(L(ROWS.map((y) => k.lineOnTop([PAGE_L.x, y], [PAGE_L.x + PAGE_L.w, y], z, P) + k.lineOnTop([PAGE_R.x, y], [PAGE_R.x + PAGE_R.w, y], z, P)).join(""), { tone: "faint" }));
  const cl = PAGE_L.x + 10, cr = PAGE_R.x + 4;
  o.push(tx(k.topMatrix([cl, ROWS[0] - 8.4], z, P), "PUBLIC BOARD", 2.6, { cls: "ui board-head", anchor: "start", i18n: "fp.fig.board" }));
  o.push(tx(k.topMatrix([cr, ROWS[0] - 8.4], z, P), "STATUS", 2.6, { cls: "ui board-head", anchor: "start", i18n: "tw.fig.status" }));
  // row numbers; A's line is the continuation of the hero's row, so it has none
  let no = FIRST_ROW;
  ROWS.forEach((y, i) => {
    if (i === ROW_A) return;
    o.push(tx(k.topMatrix([PAGE_L.x + 3.5, y - 2.6], z, P), String(no++), 2.4, { cls: `ui row-no${i === ROW_N ? " row-n" : ""}`, extra: i === ROW_N ? ' data-part="rowNo"' : "" }));
  });
  EARLIER.forEach((n, i) => {
    o.push(tx(k.topMatrix([cl, ROWS[i] - 2.6], z, P), n, 4.2, { cls: "ui entry-n old", anchor: "start" }));
    o.push(tx(k.topMatrix([cr, ROWS[i] - 2.6], z, P), "registered", 2.6, { cls: "ui entry-h", anchor: "start", i18n: "tw.fig.registered" }));
  });
  // the hero's line: its N, registered (A's entry), and A's commitment under it; inked at runtime
  o.push(`<g class="entry-row" data-part="rowN">` +
    tx(k.topMatrix([cl, ROWS[ROW_N] - 2.6], z, P), "", 4.2, { cls: "ui entry-n red", anchor: "start", extra: ' data-n=""' }) +
    tx(k.topMatrix([cr, ROWS[ROW_N] - 2.6], z, P), "registered", 2.6, { cls: "ui entry-reg", anchor: "start", i18n: "tw.fig.registered" }) + `</g>`);
  o.push(`<g class="entry-row" data-part="rowA">` +
    tx(k.topMatrix([cl, ROWS[ROW_A] - 2.6], z, P), "financier A", 3, { cls: "ui entry-a", anchor: "start", i18n: "tw.fig.financierA" }) +
    `<text class="ui entry-h" transform="${k.topMatrix([cr, ROWS[ROW_A] - 2.6], z, P)}" font-size="2.6" text-anchor="start" dominant-baseline="central"><tspan data-i18n="tw.fig.commitment">commitment</tspan> <tspan class="entry-c" data-c=""></tspan></text>` + `</g>`);
  // ribbon bookmark over the near edge of the right page
  const rx = PAGE_R.x + 44, ny = PAGE_R.y + PAGE_R.d;
  o.push(`<path class="ribbon" d="${path([[rx, ny - 20, z], [rx + 2, ny - 20, z], [rx + 2, ny, z], [rx + 2, ny + 0.2, VT + 0.6], [rx + 2, ny + 3.6, VT + COVER_T], [rx, ny + 3.6, VT + COVER_T], [rx, ny + 0.2, VT + 0.6], [rx, ny, z]])}"/>`);
  return o.join("");
}

// ---------- B's counter ----------
function counter() {
  const o = [];
  const KD = KY1 - KY0;
  o.push(`<path class="iso-halo" d="${k.haloOf({ x: KX0, y: KY0, w: KX1 - KX0, d: KD, r: 2 }, 0, KH, P)}"/>`);
  // back and left walls (the left wall's inside face shows through the window)
  o.push(g("m-booth", S(k.slabOf({ x: KX0 + 4, y: KY0, w: KX1 - KX0 - 8, d: 4, r: 0.4 }, 0, KH, P, 2), { tone: "mid" })));
  o.push(g("m-booth", S(k.slabOf({ x: KX0, y: KY0, w: 4, d: KD, r: 0.6 }, 0, KH, P, 2), { tone: "mid", inner: L(k.sideSeam({ x: KX0, y: KY0, w: 4, d: KD, r: 0.6 }, 18, P, 2), { tone: "faint" }) })));
  // shade on the floor inside the booth
  o.push(`<path class="booth-shade" d="${k.planOutline({ x: KX0 + 4, y: KY0 + 4, w: KX1 - KX0 - 8, d: KD - 4, r: 0.4 }, 0, P, 2)}"/>`);
  // deep blue Zcash drawer cabinet
  const yC = CAB.y + CAB.d;
  const cabInner = L(k.sideSeam(CAB, 4, P, 3), { tone: "faint" }) +
    `<path class="v-plate" d="${yFace(CAB.x + 4, CAB.x + 12, yC, 9, 17)}"/>`;
  o.push(g("m-vault", S(k.slabOf(CAB, 0, CAB_H, P, 3, 0.8), { tone: "hi", inner: cabInner })));
  o.push(g("m-vault", D(k.corners(CAB, 3).map(([x, y]) => at([x, y, CAB_H])), { size: 0.5, tone: "hi" })));
  o.push(kj(k.sideMatrix([CAB.x + 8, yC], 13, P, "left"), "ZEC", 2.4, "ui v-label"));
  // the drawer, pulled out, with coin stacks
  o.push(g("m-vault", S(k.slabOf(DRAWER, DR_Z0, DR_Z1 - DR_Z0, P, 2, 0.3), { tone: "hi" })));
  const well = k.insetPlan({ ...DRAWER, d: DRAWER.d - 2 }, 1.6);
  const wellD = k.planOutline(well, DR_Z1, P, 2);
  o.push(`<clipPath id="tc-drawer"><path d="${wellD}"/></clipPath><path class="hop-wall" d="${wellD}"/><g clip-path="url(#tc-drawer)"><path class="hop-deep" d="${k.planOutline(well, DR_Z1 - 6, P, 2)}"/></g>`);
  for (const [x, h] of STACKS) {
    const z0 = DR_Z1 - 5, y = DRAWER.y + 7;
    o.push(g("m-coin", S(k.cylinder(x, y, 3.6, z0, h, P, 28), { tone: "hi", inner: L(Array.from({ length: Math.floor(h / 1.2) }, (_, i) => k.sideArc(x, y, 3.6, z0 + 1.2 * (i + 1), P, 24)).join(""), { tone: "faint" }) })));
    o.push(L(k.ring(x, y, 2.2, z0 + h, P, 20), { tone: "mid", className: "coin-ring" }));
  }
  const yD = DRAWER.y + DRAWER.d;
  o.push(g("m-vault", S(k.slabOf({ x: DRAWER.x, y: yD - 2, w: DRAWER.w, d: 2, r: 0.3 }, DR_Z0, DR_Z1 - DR_Z0, P, 2), { tone: "hi" })));
  o.push(g("m-vault", S(k.slabOf({ x: DRAWER.x + DRAWER.w / 2 - 6, y: yD, w: 12, d: 1.6, r: 0.5 }, 12, 2, P, 2), { tone: "hi" })));
  // right wall, outside face with B's plate
  const RW = { x: KX1 - 4, y: KY0, w: 4, d: KD, r: 0.6 };
  const rwInner = L(k.sideSeam(RW, 18, P, 2), { tone: "faint" }) +
    L(k.rise([KX1, -36 - 18, 0], 18, KH, P) + k.rise([KX1, -36 + 18, 0], 18, KH, P), { tone: "faint" }) +
    `<path class="plate-face" d="${xFace(KX1, -60, -48, 4, 14)}"/>` +
    L(Array.from({ length: 4 }, (_, i) => xFace(KX1, -28 + i * 4, -26.4 + i * 4, 6, 13)).join(""), { tone: "lo" }) +
    `<path class="plate-face" d="${xFace(KX1, -50, -22, 28, 38)}"/>` +
    tx(k.sideMatrix([KX1, -36], 30.6, P, "right"), "FINANCIER", 1.9, { cls: "ui plate-text", i18n: "tw.fig.financier" }) +
    tx(k.sideMatrix([KX1, -36], 35, P, "right"), "B", 4.6, { cls: "ui plate-b" });
  o.push(g("m-booth", S(k.slabOf(RW, 0, KH, P, 2), { tone: "mid", inner: rwInner })));
  o.push(D([[KX1, -48, 36.4], [KX1, -24, 36.4], [KX1, -48, 29.6], [KX1, -24, 29.6], [KX1, -59, 5], [KX1, -49, 5], [KX1, -59, 13], [KX1, -49, 13]].map(at), { size: 0.4, tone: "hi" }));
  o.push(g("m-booth", S(k.slabOf({ x: KX1, y: -56, w: 1.2, d: 4, r: 0.3 }, 8.4, 1.4, P, 2), { tone: "mid" })));
  return o.join("");
}
function curtain() {
  const { x0, x1, y, z0, z1 } = CURT;
  const clip = path([[x0 - 2, y, z0], [x1 + 2, y, z0], [x1 + 2, y, z1], [x0 - 2, y, z1]]);
  const slats = [];
  for (let z = 3 + 3.2; z < z1; z += 3.2) slats.push(k.segment([x0, y, z], [x1, y, z], P));
  const face = `<path class="curtain" d="${yFace(x0, x1, y, z0, z1)}"/>`;
  const bar = g("m-cover", S(k.slabOf({ x: x0, y: y - 1.2, w: x1 - x0, d: 2.4, r: 0.4 }, 0, 3, P, 2), { tone: "mid" }));
  const handle = g("m-cover", S(k.slabOf({ x: (x0 + x1) / 2 - 5, y: y + 1.2, w: 10, d: 1.2, r: 0.4 }, 0.8, 1.4, P, 2), { tone: "mid" }));
  const cur = `<g data-part="curtain" transform="${move([0, 0, SHUT_OPEN])}">${face}${L(slats.join(""), { tone: "lo", className: "slats" })}${bar}${handle}</g>`;
  return `<clipPath id="tc-window"><path d="${clip}"/></clipPath><g clip-path="url(#tc-window)">${cur}</g>`;
}
function boothFront() {
  const o = [];
  // guide channels the shutter runs in
  for (const x of [KX0, KX1 - 5]) {
    const gd = { x, y: KY1, w: 5, d: 4, r: 0.4 };
    o.push(g("m-booth", S(k.slabOf(gd, 0, CURT.z1, P, 2), { tone: "mid", inner: L(k.rise([x + 2.5, KY1 + 4, 0], 0, CURT.z1, P), { tone: "faint" }) })));
    o.push(D([[x + 2.5, KY1 + 4, 8], [x + 2.5, KY1 + 4, 26], [x + 2.5, KY1 + 4, 44]].map(at), { size: 0.4, tone: "hi" }));
  }
  // roller housing
  const HS = { x: KX0 - 1, y: KY1 - 3, w: KX1 - KX0 + 2, d: 9, r: 1.5 };
  o.push(g("m-booth", S(k.slabOf(HS, CURT.z1, KH - CURT.z1, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(HS, CURT.z1 + 2, P, 3), { tone: "faint" }) })));
  o.push(D([[KX0 + 3, HS.y + HS.d, KH - 3], [KX1 - 3, HS.y + HS.d, KH - 3]].map(at), { size: 0.45, tone: "hi" }));
  // roof
  const RF = { x: KX0 - 3, y: KY0 - 3, w: KX1 - KX0 + 6, d: KY1 - KY0 + 12, r: 2 };
  o.push(g("m-booth", S(k.slabOf(RF, KH, 3, P, 3, 0.6), { tone: "mid" })));
  o.push(g("m-booth", L(k.planOutline(k.insetPlan(RF, 3), KH + 3, P, 3), { tone: "faint" }) + D(k.corners(RF, 3).map(([x, y]) => at([x, y, KH + 3])), { size: 0.5, tone: "hi" })));
  const RP = { x: KX0 + 30, y: KY0 + 10, w: 44, d: 30, r: 1.5 };
  o.push(g("m-booth", S(k.slabOf(RP, KH + 3, 1, P, 2, 0.3), { tone: "mid" }) + L(k.planOutline(k.insetPlan(RP, 2.5), KH + 4, P, 2), { tone: "faint" })));
  o.push(g("m-booth", D(k.corners(RP, 1.4).map(([x, y]) => at([x, y, KH + 4])), { size: 0.45, tone: "hi" })));
  for (const [x, y] of [[KX0 + 10, KY0 + 12], [KX1 - 10, KY0 + 12], [KX1 - 10, KY1 - 4]]) o.push(g("m-booth", S(k.cylinder(x, y, 2.2, KH + 3, 1.1, P, 16, 0.3), { tone: "mid" })));
  // the 重 lamp: post, bezel, lens; glow and lens colour switch with .on
  o.push(g("m-booth", S(k.cylinder(LAMP.x, LAMP.y + 1.2, 3.2, KH + 3, 1.2, P, 20), { tone: "mid" }) + S(k.cylinder(LAMP.x, LAMP.y + 1.2, 1.6, KH + 4.2, LAMP.z - LAMP.r - KH - 3.8, P, 14), { tone: "mid", crease: "none" })));
  const F = G.frameAlong([LAMP.x, LAMP.y, LAMP.z], [0, 1, 0]);
  const sF = 2.4;
  const lamp = `<path class="lamp-glow" d="${G.circleOf(F, sF, LAMP.r + 3.4, P, 64)}"/>` +
    g("m-cover", S(G.disc(0, sF, LAMP.r, F, P), { tone: "mid" })) +
    `<path class="lamp-face" d="${G.circleOf(F, sF, LAMP.lens, P, 64)}"/>` +
    `<path class="lamp-shine" d="${path(Array.from({ length: 9 }, (_, i) => G.pointOf(F, sF, LAMP.lens - 0.5, (104 + i * 8) * Math.PI / 180)).concat(Array.from({ length: 9 }, (_, i) => G.pointOf(F, sF, LAMP.lens - 1.5, (168 - i * 8) * Math.PI / 180))))}"/>` +
    kj(k.sideMatrix([LAMP.x, LAMP.y + sF], LAMP.z, P, "left"), "重", 10.5, "kj lamp-k") +
    D([45, 135, 225, 315].map((a) => at(G.pointOf(F, sF, LAMP.r - 0.8, a * Math.PI / 180))), { size: 0.4, tone: "hi" });
  o.push(`<g class="lamp" data-part="lamp">${lamp}</g>`);
  // the deal tray in front of the window: where B's money would come out. It stays empty.
  const DT = { x: 70, y: -2, w: 46, d: 12, r: 2 };
  o.push(g("m-booth", S(k.slabOf(DT, 0, 2.2, P, 3, 0.4), { tone: "mid" })));
  o.push(`<path class="tray-well" d="${k.planOutline(k.insetPlan(DT, 2), 2.2, P, 3)}"/>`);
  // floor grommet where the verdict wire enters the counter
  o.push(g("m-booth", S(k.cylinder(W2[3][0], W2[3][1], 2.6, 0, 1.4, P, 18), { tone: "mid" })));
  return o.join("");
}

// ---------- intake ----------
function intake() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(INBOX, 0, INBOX_H, P)}"/>`);
  const inner = L(k.sideSeam(INBOX, 4, P, 3) + k.sideSeam(INBOX, INBOX_H - 4, P, 3), { tone: "faint" }) +
    `<path class="slot" d="${xFace(SLOT_X, PAPER.y - 2, PAPER.y + PAPER.d + 2, TRAY_TOP - 0.6, TRAY_TOP + 3.2)}"/>` +
    `<path class="plate-face" d="${xFace(SLOT_X, 40, 72, 23, 29)}"/>` +
    tx(k.sideMatrix([SLOT_X, 56], 26, P, "right"), "OFFERS IN", 2.2, { cls: "ui plate-text", i18n: "tw.fig.offers" });
  o.push(g("m-intake", S(k.slabOf(INBOX, 0, INBOX_H, P, 3, 0.8), { tone: "mid", inner })));
  o.push(D([[SLOT_X, INBOX.y + 4, 4], [SLOT_X, INBOX.y + INBOX.d - 4, 4], [SLOT_X, INBOX.y + 4, INBOX_H - 4], [SLOT_X, INBOX.y + INBOX.d - 4, INBOX_H - 4]].map(at), { size: 0.5, tone: "hi" }));
  // mail flap on top: where the supplier's offer drops in
  const flap = { x: INBOX.x + 5, y: INBOX.y + 10, w: 12, d: 48, r: 1 };
  o.push(g("m-intake", S(k.slabOf(flap, INBOX_H, 1, P, 2, 0.3), { tone: "mid" })));
  o.push(`<path class="slot" d="${k.planOutline(k.insetPlan(flap, 3), INBOX_H + 1, P, 2)}"/>`);
  return o.join("");
}
function trayBack() {
  const o = [];
  for (const x of [TRAY.x + 4, TRAY.x + TRAY.w - 9]) {
    const leg = { x, y: TRAY.y + 4, w: 5, d: TRAY.d - 8, r: 0.6 };
    o.push(g("m-tray", S(k.slabOf({ x: x - 1.5, y: leg.y - 1.5, w: 8, d: leg.d + 3, r: 0.6 }, 0, 1.4, P, 2, 0.3), { tone: "mid" })));
    o.push(g("m-tray", S(k.slabOf(leg, 1.4, TRAY_Z - 1.4, P, 2), { tone: "mid" })));
  }
  const inner = L(k.sideSeam(TRAY, TRAY_Z + 1.4, P, 3), { tone: "faint" });
  o.push(g("m-tray", S(k.slabOf(TRAY, TRAY_Z, TRAY_TOP - TRAY_Z, P, 3, 0.4), { tone: "mid", inner })));
  o.push(g("m-tray", D([[TRAY.x + TRAY.w - 2, TRAY.y + 4], [TRAY.x + TRAY.w - 2, TRAY.y + TRAY.d - 4]].map(([x, y]) => at([x, y, TRAY_TOP])), { size: 0.45, tone: "hi" })));
  // far guide (along x)
  o.push(g("m-tray", S(k.slabOf({ x: TRAY.x + 1, y: TRAY.y + 1, w: TRAY.w - 2, d: 3, r: 0.4 }, TRAY_TOP, 3.5, P, 2), { tone: "mid" })));
  // end stop the offer slides up to
  o.push(g("m-tray", S(k.slabOf({ x: TRAY.x + TRAY.w - 3.5, y: TRAY.y + 4, w: 2.5, d: TRAY.d - 8, r: 0.4 }, TRAY_TOP, 2.6, P, 2), { tone: "mid" })));
  return o.join("");
}
function trayFront() {
  const guide = { x: TRAY.x + 1, y: TRAY.y + TRAY.d - 4, w: TRAY.w - 2, d: 3, r: 0.4 };
  return g("m-tray", S(k.slabOf(guide, TRAY_TOP, 3.5, P, 2), { tone: "mid" }) +
    D([[guide.x + 4, guide.y + 1.5], [guide.x + guide.w - 4, guide.y + 1.5]].map(([x, y]) => at([x, y, TRAY_TOP + 3.5])), { size: 0.45, tone: "hi" }));
}
// the hero's invoice TES-INV-0007, as chapters 2 and 3 have it, with the buyer's seal
function invoice() {
  const z = TRAY_TOP + PAPER_T, x0 = PAPER.x + 4, x1 = PAPER.x + PAPER.w - 4, y0 = PAPER.y;
  const m = (x, y) => k.topMatrix([x, y], z, P);
  const o = [];
  o.push(g("m-sheet", S(k.slabOf(PAPER, TRAY_TOP, PAPER_T, P, 2), { tone: "mid", crease: "none" })));
  o.push(tx(m(x0, y0 + 6.5), "請求書", 5, { cls: "kj inv-title", anchor: "start" }));
  o.push(tx(m(x1, y0 + 6.5), HERO.invoice_id, 3, { cls: "ui inv-id", anchor: "end" }));
  o.push(L(k.lineOnTop([x0, y0 + 12], [x1, y0 + 12], z, P), { tone: "hi", free: true }));
  const rows = [
    ["Amount", "doc.amount", `${HERO.amount_zat.toLocaleString("en-US")} zat`, "inv-val", 3.6],
    ["Due", "doc.due", iso(HERO.due_date), "inv-val", 3.2],
    ["Terms", "doc.terms", short(HERO.terms_hash), "inv-val small", 2.8],
  ];
  rows.forEach(([label, key, val, cls, size], i) => {
    const y = y0 + 17 + i * 6;
    o.push(tx(m(x0, y), label, 2.4, { cls: "ui inv-label", anchor: "start", i18n: key }));
    o.push(tx(m(x1, y), val, size, { cls: `ui ${cls}`, anchor: "end" }));
  });
  for (const [y, w] of [[y0 + 36, 26], [y0 + 39.5, 20], [y0 + 43, 23]]) o.push(L(k.lineOnTop([x0, y], [x0 + w, y], z, P), { tone: "lo", free: true }));
  o.push(hanko(m(x1 - 5, y0 + 38.5), "買", 4.6, -6));
  return `<g class="paper" data-part="paper" transform="${move([PAPER_REST, 0, 0])}">${o.join("")}</g>`;
}

// ---------- board reader ----------
function readerBody() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(RPL, 0, RB_TOP, P)}"/>`);
  o.push(S(k.slabOf(RPL, 0, RB_Z0, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(RPL, 1.6, P, 3), { tone: "faint" }) }));
  const yF = RB.y + RB.d, xF = RB.x + RB.w;
  const sc = SCREEN;
  const inner = [
    L(k.sideSeam(RB, RB_TOP - 4, P, 3), { tone: "faint" }),
    `<path class="bezel" d="${yFace(sc.x0 - 1.5, sc.x1 + 1.5, yF, sc.z0 - 1.5, sc.z1 + 1.5)}"/>`,
    `<path class="screen" d="${yFace(sc.x0, sc.x1, yF, sc.z0, sc.z1)}"/>`,
    tx(k.sideMatrix([sc.x0 + 2, yF], sc.z1 - 3, P, "left"), "BOARD LOOKUP", 1.9, { cls: "ui scr-label", anchor: "start", i18n: "tw.fig.lookup" }),
    tx(k.sideMatrix([sc.x0 + 2, yF], sc.z1 - 8.2, P, "left"), "N ——", 3.2, { cls: "ui scr-n", anchor: "start", extra: ' data-part="scrN"' }),
    tx(k.sideMatrix([sc.x0 + 2, yF], sc.z0 + 2.8, P, "left"), "SEEN · A", 2.6, { cls: "ui scr-v", anchor: "start", i18n: "tw.fig.seen", extra: ' data-part="scrV"' }),
    // vents on the +x face
    L(Array.from({ length: 5 }, (_, i) => xFace(xF, 30 + i * 5, 32 + i * 5, 19, 27)).join(""), { tone: "lo" }),
  ].join("");
  o.push(g("m-reader", S(k.slabOf(RB, RB_Z0, RB_TOP - RB_Z0, P, 3, 1), { tone: "hi", inner })));
  o.push(D([[sc.x0 - 0.4, yF, sc.z0 - 0.4], [sc.x1 + 0.4, yF, sc.z0 - 0.4], [sc.x0 - 0.4, yF, sc.z1 + 0.4], [sc.x1 + 0.4, yF, sc.z1 + 0.4]].map(at), { size: 0.4, tone: "hi" }));
  o.push(D([[xF, RB.y + 3, 7], [xF, yF - 3, 7], [xF, RB.y + 3, RB_TOP - 2], [xF, yF - 3, RB_TOP - 2]].map(at), { size: 0.5, tone: "hi" }));
  // wire glands on the +x face
  for (const p of [W1[0], W2[0]]) o.push(g("m-reader", S(G.disc(0, 1.6, 2.6, G.frameAlong(p, [1, 0, 0]), P), { tone: "mid" })));
  // keypad on top
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    o.push(g("m-key", S(k.slabOf({ x: RB.x + 18 + c * 5, y: RB.y + 22 + r * 5, w: 3.6, d: 3.6, r: 0.5 }, RB_TOP, 0.9, P, 2, 0.2), { tone: "mid" })));
  }
  o.push(L(k.planOutline({ x: RB.x + 16.5, y: RB.y + 20.5, w: 17.6, d: 12.6, r: 1 }, RB_TOP, P, 2), { tone: "faint" }));
  return o.join("");
}
const beam = () => `<g class="beam-g" data-part="beam" opacity="0"><path class="beam"/><path class="scan"/></g>`;
function readerArm() {
  const o = [];
  const [cx, cy] = COL;
  o.push(g("m-reader", S(k.cylinder(cx, cy, 4.6, RB_TOP, 1.6, P, 24, 0.3), { tone: "mid" })));
  o.push(g("m-reader", S(k.cylinder(cx, cy, 2.6, RB_TOP + 1.6, ARM_Z - RB_TOP - 1.6, P, 20), { tone: "hi", inner: L(k.sideArc(cx, cy, 2.6, RB_TOP + 8, P, 18), { tone: "faint" }) })));
  // lens head hanging under the arm's far end: nozzle, body
  const [hx, hy] = HEAD;
  o.push(g("m-reader", S(k.cylinder(hx, hy, 3.6, NOZ_Z, HEAD_Z - NOZ_Z, P, 22), { tone: "mid" })));
  o.push(g("m-reader", S(k.cylinder(hx, hy, 6, HEAD_Z, ARM_Z - HEAD_Z, P, 30, 0.4), { tone: "hi", inner: L(k.sideArc(hx, hy, 6, HEAD_Z + 2.4, P, 24), { tone: "faint" }) })));
  // arm
  o.push(g("m-reader", S(k.slabOf(ARM, ARM_Z, ARM_T, P, 2, 0.5), { tone: "hi", inner: L(k.sideSeam(ARM, ARM_Z + 1.6, P, 2), { tone: "faint" }) })));
  o.push(D([[ARM.x + 3, ARM.y + 4], [ARM.x + ARM.w - 4, ARM.y + 4]].map(([x, y]) => at([x, y, ARM_Z + ARM_T])), { size: 0.45, tone: "hi" }));
  o.push(g("m-reader", S(k.cylinder(cx, cy, 3, ARM_Z + ARM_T, 1.2, P, 20, 0.3), { tone: "mid" })));
  // indicator on the head's front: lights while scanning
  const [lx, ly] = at([hx + 4.3, hy + 4.3, HEAD_Z + 4.6]);
  o.push(`<circle class="head-led" data-part="headLed" cx="${f1(lx)}" cy="${f1(ly)}" r="${(1.1 * camK).toFixed(2)}"/>`);
  return o.join("");
}

// ---------- wires ----------
function wire(pts, name) {
  const scr = pts.map(at);
  return `<g class="cable">${k.wireSvg(scr[0], scr[scr.length - 1], { via: scr.slice(1, -1), tone: "mid", size: 0.9 })}<circle class="pulse-halo" data-part="${name}Halo" r="3.4" opacity="0"/><circle class="pulse" data-part="${name}" r="1.6" opacity="0"/></g>`;
}

// ---------- printer ----------
function printer() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(PR, 0, PR_H, P)}"/>`);
  const xF = PR.x + PR.w, yF = PR.y + PR.d;
  const inner = [
    L(k.sideSeam(PR, 3, P, 3), { tone: "faint" }),
    `<path class="slot" d="${xFace(xF, SLIP.y - 1, SLIP.y + SLIP.d + 1, SLOT_Z - 0.2, SLOT_Z + 2)}"/>`,
    L(Array.from({ length: 4 }, (_, i) => yFace(PR.x + 6 + i * 5, PR.x + 8 + i * 5, yF, 4, 10)).join(""), { tone: "lo" }),
  ].join("");
  o.push(g("m-printer", S(k.slabOf(PR, 0, PR_H, P, 3, 0.8), { tone: "hi", inner })));
  o.push(D([[xF, PR.y + 3, 3], [xF, yF - 3, 3]].map(at), { size: 0.45, tone: "hi" }));
  // paper-roll lid with its hinge seam
  const LID = { x: PR.x + 2, y: PR.y + 2, w: 27, d: PR.d - 4, r: 2.5 };
  o.push(g("m-printer", S(k.slabOf(LID, PR_H, 3.4, P, 3, 0.8), { tone: "hi", inner: L(k.sideSeam(LID, PR_H + 1.2, P, 3), { tone: "faint" }) })));
  o.push(L(k.lineOnTop([LID.x + 6, LID.y], [LID.x + 6, LID.y + LID.d], PR_H + 3.4, P), { tone: "lo" }));
  // feed button and status lamp on the free strip of the top
  o.push(g("m-printer", S(k.cylinder(xF - 3.6, PR.y + 9, 1.9, PR_H, 1.1, P, 18, 0.2), { tone: "mid" })));
  const [lx, ly] = at([xF - 3.6, yF - 8, PR_H]);
  o.push(`<circle class="pled" data-part="pled" cx="${f1(lx)}" cy="${f1(ly)}" r="${(1.2 * camK).toFixed(2)}"/>`);
  // catch tray under the slot: two feet, plate, tear bar
  o.push(g("m-tray", S(k.slabOf({ x: CATCH.x + CATCH.w - 6, y: CATCH.y + 3, w: 4, d: CATCH.d - 6, r: 0.5 }, 0, SLOT_Z - 1.4, P, 2), { tone: "mid" })));
  o.push(g("m-tray", S(k.slabOf(CATCH, SLOT_Z - 1.4, 1.4, P, 2, 0.3), { tone: "mid" })));
  return o.join("");
}
function tearBar() {
  const xF = PR.x + PR.w;
  const bar = { x: xF, y: SLIP.y - 1.5, w: 1.6, d: SLIP.d + 3, r: 0.3 };
  return g("m-cover", S(k.slabOf(bar, SLOT_Z + 2.2, 1.4, P, 2), { tone: "mid" })) +
    L(Array.from({ length: 12 }, (_, i) => k.segment([xF + 1.6, bar.y + 1.6 + i * 2.2, SLOT_Z + 3.6], [xF + 1.6, bar.y + 2.7 + i * 2.2, SLOT_Z + 2.4], P)).join(""), { tone: "faint", free: true });
}
function slip() {
  const z = SLOT_Z + 0.5, x0 = SLIP.x + 3, x1 = SLIP.x + SLIP.w - 3, y0 = SLIP.y;
  const m = (x, y) => k.topMatrix([x, y], z, P);
  const o = [];
  o.push(g("m-sheet", S(k.slabOf(SLIP, SLOT_Z, 0.5, P, 2), { tone: "mid", crease: "none" })));
  o.push(tx(m(x0, y0 + 4.6), "EXHIBIT A", 3.8, { cls: "ui slip-title", anchor: "start", i18n: "tw.fig.exhibit" }));
  o.push(L(k.lineOnTop([x0, y0 + 8.2], [x1, y0 + 8.2], z, P), { tone: "hi", free: true }));
  o.push(tx(m(x0, y0 + 11.6), "double signature", 2.5, { cls: "ui slip-line", anchor: "start", i18n: "tw.fig.double" }));
  o.push(tx(m(x0, y0 + 15.6), "checked offline", 2.5, { cls: "ui slip-line", anchor: "start", i18n: "tw.fig.offline" }));
  o.push(tx(m(x0, y0 + 20.4), "", 2.2, { cls: "ui slip-n", anchor: "start", extra: ' data-n=""' }));
  // the supplier's seal, twice: once to A, once to B
  o.push(hanko(m(x1 - 9.5, y0 + 14.6), "売", 3.4, -8));
  o.push(hanko(m(x1 - 3.8, y0 + 16.4), "売", 3.4, 7));
  return `<g class="slip" data-part="slip" transform="${move([SLIP_IN, 0, 0])}">${o.join("")}</g>`;
}

// ---------- assemble ----------
const halfPlaneX = (x, z) => path([[x, -300, z], [400, -300, z], [400, 300, z], [x, 300, z]]);

const GEOMETRY = {
  P, w1: W1, w2: W2, head: [...HEAD, NOZ_Z],
  scan: { x0: PAPER.x + 3, x1: PAPER.x + PAPER.w - 3, y0: PAPER.y + 2, y1: PAPER.y + PAPER.d - 2, z: TRAY_TOP + PAPER_T },
  paperRest: PAPER_REST, shutOpen: SHUT_OPEN, slipIn: SLIP_IN,
};
const round = (v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
const geometry = JSON.stringify(GEOMETRY, (_, v) => round(v)).replace(/"/g, "&quot;");

const body = [
  `<defs><clipPath id="tc-slot"><path d="${halfPlaneX(SLOT_X, TRAY_TOP + PAPER_T)}"/></clipPath><clipPath id="tc-print"><path d="${halfPlaneX(PR.x + PR.w, SLOT_Z + 0.5)}"/></clipPath></defs>`,
  base(),
  board(),
  counter(), curtain(), boothFront(),
  intake(), trayBack(),
  `<g data-slot="offer" clip-path="url(#tc-slot)">${invoice()}</g>`,
  trayFront(),
  beam(),
  readerBody(), readerArm(),
  wire(W1, "pulse1"), wire(W2, "pulse2"),
  printer(),
  `<g data-slot="print" clip-path="url(#tc-print)">${slip()}</g>`,
  tearBar(),
].join("");

const LABEL = "A second financier’s counter. On the left an invoice, TES-INV-0007 with the buyer’s seal, slides out of an intake slot onto a tray. A board reader in the middle scans it and looks its fingerprint N up on the public board at the back, where the same N is already registered under financier A’s commitment. A round lamp marked 重 lights on financier B’s counter, a rolling shutter comes down over B’s Zcash drawer so no money leaves, and a small printer at the front prints Exhibit A: the supplier signed twice. Click it or press Enter to run it.";
const svg =
  `<!-- Generated by scripts/figures/second-counter.build.mjs; do not edit by hand. -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg tc-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="button" tabindex="0" aria-label="${LABEL}" data-i18n-aria="tw.fig.aria" data-geometry="${geometry}">${body}</svg>\n`;

for (const bad of [/<script/i, /<style/i, /\sstyle="/i]) if (bad.test(svg)) throw new Error(`second-counter.svg must not contain ${bad}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log("wrote", OUT, (svg.length / 1024).toFixed(1) + " KB");
