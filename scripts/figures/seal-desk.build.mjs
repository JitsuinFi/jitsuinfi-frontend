// Chapter 3 figure, the seal desk (HNK-33.T2): an assignment letter with three seal circles in
// front of a rack of three hanko (売 supplier, 買 buyer, 融 financier); behind it a gate with
// three latches holds the advance coin at the top of a chute that runs into the shielded pool.
//
// Rebuild (only when the drawing changes; the output is committed):
//   node scripts/figures/seal-desk.build.mjs
// It needs the anatomy skill kit (iso-kit.mjs, lathe.mjs): ANATOMY_KIT=/path/to/kit overrides
// the default ~/.claude/skills/anatomy/kit.
//
// Output: src/landing/figures/seal-desk.svg, static markup only. No <script>, no <style>, no
// inline style attributes (the site CSP has no 'unsafe-inline'): every colour comes from the
// .sd-* rules in src/landing/landing.css, which map the kit's --anatomy-* variables onto the
// DS-PAL tokens. The geometry the runtime needs (projection, seal and circle positions, chute)
// travels on the root as data-geometry; src/landing/figures/seal-desk.ts reads it. Small English
// labels carry data-i18n="<key>" (aria labels: data-i18n-aria) so the chapter can set them per
// language.
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT = process.env.ANATOMY_KIT ?? join(homedir(), ".claude/skills/anatomy/kit");
const k = await import(pathToFileURL(join(KIT, "iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "lathe.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "landing", "figures", "seal-desk.svg");
const WIDTH = 640, HEIGHT = 470;

// ---------- world ----------
const BASE = { x: -150, y: -125, w: 300, d: 225, r: 10 };
const BASE_H = 12, FOOT_H = 5;
const POOL = { x: -40, y: -117, w: 170, d: 80, r: 12 };
const POOL_H = 30, WATER_Z = 24, RIM = 7;
const OPEN = k.insetPlan(POOL, RIM);
const GATE_Y = -18;
const POSTS = [68, 96]; // x of each post's -x face (posts are 6 wide)
const POST_TOP = 100, BAR_TOP = 107;
const SHUT = { x: 74.5, y: GATE_Y - 1.2, w: 21, d: 2.4, r: 0.4 };
const SHUT_LIFT = 30;
const LATCH_X = [75, 85, 95];
const RACK = { x: -136, y: -62, w: 26, d: 84, r: 3 };
const RACK_H = 12;
// the kanji match ROLES in src/landing/SealChain.tsx
const SEALS = [
  { at: [-123, -48], kanji: "売", who: "supplier", name: "Supplier" },
  { at: [-123, -20], kanji: "買", who: "buyer", name: "Buyer" },
  { at: [-123, 8], kanji: "融", who: "financier", name: "Financier" },
];
const MAT = { x: -88, y: 6, w: 136, d: 84, r: 3 };
const LETTER = { x: -80, y: 12, w: 120, d: 72, r: 0.6 };
const LETTER_TOP = 1.7;
const CIRCLES = [[-52, 58], [-18, 58], [16, 58]];

// chute: floor top runs from A down to B
const A = [85, 6, 40], B = [85, -62, 32.8];
const LEN = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
const AX = [(B[0] - A[0]) / LEN, (B[1] - A[1]) / LEN, (B[2] - A[2]) / LEN];
const vUp = (() => { const v = [0, -AX[2], AX[1]]; return v[2] < 0 ? v.map((x) => -x) : v; })();
const CHUTE = G.frameOf(A, AX, [1, 0, 0], vUp);
const along = (s, h) => [A[0] + AX[0] * s + vUp[0] * h, A[1] + AX[1] * s + vUp[1] * h, A[2] + AX[2] * s + vUp[2] * h];
const S_GATE = (A[1] - GATE_Y) / -AX[1];
const COIN_R = 9;
const S_REST = (A[1] - (SHUT.y + SHUT.d)) / -AX[1] - COIN_R - 0.1;
const COIN_REST = along(S_REST, COIN_R);
const floorZ = (y) => A[2] + (B[2] - A[2]) * ((A[1] - y) / (A[1] - B[1]));
const SHUT_Z0 = floorZ(GATE_Y) + 6.2, SHUT_Z1 = 66;

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [POSTS[0], GATE_Y, BAR_TOP + 6], [POSTS[1] + 10, GATE_Y, BAR_TOP + 6], [-123, -48, RACK_H + 80]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const g = (cls, inner, extra = "") => `<g class="${cls}"${extra}>${inner}</g>`;
const path = (pts, close = true) => k.pathOf(pts.map(at), close);
const kj = (m, ch, size, cls, extra = "") => `<text class="kj ${cls}" transform="${m}${extra}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
const tx = (m, s, size, key, cls = "ui") => `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="middle" dominant-baseline="central" data-i18n="${key}">${s}</text>`;

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
  const plate = { x: 98, y: 52, w: 38, d: 28, r: 1.5 };
  o.push(S(k.slabOf(plate, 0, 0.8, P, 3, 0.4), { tone: "mid" }));
  for (const [y, w] of [[60, 26], [66, 20], [72, 23]]) o.push(L(k.lineOnTop([plate.x + 6, y], [plate.x + 6 + w, y], 0.8, P), { tone: "lo", free: true }));
  o.push(D(k.corners(plate, 2.6).map(([x, y]) => at([x, y, 0.8])), { size: 0.45, tone: "hi" }));
  return o.join("");
}

// ---------- shielded pool ----------
function pool() {
  const o = [`<path class="iso-halo pool-halo" d="${k.haloOf(POOL, 0, POOL_H, P)}"/>`];
  const sight = { y0: -96, y1: -84, z0: 6, z1: 26 };
  const X = POOL.x + POOL.w;
  const sightFace = path([[X, sight.y0, sight.z0], [X, sight.y1, sight.z0], [X, sight.y1, sight.z1], [X, sight.y0, sight.z1]]);
  const sightWater = path([[X, sight.y0 + 1.2, sight.z0 + 1.2], [X, sight.y1 - 1.2, sight.z0 + 1.2], [X, sight.y1 - 1.2, WATER_Z - 2], [X, sight.y0 + 1.2, WATER_Z - 2]]);
  const plate = [[POOL.x + 14, POOL.y + POOL.d, 8], [POOL.x + 62, POOL.y + POOL.d, 8], [POOL.x + 62, POOL.y + POOL.d, 20], [POOL.x + 14, POOL.y + POOL.d, 20]];
  const inner = [
    L(k.sideSeam(POOL, 4, P, 8), { tone: "faint" }),
    `<path class="pool-glass" d="${sightFace}"/><path class="pool-water-side" d="${sightWater}"/>`,
    L(k.segment([X, sight.y0 + 1.2, WATER_Z - 2], [X, sight.y1 - 1.2, WATER_Z - 2], P), { tone: "mid" }),
    `<path class="pool-plate" d="${path(plate)}"/>`,
    tx(k.sideMatrix([POOL.x + 38, POOL.y + POOL.d], 14, P, "left"), "SHIELDED POOL", 3.6, "sc.fig.pool", "ui pool-label"),
  ].join("");
  o.push(g("m-pool", S(k.slabOf(POOL, 0, POOL_H, P, 10, 1.2), { tone: "hi", inner })));
  o.push(g("m-pool", D([plate[0], plate[1], plate[2], plate[3]].map(([x, y, z], i) => at([x + (i === 0 || i === 3 ? 2.5 : -2.5), y, z + (i < 2 ? 2 : -2)])), { size: 0.5, tone: "hi" })));
  // opening: inner walls + water, clipped to the rim opening
  const openD = k.planOutline(OPEN, POOL_H, P, 10);
  o.push(`<clipPath id="sd-pool-open"><path d="${openD}"/></clipPath>`);
  o.push(`<path class="pool-wall" d="${openD}"/>`);
  const notes = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 16; i++) notes.push(at([OPEN.x + 8 + rnd() * (OPEN.w - 16), OPEN.y + 8 + rnd() * (OPEN.d - 16), WATER_Z]));
  o.push(`<g clip-path="url(#sd-pool-open)"><path class="pool-water" d="${k.planOutline(OPEN, WATER_Z, P, 10)}"/>` +
    `<g class="notes">${notes.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 + (i % 3) * 0.25).toFixed(2)}"/>`).join("")}</g>` +
    `<path class="caustic" d="${[0, 1, 2].map((i) => k.onTop(Array.from({ length: 18 }, (_, j) => [OPEN.x + 10 + j * (OPEN.w - 20) / 17, OPEN.y + 16 + i * 20 + Math.sin(j * 0.9 + i * 2) * 2.2]), WATER_Z, P)).join("")}"/>` +
    `<circle class="new-note" r="1.6" cx="0" cy="0"/>` +
    `<g class="ripples"><path opacity="0"/><path opacity="0"/><path opacity="0"/></g></g>`);
  o.push(g("m-pool", L(k.planOutline(k.insetPlan(POOL, 3.5), POOL_H, P, 10), { tone: "faint" }) + D(k.corners(POOL, 3.5).map(([x, y]) => at([x, y, POOL_H])), { size: 0.55, tone: "hi" })));
  return o.join("");
}

