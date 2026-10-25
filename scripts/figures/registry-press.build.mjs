// Chapter 2 figure, the registry press (HNK-33.T3): the hero's invoice TES-INV-0007 lies in a feed
// tray in front of a press. Pulling the lever feeds it in, a hashing drum turns, the fingerprint N
// runs down a cable to a print carriage that stamps it on the next ruled line of the open public
// board, and the paper invoice drops into the shielded vault under the board. Only N is public.
//
// Rebuild (only when the drawing changes; the output is committed):
//   node scripts/figures/registry-press.build.mjs
// It needs the anatomy skill kit (iso-kit.mjs, lathe.mjs): ANATOMY_KIT=/path/to/kit overrides
// the default ~/.claude/skills/anatomy/kit. The board's earlier lines are the real fingerprints of
// TES-INV-0004..0006 (board rows 4-6), from scripts/landing-keys.mjs and jitsuin-wasm (src/wasm).
//
// Output: src/landing/figures/registry-press.svg, static markup only. No <script>, no <style>, no
// inline style attributes (the site CSP has no 'unsafe-inline'): every colour comes from the
// .rp-* rules in src/landing/landing.css, which map the kit's --anatomy-* variables onto the
// DS-PAL tokens. The geometry the runtime needs (projection, lever, drum, rows, paper moves, cable)
// travels on the root as data-geometry; src/landing/figures/registry-press.ts reads it. What
// changes at runtime (the amount and due date on the invoice, the lines the press prints) is left
// empty here and set by the runtime. Small English labels carry data-i18n="<key>" (aria labels:
// data-i18n-aria) so the chapter can set them per language.
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
const OUT = join(ROOT, "src", "landing", "figures", "registry-press.svg");
const WIDTH = 640, HEIGHT = 470;

// ---------- truth ----------
const keys = JSON.parse(execFileSync("node", [join(ROOT, "scripts", "landing-keys.mjs"), join(ROOT, "src", "wasm")], { encoding: "utf8" }));
const HERO = keys.hero; // must match BASE in src/landing/Fingerprint.tsx
if (HERO.invoice_id !== "TES-INV-0007" || keys.heroN !== "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5") throw new Error("the hero invoice changed");
const short = (h) => `${h.slice(0, 4)}…${h.slice(-4)}`;
// board rows 4, 5, 6 (TES-INV-0004..0006); the hero's invoice is row 7, the first line the press prints on
const FIRST_ROW = 4;
const EARLIER = keys.boardRows.slice(3, 6).map((n) => `N ${short(n)}`);

// ---------- world (same base plate and camera as chapter 3) ----------
const BASE = { x: -150, y: -125, w: 300, d: 225, r: 10 };
const BASE_H = 12, FOOT_H = 5;

// feed tray (in front of the press; the invoice feeds along -y into the press's front face)
const TRAY = { x: -66, y: 40, w: 62, d: 52, r: 1.5 };
const TRAY_Z = 12, TRAY_TOP = 15;
const BRIDGE = { x: -62, y: 32, w: 54, d: 8, r: 0.4 };
const PAPER = { x: -61, y: 43, w: 52, d: 46, r: 0.6 };
const FEED_Y = 32; // the press's front face: the mouth
const INSIDE_Y = -27; // where the sheet sits inside the press, lined up with the exit slot
const PAD = { x: -136, y: 46, w: 46, d: 40, r: 0.6 };
const PAPER_T = 0.6;

// press (centre)
const PLINTH = { x: -70, y: -44, w: 70, d: 80, r: 2 };
const PLINTH_H = 6;
const HOUSING = { x: -66, y: -40, w: 62, d: 72, r: 1.5 };
const HOUSING_TOP = 44;
const CHEEK_BACK = { x: -62, y: -36, w: 6, d: 64, r: 0.8 };
const CHEEK_FRONT = { x: -14, y: -36, w: 6, d: 64, r: 0.8 };
const CHEEK_TOP = 74;
const DRUM = { x0: -56, x1: -14, cy: -4, cz: 60, r: 13 };
const WHEEL = { x0: -8, x1: -5, cy: -4, cz: 60, r: 12 };
const LEVER = { x: -36, y: 37, z: 32, len: 30, rest: 60, down: -10, knob: 3.6 };
const EXIT_X = -4, EXIT_Z = 28;
const LIP = { x: -4, y: -30, w: 5, d: 52, r: 0.3 };