// ---------- chute ----------
const prism = (poly, s0, s1) => G.prismOf(CHUTE, poly, s0, s1, P);
function chuteLeg() {
  const o = [];
  o.push(S(k.cylinder(85, 2, 3.6, 0, 1.2, P, 20), { tone: "mid" }));
  o.push(S(k.cylinder(85, 2, 1.7, 1.2, floorZ(2) - 2 - 1.2, P, 16), { tone: "mid", crease: "none" }));
  // rest block on the pool rim
  o.push(S(k.slabOf({ x: 79, y: -41, w: 12, d: 4, r: 0.6 }, POOL_H, floorZ(-39) - 1.8 - POOL_H, P, 2), { tone: "mid" }));
  return o.join("");
}
const chuteFloor = () => S(prism([[-5, -1.8], [5, -1.8], [5, 0], [-5, 0]], 0, LEN), { tone: "mid" }) +
  D([8, 30, 52].map((s) => at(along(s, -0.8).map((v, i) => (i === 0 ? v + 5 : v)))), { size: 0.45, tone: "hi" });
const farWall = () => S(prism([[-5, 0], [-3.2, 0], [-3.2, 6], [-5, 6]], 0, LEN), { tone: "mid" });
const nearWall = (s0, s1) => S(prism([[3.2, 0], [5, 0], [5, 6], [3.2, 6]], s0, s1), { tone: "mid" });

// ---------- gate ----------
function post(x) {
  const o = [];
  o.push(S(k.slabOf({ x: x - 3, y: GATE_Y - 7, w: 12, d: 14, r: 1 }, 0, 2, P, 2, 0.4), { tone: "mid" }));
  o.push(D([[x - 1, GATE_Y - 5], [x + 7, GATE_Y + 5]].map(([a, b]) => at([a, b, 2])), { size: 0.45, tone: "hi" }));
  const inner = x === POSTS[0] ? L(k.rise([x + 6, GATE_Y, 0], 2, POST_TOP, P), { tone: "faint" }) : "";
  o.push(S(k.slabOf({ x, y: GATE_Y - 3, w: 6, d: 6, r: 0.6 }, 2, POST_TOP - 2, P, 2), { tone: "mid", inner }));
  return o.join("");
}
function shutter() {
  const h = SHUT_Z1 - SHUT_Z0;
  const inner = L(k.sideSeam(SHUT, SHUT_Z0 + h * 0.33, P, 2) + k.sideSeam(SHUT, SHUT_Z0 + h * 0.66, P, 2), { tone: "faint" });
  return S(k.slabOf(SHUT, SHUT_Z0, h, P, 2, 0.4), { tone: "hi", inner }) +
    S(k.slabOf({ x: 81, y: SHUT.y + SHUT.d, w: 8, d: 1.6, r: 0.5 }, SHUT_Z1 - 7, 2.2, P, 2), { tone: "mid" }) +
    D([[76.5, SHUT_Z1 - 2], [93.5, SHUT_Z1 - 2], [76.5, SHUT_Z0 + 2], [93.5, SHUT_Z0 + 2]].map(([x, z]) => at([x, SHUT.y + SHUT.d, z])), { size: 0.45, tone: "hi" });
}
function crossbar() {
  const bar = { x: 64, y: GATE_Y - 5, w: 42, d: 10, r: 1.4 };
  const o = [S(k.slabOf(bar, POST_TOP, BAR_TOP - POST_TOP, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(bar, POST_TOP + 1.6, P, 3), { tone: "faint" }) })];
  o.push(D([[66, GATE_Y - 3], [104, GATE_Y + 3]].map(([x, y]) => at([x, y, BAR_TOP])), { size: 0.45, tone: "hi" }));
  // lamps on the front face
  o.push(`<g class="lamps">${LATCH_X.map((x, i) => { const [cx, cy] = at([x, bar.y + bar.d, POST_TOP + 3.6]); return `<circle data-lamp="${i}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5"/>`; }).join("")}</g>`);
  for (const x of LATCH_X) {
    o.push(S(k.cylinder(x, GATE_Y, 2.6, BAR_TOP, 1.4, P, 20), { tone: "mid" }));
    o.push(S(k.cylinder(x, GATE_Y, 0.7, BAR_TOP + 1.4, 5, P, 10), { tone: "lo", crease: "none" }));
  }
  o.push(LATCH_X.map((x, i) => `<g class="latch" data-latch="${i}">${S(k.cylinder(x, GATE_Y, 1.5, BAR_TOP + 1.4, 6, P, 16), { tone: "mid" })}${S(k.cylinder(x, GATE_Y, 2, BAR_TOP + 7.4, 1.2, P, 16, 0.3), { tone: "mid" })}</g>`).join(""));
  return o.join("");
}