// shielded vault + public board (right)
const VAULT = { x: 4, y: -114, w: 140, d: 140, r: 6 };
const VT = 26;
const HOPPER = { x: 10, y: -31, w: 58, d: 52, r: 2 };
const COVER = { x: 28, y: -106, w: 112, d: 66, r: 2 };
const PAGE_L = { x: 32, y: -102, w: 52, d: 58, r: 0.4 };
const PAGE_R = { x: 84, y: -102, w: 52, d: 58, r: 0.4 };
const COVER_T = 1.6, PAGE_TOP = VT + 4;
const ROWS = Array.from({ length: 7 }, (_, i) => -91 + i * 7);
const NEW_ROWS = [3, 4, 5, 6];
const RAIL = { x: 14, y: -112, w: 6, d: 76, r: 0.6 };
const PARK = -106;
const STAMP = { x0: 41, x1: 81, d: 5, z0: PAGE_TOP + 8, h: 3 };
const ARM_Z = PAGE_TOP + 15; // arm bottom
const DROP = 7.6;
const WIRE = [[EXIT_X + 2, -34, 36], [3, -34, 33], [8, -36, VT + 0.6], [RAIL.x + 3, RAIL.y + RAIL.d - 1, VT + 6]];

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [-37, -36, CHEEK_TOP + 4], [-10, -36, CHEEK_TOP + 6], [LEVER.x + 16, LEVER.y, LEVER.z + 30]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const g = (cls, inner, extra = "") => `<g class="${cls}"${extra}>${inner}</g>`;
const path = (pts, close = true) => k.pathOf(pts.map(at), close);
const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const kj = (m, ch, size, cls = "kj") => `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
// small text in the drawing; `i18n` marks an English label the chapter translates
const tx = (m, s, size, { cls = "ui", anchor = "middle", i18n, extra = "" } = {}) =>
  `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="central"${i18n ? ` data-i18n="${i18n}"` : ""}${extra}>${s}</text>`;
const yFace = (x0, x1, y, z0, z1) => path([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const xFace = (x, y0, y1, z0, z1) => path([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);

// the rest pose of the moving parts, the same maths as the runtime (registry-press.ts)
const RAD = Math.PI / 180;
const camK = P.scale * Math.sqrt(1.6);
const pt = (p) => { const q = at(p); return `${f1(q[0])} ${f1(q[1])}`; };
function leverAt(deg) {
  const a = deg * RAD, p0 = [LEVER.x, LEVER.y, LEVER.z], p1 = [LEVER.x + LEVER.len * Math.cos(a), LEVER.y, LEVER.z + LEVER.len * Math.sin(a)];
  const d = `M${pt(p0)}L${pt(p1)}`, w = 2.4 * camK, e = at(p1), r = LEVER.knob * camK;
  return `<path class="lever-o" d="${d}" stroke-width="${f2(w + 1.2)}"/><path class="lever-c" d="${d}" stroke-width="${f2(w)}"/>` +
    `<circle class="lever-knob" cx="${f1(e[0])}" cy="${f1(e[1])}" r="${f2(r)}"/><circle class="lever-shine" cx="${f1(e[0] - r * 0.35)}" cy="${f1(e[1] - r * 0.4)}" r="${f2(r * 0.32)}"/>`;
}
const view = (() => { const a = (P.azimuth ?? 45) * RAD, e = (P.elevation ?? 30) * RAD; return [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)]; })();
const ribsAt = (phase) => Array.from({ length: 14 }, (_, i) => {
  const a = phase + (i / 14) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
  const face = cy * view[1] + sz * view[2];
  if (face < 0.04) return "<path/>";
  const y = DRUM.cy + DRUM.r * cy, z = DRUM.cz + DRUM.r * sz;
  return `<path d="M${pt([DRUM.x0 + 1, y, z])}L${pt([DRUM.x1 - 1, y, z])}" stroke-opacity="${Math.min(1, face * 1.8).toFixed(2)}"/>`;
}).join("");
const spokesAt = (phase) => Array.from({ length: 5 }, (_, i) => {
  const a = phase + (i / 5) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  return `M${pt([WHEEL.x1, WHEEL.cy + 3 * c, WHEEL.cz + 3 * s])}L${pt([WHEEL.x1, WHEEL.cy + (WHEEL.r - 2.4) * c, WHEEL.cz + (WHEEL.r - 2.4) * s])}`;
}).join("");
const crankAt = (phase) => at([WHEEL.x1 + 0.6, WHEEL.cy + (WHEEL.r - 1.2) * Math.cos(phase + 0.6), WHEEL.cz + (WHEEL.r - 1.2) * Math.sin(phase + 0.6)]);

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
  const strip = { x: 6, y: 88, w: 130, d: 6, r: 1 };
  o.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  o.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  // label plate, front right
  const plate = { x: 98, y: 50, w: 38, d: 28, r: 1.5 };
  o.push(S(k.slabOf(plate, 0, 0.8, P, 3, 0.4), { tone: "mid" }));
  for (const [y, w] of [[58, 26], [64, 20], [70, 23]]) o.push(L(k.lineOnTop([plate.x + 6, y], [plate.x + 6 + w, y], 0.8, P), { tone: "lo", free: true }));
  o.push(D(k.corners(plate, 2.6).map(([x, y]) => at([x, y, 0.8])), { size: 0.45, tone: "hi" }));
  // a pad of blank invoice forms, front left
  for (let i = 0; i < 5; i++) {
    const s = { ...PAD, x: PAD.x + [0, 1.2, -0.6, 0.8, 0][i], y: PAD.y + [0, -0.8, 0.6, 0.3, 0][i] };
    o.push(g("m-sheet", S(k.slabOf(s, i * 0.7, 0.7, P, 2), { tone: "mid", crease: "none" })));
  }
  const pz = 3.5, px = PAD.x + 4;
  o.push(tx(k.topMatrix([px, PAD.y + 6.5], pz, P), "請求書", 5, { cls: "kj pad-title", anchor: "start" }));
  o.push(L(k.lineOnTop([px, PAD.y + 12], [PAD.x + PAD.w - 4, PAD.y + 12], pz, P), { tone: "lo", free: true }));
  for (const y of [17, 23, 29]) o.push(L(k.lineOnTop([px, PAD.y + y], [PAD.x + PAD.w - 4, PAD.y + y], pz, P), { tone: "faint", free: true }));
  return o.join("");
}

// ---------- feed tray ----------
function trayBack() {
  const o = [];
  for (const y of [TRAY.y + 4, TRAY.y + TRAY.d - 9]) {
    const leg = { x: TRAY.x + 4, y, w: TRAY.w - 8, d: 5, r: 0.6 };
    o.push(g("m-tray", S(k.slabOf({ ...leg, x: leg.x - 1.5, y: y - 1.5, w: leg.w + 3, d: 8 }, 0, 1.4, P, 2, 0.3), { tone: "mid" })));
    o.push(g("m-tray", S(k.slabOf(leg, 1.4, TRAY_Z - 1.4, P, 2), { tone: "mid" })));
  }
  const inner = L(k.sideSeam(TRAY, TRAY_Z + 1.4, P, 3), { tone: "faint" }) +
    tx(k.sideMatrix([TRAY.x + 6, TRAY.y + TRAY.d], TRAY_Z + 1.6, P, "left"), "FEED", 1.9, { cls: "ui eng", anchor: "start", i18n: "fp.fig.feed" });
  o.push(g("m-tray", S(k.slabOf(TRAY, TRAY_Z, TRAY_TOP - TRAY_Z, P, 3, 0.4), { tone: "mid", inner })));
  o.push(g("m-tray", D([[TRAY.x + 4, TRAY.y + TRAY.d - 2], [TRAY.x + TRAY.w - 4, TRAY.y + TRAY.d - 2]].map(([x, y]) => at([x, y, TRAY_TOP])), { size: 0.45, tone: "hi" })));
  // left (far) guide
  o.push(g("m-tray", S(k.slabOf({ x: TRAY.x + 1, y: TRAY.y + 1, w: 3, d: TRAY.d - 2, r: 0.4 }, TRAY_TOP, 3.5, P, 2), { tone: "mid" })));
  // feed bridge into the press mouth
  o.push(g("m-tray", S(k.slabOf(BRIDGE, TRAY_TOP - 1.5, 1.5, P, 2), { tone: "mid", crease: "none" })));
  return o.join("");
}
function trayFront() {
  const guide = { x: TRAY.x + TRAY.w - 4, y: TRAY.y + 1, w: 3, d: TRAY.d - 2, r: 0.4 };
  return g("m-tray", S(k.slabOf(guide, TRAY_TOP, 3.5, P, 2), { tone: "mid" }) +
    D([[guide.x + 1.5, guide.y + 4], [guide.x + 1.5, guide.y + guide.d - 4]].map(([x, y]) => at([x, y, TRAY_TOP + 3.5])), { size: 0.45, tone: "hi" }));
}

// ---------- invoice (TES-INV-0007; the amount and the due date are set at runtime) ----------
function invoice() {
  const z = TRAY_TOP + PAPER_T, x0 = PAPER.x + 4, x1 = PAPER.x + PAPER.w - 4, y0 = PAPER.y;
  const m = (x, y) => k.topMatrix([x, y], z, P);
  const o = [];
  o.push(g("m-sheet", S(k.slabOf(PAPER, TRAY_TOP, PAPER_T, P, 2), { tone: "mid", crease: "none" })));
  o.push(tx(m(x0, y0 + 6.5), "請求書", 5, { cls: "kj inv-title", anchor: "start" }));
  o.push(tx(m(x1, y0 + 6.5), HERO.invoice_id, 3, { cls: "ui inv-id", anchor: "end" }));
  o.push(L(k.lineOnTop([x0, y0 + 12], [x1, y0 + 12], z, P), { tone: "hi", free: true }));
  const rows = [
    ["Amount", "doc.amount", `<tspan data-amount=""></tspan> zat`, "inv-val", 3.6],
    ["Due", "doc.due", `<tspan data-due=""></tspan>`, "inv-val", 3.2],
    ["Terms", "doc.terms", short(HERO.terms_hash), "inv-val small", 2.8],
  ];
  rows.forEach(([label, key, val, cls, size], i) => {
    const y = y0 + 17 + i * 6;
    o.push(tx(m(x0, y), label, 2.4, { cls: "ui inv-label", anchor: "start", i18n: key }));
    o.push(tx(m(x1, y), val, size, { cls: `ui ${cls}`, anchor: "end" }));
  });
  for (const [y, w] of [[y0 + 36, 26], [y0 + 39.5, 20], [y0 + 43, 23]]) o.push(L(k.lineOnTop([x0, y], [x0 + w, y], z, P), { tone: "lo", free: true }));
  // the supplier's hanko
  const hm = m(x1 - 5, y0 + 38.5);
  o.push(`<g transform="${hm} rotate(-6)"><circle r="4.6" class="hanko-ring"/><circle r="3.9" class="hanko-ring thin"/><text class="kj hanko-k" font-size="5" text-anchor="middle" dominant-baseline="central">印</text></g>`);
  return `<g class="paper" data-part="paper">${o.join("")}</g>`;
}

// ---------- press ----------
function pressBody() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, 0, PLINTH_H, P)}"/>`);
  o.push(S(k.slabOf(PLINTH, 0, PLINTH_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(PLINTH, 2, P, 4), { tone: "faint" }) }));
  o.push(D(k.corners(PLINTH, 3).map(([x, y]) => at([x, y, PLINTH_H])), { size: 0.5, tone: "hi" }));
  const H = HOUSING, yF = H.y + H.d, xF = H.x + H.w;
  const inner = [
    L(k.sideSeam(H, HOUSING_TOP - 4, P, 3) + k.sideSeam(H, PLINTH_H + 4, P, 3), { tone: "faint" }),
    // exit slot on the +x face
    `<path class="slot" d="${xFace(xF, -28, 20, EXIT_Z - 0.4, EXIT_Z + 3)}"/>`,
    // feed mouth on the +y face
    `<path class="slot" d="${yFace(PAPER.x - 1.5, PAPER.x + PAPER.w + 1.5, yF, TRAY_TOP - 0.8, TRAY_TOP + 3)}"/>`,
    // nameplate on the +y face, up left
    `<path class="plate-face" d="${yFace(-64, -43, yF, 34, 40)}"/>`,
    tx(k.sideMatrix([-53.5, yF], 37, P, "left"), "REGISTRY PRESS", 1.9, { cls: "ui plate-text", i18n: "fp.fig.press" }),
    // travel ticks round the lever pivot
    L(Array.from({ length: 8 }, (_, i) => {
      const a = (LEVER.down + ((LEVER.rest - LEVER.down) * i) / 7) * RAD;
      const r0 = 9.5, r1 = i % 7 === 0 ? 13 : 11.5;
      return k.segment([LEVER.x + r0 * Math.cos(a), yF, LEVER.z + r0 * Math.sin(a)], [LEVER.x + r1 * Math.cos(a), yF, LEVER.z + r1 * Math.sin(a)], P);
    }).join(""), { tone: "mid", free: true }),
  ].join("");
  o.push(g("m-press", S(k.slabOf(H, PLINTH_H, HOUSING_TOP - PLINTH_H, P, 3, 1), { tone: "hi", inner })));
  o.push(D([[-62.8, yF, 35.2], [-44.2, yF, 35.2], [-62.8, yF, 38.8], [-44.2, yF, 38.8]].map(at), { size: 0.4, tone: "hi" }));
  o.push(D([[xF, -36, 10], [xF, 28, 10], [xF, -36, 38], [xF, 28, 38], [-62, yF, 10], [-8, yF, 10], [-62, yF, 38], [-8, yF, 38]].map(at), { size: 0.5, tone: "hi" }));
  // delivery lip under the exit slot
  o.push(g("m-press", S(k.slabOf(LIP, EXIT_Z - 2, 1.6, P, 2), { tone: "mid" })));
  // cable gland on the +x face
  o.push(g("m-press", S(G.disc(0, 2, 2.6, G.frameAlong([xF, -34, 36], [1, 0, 0]), P), { tone: "mid" })));
  return o.join("");
}
function pressHead() {
  const o = [];
  o.push(g("m-press", S(k.slabOf(CHEEK_BACK, HOUSING_TOP, CHEEK_TOP - HOUSING_TOP, P, 2, 0.6), { tone: "mid" })));
  // tie bar along the back
  o.push(g("m-press", S(k.slabOf({ x: -56, y: -36, w: 42, d: 5, r: 0.5 }, CHEEK_TOP - 5, 4, P, 2), { tone: "mid" })));
  // hashing drum, axis along x; its ribs turn at runtime
  const F = G.frameAlong([DRUM.x0, DRUM.cy, DRUM.cz], [1, 0, 0]);
  const len = DRUM.x1 - DRUM.x0;
  o.push(g("m-drum", S(G.disc(0, len, DRUM.r, F, P), { tone: "hi", crease: "faint" }) +
    `<g class="ribs" data-part="ribs">${ribsAt(0)}</g>` +
    L(G.arcOf(F, 6, DRUM.r, P) + G.arcOf(F, len - 6, DRUM.r, P), { tone: "mid" })));
  // front cheek (nearer), with the lamp on top
  const CF = CHEEK_FRONT;
  o.push(g("m-press", S(k.slabOf(CF, HOUSING_TOP, CHEEK_TOP - HOUSING_TOP, P, 2, 0.6), { tone: "mid", inner: L(k.sideSeam(CF, HOUSING_TOP + 4, P, 2), { tone: "faint" }) })));
  o.push(D([[CF.x + 3, CF.y + 3], [CF.x + 3, CF.y + CF.d - 3]].map(([x, y]) => at([x, y, CHEEK_TOP])), { size: 0.45, tone: "hi" }));
  o.push(g("m-press", S(k.cylinder(-11, 18, 2.6, CHEEK_TOP, 1.6, P, 20), { tone: "mid" })));
  const [lx, ly] = at([-11, 18, CHEEK_TOP + 3.4]);
  o.push(`<circle class="lamp" data-part="lamp" cx="${f1(lx)}" cy="${f1(ly)}" r="${f2(2.1 * camK)}"/>`);
  // flywheel on the drum axle, outside the +x cheek; spokes turn at runtime
  const W = G.frameAlong([WHEEL.x0, WHEEL.cy, WHEEL.cz], [1, 0, 0]);
  const [cx, cy] = crankAt(0);
  o.push(g("m-press", S(G.disc(-1, 0, 3.2, W, P), { tone: "mid" })));
  o.push(g("m-wheel", S(G.ringBand(0, WHEEL.x1 - WHEEL.x0, WHEEL.r - 2.4, WHEEL.r, W, P), { tone: "hi" }) +
    `<path class="spokes" data-part="spokes" d="${spokesAt(0)}"/>` +
    S(G.disc(0, 4.2, 3, W, P), { tone: "hi" }) +
    `<circle class="crank" data-part="crank" cx="${f1(cx)}" cy="${f1(cy)}" r="${f2(1.8 * camK)}"/>`));
  return o.join("");
}
function lever() {
  const F = G.frameAlong([LEVER.x, HOUSING.y + HOUSING.d, LEVER.z], [0, 1, 0]);
  const boss = g("m-press", S(G.disc(0, 3, 4.6, F, P), { tone: "mid" }) + S(G.disc(3, 5, 2.4, F, P), { tone: "hi" }));
  // hit area: the sector the handle sweeps
  const R = LEVER.len + 6, pts = [[LEVER.x, LEVER.y, LEVER.z]];
  for (let a = LEVER.down - 8; a <= LEVER.rest + 8; a += 6) pts.push([LEVER.x + R * Math.cos(a * RAD), LEVER.y, LEVER.z + R * Math.sin(a * RAD)]);
  const hit = `<path class="hit" d="${path(pts)}"/>`;
  return boss + `<g class="lever" data-part="lever" tabindex="0" role="button" aria-label="Pull the lever (P)" data-i18n-aria="fp.fig.lever">${hit}${leverAt(LEVER.rest)}</g>`;
}