// ---------- coin ----------
function coin() {
  const F = G.frameAlong(COIN_REST, [1, 0, 0]);
  const body = S(G.disc(-1, 1, COIN_R, F, P), { tone: "hi", crease: "faint" });
  const ring = L(G.circleOf(F, 1, 7.2, P, 48), { tone: "mid" });
  const [cx, cy, cz] = COIN_REST;
  const zpts = [[2.9, 3.2], [-2.9, 3.2], [2.9, -3.2], [-2.9, -3.2]].map(([dy, dz]) => at([cx + 1, cy + dy, cz + dz]));
  const zd = k.pathOf(zpts) + k.pathOf([at([cx + 1, cy, cz + 3.2]), at([cx + 1, cy, cz + 5])]) + k.pathOf([at([cx + 1, cy, cz - 3.2]), at([cx + 1, cy, cz - 5])]);
  return `<g class="coin m-coin">${body}${ring}<path class="iso-line coin-z" data-tone="mid" data-free="" d="${zd}"/></g>`;
}

// ---------- letter, rack, seals ----------
// a crack across one impression, in its own units (ring radius 8.7)
const CRACK = ["M0.4 -9.6 L-1.1 -4.2 L1.6 -0.4 L-1.5 3.8 L0.7 9.6", "M-1.5 3.8 L-6.4 6.2", "M1.6 -0.4 L6.6 -2.6"];
function letter() {
  const o = [];
  o.push(g("m-mat", S(k.slabOf(MAT, 0, 1.2, P, 3, 0.4), { tone: "mid" })));
  o.push(g("m-sheet", S(k.slabOf(LETTER, 1.2, 0.5, P, 2), { tone: "mid", crease: "none" })));
  const z = LETTER_TOP;
  o.push(L(k.lineOnTop([-72, 20], [-28, 20], z, P), { tone: "hi", free: true }));
  for (const [y, x1] of [[27, 30], [32, 24], [37, 32], [42, 6]]) o.push(L(k.lineOnTop([-72, y], [x1, y], z, P), { tone: "lo", free: true }));
  o.push(L(k.lineOnTop([12, 20], [32, 20], z, P), { tone: "lo", free: true }));
  CIRCLES.forEach(([x, y], i) => {
    o.push(`<path class="cue" data-cue="${i}" d="${k.ring(x, y, 12, z, P, 48)}"/>`);
    o.push(L(k.ring(x, y, 10, z, P, 48), { tone: "mid" }));
    o.push(kj(k.topMatrix([x, y], z, P), SEALS[i].kanji, 7, "kj-faint"));
    o.push(tx(k.topMatrix([x, y + 16.5], z, P), SEALS[i].who, 4.4, `sc.fig.${SEALS[i].who}`));
  });
  // impressions (hidden until pressed), each with its crack (hidden until the letter is edited)
  CIRCLES.forEach(([x, y], i) => {
    const m = k.topMatrix([x, y], z, P);
    o.push(`<g class="imp" data-imp="${i}"><g transform="${m} rotate(${[-7, 5, -3][i]})"><circle r="8.7" class="imp-ring"/><circle r="7.6" class="imp-ring thin"/><text class="kj imp-k" font-size="10" text-anchor="middle" dominant-baseline="central">${SEALS[i].kanji}</text><g class="crack" data-crack="${i}">${CRACK.map((d) => `<path d="${d}" pathLength="1"/>`).join("")}</g></g></g>`);
  });
  return o.join("");
}
function rack() {
  const o = [];
  // ink pad and its lid
  o.push(g("m-rack", S(k.cylinder(-127, 78, 9, 0, 3, P, 40, 0.5), { tone: "mid" }) + L(k.ring(-127, 78, 6.5, 3, P, 36), { tone: "lo" })));
  o.push(g("m-rack", S(k.cylinder(-122, 46, 10, 0, 4.5, P, 44, 0.5), { tone: "mid", inner: L(k.sideArc(-122, 46, 10, 2.2, P, 40), { tone: "faint" }) })));
  o.push(`<path class="ink-top" d="${k.ring(-122, 46, 7.8, 4.5, P, 40)}"/>`);
  o.push(g("m-rack", S(k.slabOf(RACK, 0, RACK_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(RACK, 3, P, 4), { tone: "faint" }) })));
  o.push(g("m-rack", L(SEALS.map(({ at: [x, y] }) => k.ring(x, y, 7.4, RACK_H, P, 32)).join(""), { tone: "lo" }) +
    D([[RACK.x + 4, RACK.y + 4], [RACK.x + 4, RACK.y + RACK.d - 4], [RACK.x + RACK.w - 4, RACK.y + 4], [RACK.x + RACK.w - 4, RACK.y + RACK.d - 4]].map(([x, y]) => at([x, y, RACK_H])), { size: 0.45, tone: "hi" })));
  SEALS.forEach(({ at: [, y], kanji }) => o.push(kj(k.sideMatrix([RACK.x + RACK.w, y + 12], 6.4, P, "right"), kanji, 5, "kj-seal")));
  return o.join("");
}
function seal(i) {
  const [x, y] = SEALS[i].at, z = RACK_H;
  const o = [];
  o.push(`<path class="hit" d="${k.cylinder(x, y, 10, z - 2, 40, P, 20).fill}"/>`);
  o.push(`<path class="iso-halo seal-halo" d="${k.haloOf({ x: x - 6, y: y - 6, w: 12, d: 12, r: 6 }, z, 0.1, P)}"/>`);
  o.push(g("m-ink", S(k.cylinder(x, y, 6, z, 3, P, 36), { tone: "hi" })));
  o.push(g("m-seal", S(k.cylinder(x, y, 5.6, z + 3, 22, P, 36), { tone: "hi", inner: L(k.sideArc(x, y, 5.6, z + 7, P, 30) + k.sideArc(x, y, 5.6, z + 21, P, 30), { tone: "mid" }) })));
  o.push(g("m-seal", S(k.cylinder(x, y, 3.6, z + 25, 3, P, 24), { tone: "hi" })));
  o.push(g("m-seal", S(k.cylinder(x, y, 4.8, z + 28, 5, P, 32, 0.6), { tone: "hi" })));
  o.push(kj(k.topMatrix([x, y], z + 33, P), SEALS[i].kanji, 5.6, "kj-faint"));
  const label = `Press the ${SEALS[i].who}’s seal`;
  return `<g class="seal" data-seal="${i}" tabindex="0" role="button" aria-label="${label}" data-i18n-aria="sc.press.${SEALS[i].who}">${o.join("")}</g>`;
}

// ---------- assemble ----------
const GEOMETRY = {
  P,
  sealAt: SEALS.map((s) => s.at),
  circles: CIRCLES,
  rackH: RACK_H, letterTop: LETTER_TOP, shutLift: SHUT_LIFT, waterZ: WATER_Z, poolH: POOL_H,
  a: A, ax: AX, up: vUp, len: LEN, sRest: S_REST, sGate: S_GATE, coinR: COIN_R, rest: COIN_REST,
};
const round = (v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
const geometry = JSON.stringify(GEOMETRY, (_, v) => round(v)).replace(/"/g, "&quot;");

const body = [
  base(), pool(),
  `<g data-slot="in" clip-path="url(#sd-pool-open)"></g>`, `<g data-slot="above"></g>`,
  chuteLeg(), chuteFloor(), farWall(),
  `<g data-slot="back"></g>`,
  nearWall(S_GATE, LEN),
  post(POSTS[0]),
  `<g data-part="shutter">${shutter()}</g>`,
  `<g data-slot="front">${coin()}</g>`,
  nearWall(0, S_GATE),
  post(POSTS[1]),
  crossbar(),
  letter(), rack(),
  `<g data-part="seals">${[0, 1, 2].map(seal).join("")}</g>`,
].join("");

const LABEL = "A seal desk. An assignment letter with three empty seal circles for supplier, buyer and financier lies in front of a rack of three hanko seals. Behind it a gate holds a coin at the top of a chute that runs into the shielded pool. Each seal lifts one latch of the gate; after the third, the shutter rises and the coin rolls into the pool.";
const svg =
  `<!-- Generated by scripts/figures/seal-desk.build.mjs; do not edit by hand. -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg sd-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="group" tabindex="-1" aria-label="${LABEL}" data-i18n-aria="sc.fig.aria" data-geometry="${geometry}">${body}</svg>\n`;

for (const bad of [/<script/i, /<style/i, /\sstyle="/i]) if (bad.test(svg)) throw new Error(`seal-desk.svg must not contain ${bad}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log("wrote", OUT, (svg.length / 1024).toFixed(1) + " KB");