// ---------- shielded vault ----------
function vault() {
  const o = [];
  const yF = VAULT.y + VAULT.d, xF = VAULT.x + VAULT.w;
  const win = { x0: 16, x1: 40, z0: 5, z1: 19 };
  const inner = [
    L(k.sideSeam(VAULT, 4, P, 6) + k.sideSeam(VAULT, VT - 4, P, 6), { tone: "faint" }),
    `<path class="v-glass" d="${yFace(win.x0, win.x1, yF, win.z0, win.z1)}"/>`,
    `<g class="v-sheets">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path class="v-sheet${i < 2 ? " on" : ""}" data-sheet="${i}" d="${k.segment([win.x0 + 1.4, yF, win.z0 + 1.6 + i * 1.5], [win.x1 - 1.4, yF, win.z0 + 1.6 + i * 1.5], P)}"/>`).join("")}</g>`,
    `<path class="v-plate" d="${yFace(52, 108, yF, 9, 17)}"/>`,
    tx(k.sideMatrix([80, yF], 13, P, "left"), "SHIELDED VAULT", 3.2, { cls: "ui v-label", i18n: "fp.fig.vault" }),
    // vents on the +x face
    L(Array.from({ length: 5 }, (_, i) => xFace(xF, -96 + i * 6, -92 + i * 6, 7, 19)).join(""), { tone: "lo" }),
  ].join("");
  o.push(g("m-vault", S(k.slabOf(VAULT, 0, VT, P, 6, 1.2), { tone: "hi", inner })));
  o.push(g("m-vault", D([[54, yF, 11], [106, yF, 11], [54, yF, 15], [106, yF, 15]].map(at), { size: 0.45, tone: "hi" }) +
    D([[xF, -104, VT - 2], [xF, -60, VT - 2], [xF, -16, VT - 2], [xF, 18, VT - 2], [xF, -104, 2], [xF, 18, 2]].map(at), { size: 0.5, tone: "hi" })));
  // hinges on the +x face
  for (const y of [-40, 4]) o.push(g("m-vault", S(k.cylinder(xF + 1.2, y, 1.6, 5, 16, P, 16), { tone: "mid" }) + S(k.cylinder(xF + 1.2, y, 1.9, 12, 2, P, 16), { tone: "mid" })));
  // combination dial on the front face
  const Fd = G.frameAlong([126, yF, 13], [0, 1, 0]);
  o.push(g("m-vault", S(G.disc(0, 1.2, 6.4, Fd, P), { tone: "mid" }) + S(G.disc(1.2, 3.6, 4.4, Fd, P), { tone: "hi" }) +
    L(G.circleOf(Fd, 3.6, 3, P), { tone: "lo" })));
  o.push(L(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return k.segment([126 + 5.2 * Math.cos(a), yF + 1.2, 13 + 5.2 * Math.sin(a)], [126 + 6.2 * Math.cos(a), yF + 1.2, 13 + 6.2 * Math.sin(a)], P); }).join(""), { tone: "lo", free: true }));
  // top: inset groove, corner screws
  o.push(g("m-vault", L(k.planOutline(k.insetPlan(VAULT, 3.5), VT, P, 6), { tone: "faint" }) + D(k.corners(VAULT, 3.5).map(([x, y]) => at([x, y, VT])), { size: 0.55, tone: "hi" })));
  // raised maker's plate and bolt heads on the free part of the top
  const vp = { x: 92, y: -24, w: 40, d: 22, r: 1 };
  o.push(g("m-vault", S(k.slabOf(vp, VT, 1, P, 2, 0.3), { tone: "mid" })));
  o.push(kj(k.topMatrix([vp.x + vp.w / 2, vp.y + vp.d / 2], VT + 1, P), "金庫", 9, "kj v-kanji"));
  o.push(g("m-vault", D(k.corners(vp, 2.4).map(([x, y]) => at([x, y, VT + 1])), { size: 0.45, tone: "hi" })));
  for (const [x, y] of [[80, -30], [80, 16], [138, -30], [138, 16]]) o.push(g("m-vault", S(k.cylinder(x, y, 2.4, VT, 1.2, P, 18, 0.3), { tone: "mid" })));
  // hopper: opening with its walls; the sinking invoice is clipped to it
  const openD = k.planOutline(HOPPER, VT, P, 4);
  o.push(`<clipPath id="rp-hopper"><path d="${openD}"/></clipPath>`);
  o.push(`<path class="hop-wall" d="${openD}"/>`);
  o.push(`<g clip-path="url(#rp-hopper)"><path class="hop-deep" d="${k.planOutline(HOPPER, VT - 16, P, 4)}"/></g>`);
  o.push(`<g data-slot="in" clip-path="url(#rp-hopper)"></g>`);
  o.push(g("m-vault", L(k.planOutline(k.insetPlan(HOPPER, -2.4), VT, P, 4), { tone: "mid" }) +
    D(k.corners(k.insetPlan(HOPPER, -1.2), 0).map(([x, y]) => at([x, y, VT])), { size: 0.45, tone: "hi" })));
  return o.join("");
}

// ---------- public board (a ledger book) ----------
function ledger() {
  const o = [];
  o.push(g("m-cover", S(k.slabOf(COVER, VT, COVER_T, P, 3, 0.4), { tone: "mid" })));
  for (const pg of [PAGE_L, PAGE_R]) {
    const inner = L(k.sideSeam(pg, VT + COVER_T + 0.8, P, 2) + k.sideSeam(pg, VT + COVER_T + 1.6, P, 2), { tone: "faint" });
    o.push(g("m-page", S(k.slabOf(pg, VT + COVER_T, PAGE_TOP - VT - COVER_T, P, 2), { tone: "mid", inner })));
  }
  const z = PAGE_TOP;
  // spine, margin rules, ruled lines (each runs edge to edge)
  o.push(L(k.lineOnTop([84, PAGE_L.y], [84, PAGE_L.y + PAGE_L.d], z, P), { tone: "mid" }));
  o.push(L(k.lineOnTop([39, PAGE_L.y], [39, PAGE_L.y + PAGE_L.d], z, P) + k.lineOnTop([116, PAGE_R.y], [116, PAGE_R.y + PAGE_R.d], z, P), { tone: "lo", className: "margin" }));
  o.push(L(ROWS.map((y) => k.lineOnTop([PAGE_L.x, y], [PAGE_L.x + PAGE_L.w, y], z, P) + k.lineOnTop([PAGE_R.x, y], [PAGE_R.x + PAGE_R.w, y], z, P)).join(""), { tone: "faint" }));
  o.push(tx(k.topMatrix([42, ROWS[0] - 8.4], z, P), "PUBLIC BOARD", 2.6, { cls: "ui board-head", anchor: "start", i18n: "fp.fig.board" }));
  ROWS.forEach((y, i) => o.push(tx(k.topMatrix([35.5, y - 2.6], z, P), String(FIRST_ROW + i), 2.4, { cls: "ui row-no" })));
  EARLIER.forEach((n, i) => o.push(tx(k.topMatrix([42, ROWS[i] - 2.6], z, P), n, 4.2, { cls: "ui entry-n old", anchor: "start" })));
  // empty lines the press prints on
  NEW_ROWS.forEach((r) => o.push(`<g class="entry" data-row="${r}">` + tx(k.topMatrix([42, ROWS[r] - 2.6], z, P), "", 4.2, { cls: "ui entry-n", anchor: "start", extra: ' data-n=""' }) + `</g>`));
  // ribbon bookmark over the near edge of the right page
  const rx = 128;
  o.push(`<path class="ribbon" d="${path([[rx, -60, z], [rx + 2, -60, z], [rx + 2, PAGE_R.y + PAGE_R.d, z], [rx + 2, PAGE_R.y + PAGE_R.d + 0.2, VT + 0.6], [rx + 2, PAGE_R.y + PAGE_R.d + 3.6, VT + COVER_T], [rx, PAGE_R.y + PAGE_R.d + 3.6, VT + COVER_T], [rx, PAGE_R.y + PAGE_R.d + 0.2, VT + 0.6], [rx, PAGE_R.y + PAGE_R.d, z]])}"/>`);
  return o.join("");
}

// ---------- print carriage on its rail ----------
function rail() {
  const o = [];
  o.push(g("m-press", S(k.slabOf(RAIL, VT, 3, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(RAIL, VT + 1.5, P, 2), { tone: "faint" }) })));
  const t = k.topTicks(RAIL.y + 6, RAIL.y + RAIL.d - 6, 3.5, 2, RAIL.x + 0.8, VT + 3, [1.2, 2.2], P, "y");
  o.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  for (const y of [RAIL.y - 1, RAIL.y + RAIL.d - 3]) o.push(g("m-press", S(k.slabOf({ x: RAIL.x - 1, y, w: RAIL.w + 2, d: 4, r: 0.5 }, VT, 6, P, 2, 0.3), { tone: "mid" })));
  o.push(D([[RAIL.x + 3, RAIL.y + 1], [RAIL.x + 3, RAIL.y + RAIL.d - 1]].map(([x, y]) => at([x, y, VT + 6])), { size: 0.45, tone: "hi" }));
  return o.join("");
}
function carriage() {
  const y = PARK, o = [];
  o.push(g("m-press", S(k.slabOf({ x: RAIL.x - 2, y: y - 5, w: RAIL.w + 4, d: 10, r: 0.8 }, VT + 3, 8, P, 2, 0.4), { tone: "hi" })));
  o.push(g("m-press", S(k.slabOf({ x: RAIL.x + 0.5, y: y - 2, w: 5, d: 4, r: 0.4 }, VT + 11, ARM_Z + 3 - VT - 11, P, 2), { tone: "mid" })));
  o.push(g("m-press", S(k.slabOf({ x: RAIL.x + 0.5, y: y - 2, w: STAMP.x1 - 14 - RAIL.x, d: 4, r: 0.4 }, ARM_Z, 3, P, 2, 0.3), { tone: "mid" })));
  o.push(D([[RAIL.x + 3, y], [STAMP.x1 - 16, y]].map(([x, yy]) => at([x, yy, ARM_Z + 3])), { size: 0.45, tone: "hi" }));
  // stamp: stem, guide collar and the line stamp (inks one line)
  const sx = (STAMP.x0 + STAMP.x1) / 2;
  o.push(g("m-press", S(k.cylinder(sx, y, 2.4, ARM_Z - 2, 2, P, 18), { tone: "mid" })) +
    `<g data-part="stamp">` +
    g("m-press", S(k.cylinder(sx, y, 1.2, STAMP.z0 + STAMP.h, ARM_Z - 2 - STAMP.z0 - STAMP.h, P, 12), { tone: "lo", crease: "none" })) +
    g("m-stamp", S(k.slabOf({ x: STAMP.x0, y: y - STAMP.d / 2, w: STAMP.x1 - STAMP.x0, d: STAMP.d, r: 0.6 }, STAMP.z0, STAMP.h, P, 2, 0.3), { tone: "hi" })) +
    `</g>`);
  return `<g data-part="carriage">${o.join("")}</g>`;
}
function cable() {
  const scr = WIRE.map(at);
  return `<g class="cable">${k.wireSvg(scr[0], scr[3], { via: [scr[1], scr[2]], tone: "mid", size: 0.9 })}<circle class="pulse" data-part="pulse" r="1.6" opacity="0"/></g>`;
}

// ---------- assemble ----------
const feedClip = path([[-300, FEED_Y, TRAY_TOP + PAPER_T], [300, FEED_Y, TRAY_TOP + PAPER_T], [300, 300, TRAY_TOP + PAPER_T], [-300, 300, TRAY_TOP + PAPER_T]]);
const exitClip = path([[EXIT_X, -200, EXIT_Z + PAPER_T], [300, -200, EXIT_Z + PAPER_T], [300, 200, EXIT_Z + PAPER_T], [EXIT_X, 200, EXIT_Z + PAPER_T]]);

const GEOMETRY = {
  P, lever: LEVER, drum: DRUM, wheel: WHEEL, rows: ROWS, newRows: NEW_ROWS, park: PARK, drop: DROP,
  trayTop: TRAY_TOP, exitZ: EXIT_Z, vt: VT,
  feedDy: INSIDE_Y - PAPER.y, inDx: -60 - PAPER.x, exitDx: HOPPER.x + 3 - PAPER.x, sink: 34,
  wire: WIRE,
};
const round = (v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
const geometry = JSON.stringify(GEOMETRY, (_, v) => round(v)).replace(/"/g, "&quot;");

const body = [
  `<defs><clipPath id="rp-feed"><path d="${feedClip}"/></clipPath><clipPath id="rp-exit"><path d="${exitClip}"/></clipPath></defs>`,
  base(),
  pressBody(), pressHead(),
  trayBack(),
  `<g data-slot="feed" clip-path="url(#rp-feed)">${invoice()}</g>`,
  trayFront(),
  lever(),
  vault(),
  ledger(),
  rail(), carriage(), cable(),
  `<g data-slot="out" clip-path="url(#rp-exit)"></g>`,
].join("");

const LABEL = "A registry press. A paper invoice, TES-INV-0007, lies in a feed tray in front of it. Pulling the lever feeds it into the press, where a hashing drum turns; a print carriage then stamps the invoice’s short fingerprint N on the next ruled line of an open public board, and the paper invoice drops into the shielded vault under the board. Only N is public.";
const svg =
  `<!-- Generated by scripts/figures/registry-press.build.mjs; do not edit by hand. -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg rp-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="group" tabindex="-1" aria-label="${LABEL}" data-i18n-aria="fp.fig.aria" data-geometry="${geometry}">${body}</svg>\n`;

for (const bad of [/<script/i, /<style/i, /\sstyle="/i]) if (bad.test(svg)) throw new Error(`registry-press.svg must not contain ${bad}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log("wrote", OUT, (svg.length / 1024).toFixed(1) + " KB");
