// The /app lobby figure (HNK-34.T1, from the approved design sample of 2026-10-25): a variant of the chapter 6 registry office
// (scripts/figures/registry-office.build.mjs, HNK-33.T6), same plate, camera, kit and materials,
// laid out as the building's directory. Every room of the app is a part of the office:
//   試 try       a side desk with two copies of TES-INV-0003; the copy gets the 拒 stamp
//   売 supplier  the invoice on the counter (and its 売 seal)
//   買 buyer     the till 入金 (sign, acknowledge, pay)
//   融 financier the console door in the left wall
//   資 member    the shielded pool
//   外 outsider  the public board pane (N and block only)
//   証 verify    the check pane (N 56ed…8450 found twice: the second entry is refused)
//   価 rates     the rate index pane (five tenor tubes, k = 5)
// The registry sign moves to the left wall; the label plate gives its corner to the try desk.
// Extra output for the lobby: a floor spot per room (.spot[data-room]), a hit hull per room
// (.hit[data-room], convex hull of the room's boxes) and, on the root, data-anchors: where each
// room's pin stands, in % of the viewBox, written as CSS rules (the page sets the pins in HTML so
// they keep their size on a phone; the CSP allows no inline style attributes).
//
// Rebuild (only when the drawing changes; the output is committed):
//   node scripts/figures/lobby-office.build.mjs
// It needs the anatomy skill kit (iso-kit.mjs, lathe.mjs): ANATOMY_KIT=/path/to/kit overrides
// the default ~/.claude/skills/anatomy/kit.
//
// Output: src/app/figures/lobby-office.svg, static markup only. No <script>, no <style>, no inline
// style attributes (the app's CSP has no 'unsafe-inline'): every colour comes from the .ro-* rules
// in src/landing/landing.css (the drawing shares chapter 6's materials) and the .lobby-svg rules in
// src/pages/lobby.css. The geometry the runtime needs (projection, seals, wire, chute, door) travels
// on the root as data-geometry; src/app/figures/lobby-office.ts reads it. And
// src/app/figures/lobby-office-pins.css: each room's pin position. What the lobby reads at runtime
// from the board (TES-INV-0003's N and the two blocks it was registered at) is left empty here.
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT = process.env.ANATOMY_KIT ?? join(homedir(), ".claude/skills/anatomy/kit");
const k = await import(pathToFileURL(join(KIT, "iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "lathe.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "src", "app", "figures", "lobby-office.svg");
const PINS = join(ROOT, "src", "app", "figures", "lobby-office-pins.css");
const WIDTH = 640, HEIGHT = 470;

// ---------- truth (src/landing/Finale.tsx) ----------
// TES-INV-0003 lived its whole cycle on Zcash testnet (TEST-HNK-19): its register entry is txid
// 33b8f3b0… at block 4 509 299. Its N is read by the chapter from that entry's memo with
// jitsuin-wasm, so the board's new line and the invoice's N line stay empty here. The two lines
// above it are the board's real register entries just before it (the published snapshot,
// jitsuinfi-zcash examples/testnet/board-snapshot.json: blocks 4 509 045 and 4 509 085).
// Seals: 売 supplier, 買 buyer, 融 financier (Sign-to-Pay).
const INVOICE = "TES-INV-0003";
const OTHERS = [
  { n: "N 4242…4242", h: "4 509 045" },
  { n: "N d415…228c", h: "4 509 085" },
];
// TES-INV-0003's N and the two blocks it was registered at (4 509 299, then again at 4 509 521: the
// second financing the board catches) are read by the lobby from the board copy bundled with the
// app (src/lib/board.ts BOARD_COPY), so their texts stay empty here (data-part tryN0, tryN1, vN,
// v1, v2).
const SEALS = [{ k: "売" }, { k: "買" }, { k: "融" }];

// ---------- world (same base plate and camera as chapters 2-5) ----------
const BASE = { x: -150, y: -125, w: 300, d: 225, r: 10 };
const BASE_H = 12, FOOT_H = 5;

// two low walls in the back corner: the back wall carries the board, the left wall the door to the console
const WH = 64;
const WALL_B = { x: -146, y: -122, w: 186, d: 6, r: 0.6 };   // front face y = -116
const WALL_L = { x: -146, y: -116, w: 6, d: 146, r: 0.6 };   // front face x = -140, runs to y = 30
const YB = WALL_B.y + WALL_B.d, XL = WALL_L.x + WALL_L.w;

// public board on the back wall
// one frame, three panes: the public board (外), the check (証), the rate index (価)
const BF = { x: -138, y: YB, w: 176, d: 2.4, r: 0.5 };
const BF_Z = [16, 58], BYF = BF.y + BF.d;
const PZ = { z0: 19.4, z1: 54.6 };
const SCR = { x0: -134.6, x1: -52, ...PZ };
const VFY = { x0: -48.6, x1: -8.6, ...PZ };
const RATE = { x0: -5.2, x1: 34.6, ...PZ };
const ROW_Z = [41, 35.8, 30.6];
const COL_N = SCR.x0 + 3, COL_H = -80;
// the registry sign, on the left wall between the back corner and the door
const SIGN = { y0: -110, y1: -54 };
const SIGN_Z = [32, 52];

// the door in the left wall: hinged on its back jamb, it swings out into the room
const DOOR = { hx: XL, hy: -40, w: 34, t: 1.4, z0: 1.2, z1: 49.6 };
const DOOR_MAX = 68 * Math.PI / 180;
const OPEN_SIGN = { x: XL, y: -36, w: 1.2, d: 26, r: 0.3 };
const OPEN_Z = [56, 62.4];
const LAMP = [XL, -4.5, 59.2];

// the counter, the till and the pool stand FY forward of the walls
const FY = 20, CY = 13 + FY;   // CY: the chute's centre line
const TOP_Z = 30.5;
const COUNTER = { x: -70, y: FY, w: 112, d: 26, r: 1 };
const PLINTH = { x: -68, y: FY + 2, w: 108, d: 22, r: 1 };
const CTOP = { x: -72, y: FY - 2, w: 116, d: 30, r: 1.5 };
const RACK = { x: -68, y: FY + 1, w: 13, d: 24, r: 1.2 };
const RACK_H = 4, SEAL_Z = TOP_Z + RACK_H;
const SEAL_AT = [[-61.5, FY + 5.5], [-61.5, FY + 13], [-61.5, FY + 20.5]];
const SHEET = { x: -50, y: FY + 1, w: 66, d: 24, r: 0.5 };
const SH_Z = TOP_Z + 0.5;
const CIRC = [[-38, FY + 12.5], [-21, FY + 12.5], [-4, FY + 12.5]];
const TILL = { x: 24, y: FY + 4, w: 20, d: 18, r: 1 };
const TILL_TOP = TOP_Z + 12, TX = TILL.x + TILL.w;
const MOUTH = { y0: CY - 4.6, y1: CY + 4.6, z0: 32.4, z1: 41.2 };

// the chute from the till down into the pool
const A = [TX, CY, 33], B = [76, CY, 23];
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const AX = [(B[0] - A[0]) / LEN, 0, (B[2] - A[2]) / LEN];
const VUP = [-AX[2], 0, AX[0]];
const CHUTE = G.frameOf(A, AX, [0, 1, 0], VUP);
const along = (s, h) => [A[0] + AX[0] * s + VUP[0] * h, A[1], A[2] + AX[2] * s + VUP[2] * h];
const COIN_R = 3.4;
const COIN0 = along(COIN_R + 0.4, COIN_R);
const bottomZ = (x) => A[2] + (x - A[0]) * (AX[2] / AX[0]) - 1.2 / AX[0];
const LEG_X = 53.6;

// shielded pool
const POOL = { x: 60, y: FY - 50, w: 80, d: 74, r: 8 };
const POOL_H = 20, WATER_Z = 14, RIM = 6;
const OPEN = k.insetPlan(POOL, RIM);
const LAND = [81, CY];

// wire: counter back -> floor -> up the back wall to the board's frame
const W1 = [[-60, FY, 5], [-60, FY - 5, 0.6], [-60, -114.2, 0.6], [-60, -114.2, BF_Z[0]]];

// the try desk, front left, where the label plate was: two copies of the same invoice
const TRY = { x: -134, y: 55, w: 50, d: 27, r: 1 };
const TRY_TOP_PLAN = { x: -136.5, y: 52.5, w: 55, d: 32, r: 1.5 };
const TRY_Z = 19, TRY_SH_Z = TRY_Z + 0.5;
const COPY_A = { x: -132, y: 56, w: 22, d: 25, r: 0.5 };
const COPY_B = { x: -106.5, y: 57.5, w: 22, d: 25, r: 0.5 };

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [WALL_B.x, WALL_B.y, WH], [WALL_B.x + WALL_B.w, WALL_B.y, WH], [WALL_L.x, WALL_L.y + WALL_L.d, WH]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const g = (cls, inner, extra = "") => `<g class="${cls}"${extra}>${inner}</g>`;
const path = (pts, close = true) => k.pathOf(pts.map(at), close);
const f1 = (v) => v.toFixed(1);
const move = ([dx, dy, dz]) => { const o = at([0, 0, 0]), m = at([dx, dy, dz]); return `translate(${(m[0] - o[0]).toFixed(2)} ${(m[1] - o[1]).toFixed(2)})`; };
const kj = (m, ch, size, cls = "kj", extra = "") => `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="middle" dominant-baseline="central"${extra}>${ch}</text>`;
// small text in the drawing; `i18n` key marks English labels for translation
const tx = (m, s, size, { cls = "ui", anchor = "middle", i18n, extra = "" } = {}) =>
  `<text class="${cls}" transform="${m}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="central"${i18n ? ` data-i18n="${i18n}"` : ""}${extra}>${s}</text>`;
const yFace = (x0, x1, y, z0, z1) => path([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const xFace = (x, y0, y1, z0, z1) => path([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
const yRect = (x0, x1, y, z0, z1, cls) => `<path class="${cls}" d="${yFace(x0, x1, y, z0, z1)}"/>`;
const xRect = (x, y0, y1, z0, z1, cls) => `<path class="${cls}" d="${xFace(x, y0, y1, z0, z1)}"/>`;
const sideL = (x, y, z) => k.sideMatrix([x, y], z, P, "left");    // on a face looking +y
const sideR = (x, y, z) => k.sideMatrix([x, y], z, P, "right");   // on a face looking +x
const R1 = (r) => (r * P.scale * Math.sqrt(1.6)).toFixed(2);       // a world radius in screen units

// The door panel at angle th: the visible broad face, the top and the free edge as paths, and the matrix that
// carries the face's drawing (drawn closed, on the front plane) onto whichever face is seen. Shared with the page.
function doorGeom(th, iso, D) {
  const s = Math.sin(th), c = Math.cos(th);
  const u = [s, c], n = [c, -s];
  const p = (sv, d, z) => [D.hx + sv * u[0] + d * n[0], D.hy + sv * u[1] + d * n[1], z];
  const q = (pts) => "M" + pts.map((v) => { const a = iso(v); return a[0].toFixed(2) + " " + a[1].toFixed(2); }).join("L") + "Z";
  const front = th < Math.PI / 4, off = front ? D.t : 0;
  const o = iso([0, 0, 0]);
  const dir = (v) => { const a = iso(v); return [a[0] - o[0], a[1] - o[1]]; };
  const U0 = dir([0, 1, 0]), U = dir([u[0], u[1], 0]), Z = dir([0, 0, 1]);
  const det = U0[0] * Z[1] - Z[0] * U0[1];
  const inv = [Z[1] / det, -U0[1] / det, -Z[0] / det, U0[0] / det];   // [U0 | Z]^-1, column-major
  const a = U[0] * inv[0] + Z[0] * inv[1], b = U[1] * inv[0] + Z[1] * inv[1];
  const cc = U[0] * inv[2] + Z[0] * inv[3], dd = U[1] * inv[2] + Z[1] * inv[3];
  const A0 = iso([D.hx + D.t, D.hy, 0]), B0 = iso(p(0, off, 0));
  const e = B0[0] - a * A0[0] - cc * A0[1], f = B0[1] - b * A0[0] - dd * A0[1];
  return {
    face: q([p(0, off, D.z0), p(D.w, off, D.z0), p(D.w, off, D.z1), p(0, off, D.z1)]),
    top: q([p(0, 0, D.z1), p(D.w, 0, D.z1), p(D.w, D.t, D.z1), p(0, D.t, D.z1)]),
    edge: q([p(D.w, 0, D.z0), p(D.w, D.t, D.z0), p(D.w, D.t, D.z1), p(D.w, 0, D.z1)]),
    front,
    m: "matrix(" + [a, b, cc, dd, e, f].map((v) => v.toFixed(4)).join(" ") + ")",
  };
}

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
  return o.join("");
}

// ---------- back wall, board, registry sign ----------
function backWall() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(WALL_B, 0, WH, P)}"/>`);
  o.push(g("m-wall", S(k.slabOf(WALL_B, 0, WH, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(WALL_B, WH - 5, P, 2), { tone: "faint" }) })));
  o.push(g("m-wall", S(k.slabOf({ x: XL, y: YB, w: WALL_B.x + WALL_B.w - XL, d: 1.2, r: 0.2 }, 0, 4, P, 2, 0.2), { tone: "mid" })));
  return o.join("");
}
function board() {
  const o = [];
  const bez = (R, cls = "bezel") => yRect(R.x0 - 1.4, R.x1 + 1.4, BYF, R.z0 - 1.4, R.z1 + 1.4, cls);
  const head = (R, s, key, right, rkey) =>
    tx(sideL(R.x0 + 3, BYF, R.z1 - 3.2), s, 2.6, { cls: "ui scr-head", anchor: "start", i18n: key }) +
    (right ? tx(sideL(R.x1 - 3, BYF, R.z1 - 3.2), right, 2.2, { cls: "ui scr-net", anchor: "end", i18n: rkey }) : "") +
    `<path class="scr-rule" d="${k.segment([R.x0, BYF, R.z1 - 6], [R.x1, BYF, R.z1 - 6], P)}"/>`;
  const foot = (R, s, key) =>
    `<path class="scr-rule" d="${k.segment([R.x0, BYF, R.z0 + 4.4], [R.x1, BYF, R.z0 + 4.4], P)}"/>` +
    tx(sideL(R.x0 + 3, BYF, R.z0 + 2.1), s, 1.9, { cls: "ui scr-foot", anchor: "start", i18n: key });
  // 外 the public board: N and block, nothing else
  const out = [
    bez(SCR), yRect(SCR.x0, SCR.x1, BYF, SCR.z0, SCR.z1, "screen"),
    head(SCR, "PUBLIC BOARD", "fig.board", "ZCASH TESTNET", "fig.testnet"),
    tx(sideL(COL_N, BYF, SCR.z1 - 8.6), "N", 2.2, { cls: "ui scr-col", anchor: "start" }),
    tx(sideL(COL_H, BYF, SCR.z1 - 8.6), "BLOCK", 2.2, { cls: "ui scr-col", anchor: "start", i18n: "fig.block" }),
    `<path class="row-hl" data-part="rowHl" d="${yFace(SCR.x0 + 0.4, SCR.x1 - 0.4, BYF, ROW_Z[2] - 2.2, ROW_Z[2] + 2.2)}"/>`,
    ...OTHERS.map((e, i) => tx(sideL(COL_N, BYF, ROW_Z[i]), e.n, 3.4, { cls: "ui scr-n old", anchor: "start" }) + tx(sideL(COL_H, BYF, ROW_Z[i]), e.h, 2.6, { cls: "ui scr-h", anchor: "start" })),
    tx(sideL(COL_N, BYF, ROW_Z[2]), "", 3.4, { cls: "ui scr-n new", anchor: "start", extra: ' data-part="rowN"' }),
    tx(sideL(COL_H, BYF, ROW_Z[2]), "", 2.6, { cls: "ui scr-h new", anchor: "start", extra: ' data-part="rowH"' }),
    foot(SCR, "N and block only · nothing else", "fig.only"),
  ].join("");
  // 証 the check: the same N found twice; the first entry counts, the second is refused
  const vx = VFY.x0 + 3;
  const vStampAt = [VFY.x1 - 6.4, BYF, 29.4];
  const vfy = [
    bez(VFY), yRect(VFY.x0, VFY.x1, BYF, VFY.z0, VFY.z1, "screen"),
    head(VFY, "VERIFY", "fig.verify"),
    tx(sideL(vx, BYF, VFY.z1 - 10), "", 3, { cls: "ui scr-n new", anchor: "start", extra: ' data-part="vN"' }),
    `<path class="row-hl" data-part="vRow1" d="${yFace(VFY.x0 + 0.4, VFY.x1 - 0.4, BYF, 35.6 - 2, 35.6 + 2)}"/>`,
    tx(sideL(vx, BYF, 35.6), "1st", 2.2, { cls: "ui scr-col", anchor: "start" }),
    tx(sideL(vx + 6.5, BYF, 35.6), "", 2.6, { cls: "ui scr-h", anchor: "start", extra: ' data-part="v1"' }),
    tx(sideL(vx, BYF, 29.4), "2nd", 2.2, { cls: "ui scr-col", anchor: "start" }),
    tx(sideL(vx + 6.5, BYF, 29.4), "", 2.6, { cls: "ui scr-h", anchor: "start", extra: ' data-part="v2"' }),
    `<g class="v-stamp" data-part="vStamp" opacity="0"><g transform="${sideL(...vStampAt)} rotate(-8)"><circle r="3.6" class="v-ring"/><text class="kj v-k" font-size="4" text-anchor="middle" dominant-baseline="central">拒</text></g></g>`,
    foot(VFY, "first entry counts", "fig.first"),
  ].join("");
  // 価 the rate index: one glass tube per tenor class, a class shows only with k = 5 invoices
  const TEN = ["30", "60", "90", "180", "365"];
  const t0 = RATE.x0 + 6, dt = (RATE.x1 - RATE.x0 - 12) / 4;
  const tubes = TEN.map((lab, i) => {
    const x = t0 + i * dt;
    return yRect(x - 1.6, x + 1.6, BYF, 27.2, 46.4, "tube") +
      `<path class="tube-water" data-part="tube${i}" d="${yFace(x - 1.1, x + 1.1, BYF, 27.6, 27.6)}" data-x="${x}"/>` +
      tx(sideL(x, BYF, 25.4), lab, 1.7, { cls: "ui scr-col" });
  }).join("");
  const ticks = [30, 34, 38, 42, 46].map((z) => k.segment([RATE.x0 + 2.4, BYF, z], [RATE.x0 + 3.6, BYF, z], P)).join("");
  const rate = [
    bez(RATE), yRect(RATE.x0, RATE.x1, BYF, RATE.z0, RATE.z1, "screen"),
    head(RATE, "RATE INDEX", "fig.rates"),
    `<path class="scr-rule" d="${ticks}"/>`,
    tubes,
    `<path class="rate-scan" data-part="rateScan" d="${yFace(RATE.x0 + 1, RATE.x0 + 1.6, BYF, 26.6, 47.2)}" opacity="0"/>`,
    foot(RATE, "k = 5 · days", "fig.k"),
  ].join("");
  o.push(g("m-frame", S(k.slabOf(BF, BF_Z[0], BF_Z[1] - BF_Z[0], P, 2, 0.4), { tone: "mid", inner: out + vfy + rate })));
  o.push(D([[BF.x + 1.4, BYF, BF_Z[0] + 1.2], [BF.x + BF.w - 1.4, BYF, BF_Z[0] + 1.2], [BF.x + 1.4, BYF, BF_Z[1] - 1.2], [BF.x + BF.w - 1.4, BYF, BF_Z[1] - 1.2]].map(at), { size: 0.45, tone: "hi" }));
  // a lit edge around each pane, shown when its room is pointed at
  for (const [room, R] of [["outsider", SCR], ["verify", VFY], ["rates", RATE]])
    o.push(`<path class="pane-lit" data-room="${room}" d="${yFace(R.x0 - 1.4, R.x1 + 1.4, BYF, R.z0 - 1.4, R.z1 + 1.4)}"/>`);
  // the receiving lamp on the frame's top
  const [lx, ly] = at([SCR.x1 - 6, BF.y + BF.d / 2, BF_Z[1]]);
  o.push(`<circle class="pled" data-part="boardLed" cx="${f1(lx)}" cy="${f1(ly)}" r="${R1(0.9)}"/>`);
  return o.join("");
}

// ---------- left wall: the door to the console ----------
function leftWall() {
  const o = [];
  const y0 = DOOR.hy, y1 = DOOR.hy + DOOR.w;
  // through the doorway: the console room, dark, its screen lit (seen only when the door opens)
  const room = [
    xRect(XL, y0, y1, 0, 50, "glimpse"),
    xRect(XL, y0 + 3, y1 - 3, 15.4, 17.2, "gl-desk"),
    xRect(XL, y0 + 8, y1 - 8, 19, 33, "gl-screen"),
    `<path class="gl-line" d="${[[30.2, 10.5], [27.6, 7], [25, 12]].map(([z, w]) => k.segment([XL, y0 + 10, z], [XL, y0 + 10 + w, z], P)).join("")}"/>`,
    kj(sideR(XL, y1 - 11.4, 22.6), "印", 2.6, "kj gl-k"),
  ].join("");
  // plaque beside the door: the console
  const plaque = [
    xRect(XL, 6, 26, 26, 41, "plate-face"),
    kj(sideR(XL, 16, 35.4), "入", 7, "kj sign-k"),
    tx(sideR(XL, 16, 29.2), "CONSOLE", 2.1, { cls: "ui plate-text", i18n: "fn.fig.console" }),
  ].join("");
  const inner = [L(k.sideSeam(WALL_L, WH - 5, P, 2), { tone: "faint" }), room, plaque].join("");
  o.push(`<path class="iso-halo" d="${k.haloOf(WALL_L, 0, WH, P)}"/>`);
  o.push(g("m-wall", S(k.slabOf(WALL_L, 0, WH, P, 2, 0.4), { tone: "mid", inner })));
  o.push(D([[XL, 7.6, 39.4], [XL, 24.4, 39.4], [XL, 7.6, 27.6], [XL, 24.4, 27.6]].map(at), { size: 0.4, tone: "hi" }));
  // the registry sign, moved here from the back wall
  const SX = XL + 1.4, sy = (SIGN.y0 + SIGN.y1) / 2;
  const sInner = [
    kj(sideR(SX, sy, 45.6), "登記所", 7.4, "kj sign-k"),
    L(k.segment([SX, SIGN.y0 + 4, 39.6], [SX, SIGN.y1 - 4, 39.6], P), { tone: "lo" }),
    tx(sideR(SX, sy, 36.2), "REGISTRY OFFICE", 2.2, { cls: "ui plate-text", i18n: "fig.office" }),
  ].join("");
  o.push(g("m-plaque", S(k.slabOf({ x: XL, y: SIGN.y0, w: 1.4, d: SIGN.y1 - SIGN.y0, r: 0.3 }, SIGN_Z[0], SIGN_Z[1] - SIGN_Z[0], P, 2, 0.3), { tone: "mid", inner: sInner })));
  o.push(D([[SX, SIGN.y0 + 1.4, SIGN_Z[0] + 1.2], [SX, SIGN.y1 - 1.4, SIGN_Z[0] + 1.2], [SX, SIGN.y0 + 1.4, SIGN_Z[1] - 1.2], [SX, SIGN.y1 - 1.4, SIGN_Z[1] - 1.2]].map(at), { size: 0.4, tone: "hi" }));
  // skirting either side of the doorway
  o.push(g("m-wall", S(k.slabOf({ x: XL, y: YB + 1.2, w: 1.2, d: y0 - 4 - YB - 1.2, r: 0.2 }, 0, 4, P, 2, 0.2), { tone: "mid" })));
  o.push(g("m-wall", S(k.slabOf({ x: XL, y: y1 + 4, w: 1.2, d: WALL_L.y + WALL_L.d - y1 - 4, r: 0.2 }, 0, 4, P, 2, 0.2), { tone: "mid" })));
  // door frame: back jamb, head, front jamb
  o.push(g("m-frame", S(k.slabOf({ x: XL, y: y0 - 4, w: 1.8, d: 4, r: 0.2 }, 0, 50, P, 2, 0.2), { tone: "mid" })));
  o.push(g("m-frame", S(k.slabOf({ x: XL, y: y0 - 4, w: 1.8, d: DOOR.w + 8, r: 0.2 }, 50, 4, P, 2, 0.2), { tone: "mid" })));
  o.push(g("m-frame", S(k.slabOf({ x: XL, y: y1, w: 1.8, d: 4, r: 0.2 }, 0, 50, P, 2, 0.2), { tone: "mid" })));
  // hinge knuckles on the back jamb
  for (const z of [8, 42]) o.push(g("m-frame", S(G.disc(0, 4, 0.7, G.frameAlong([XL + 1.9, y0 - 0.2, z - 2], [0, 0, 1]), P), { tone: "mid" })));
  // the OPEN sign over the door and its lamp
  const sx = OPEN_SIGN.x + OPEN_SIGN.w;
  o.push(g("m-sign", S(k.slabOf(OPEN_SIGN, OPEN_Z[0], OPEN_Z[1] - OPEN_Z[0], P, 2, 0.2), {
    tone: "mid",
    inner: tx(sideR(sx, OPEN_SIGN.y + OPEN_SIGN.d / 2, (OPEN_Z[0] + OPEN_Z[1]) / 2), "OPEN", 3.6, { cls: `ui open-t`, i18n: "fn.fig.open", extra: ' data-part="openT"' }),
  })));
  o.push(g("m-frame", S(G.disc(0, 1, 1.9, G.frameAlong(LAMP, [1, 0, 0]), P), { tone: "mid" })));
  const [lx, ly] = at([LAMP[0] + 1, LAMP[1], LAMP[2]]);
  o.push(`<circle class="lamp-glow" data-part="lampGlow" cx="${f1(lx)}" cy="${f1(ly)}" r="${R1(4.2)}" opacity="0"/>`);
  o.push(`<circle class="pled" data-part="lamp" cx="${f1(lx)}" cy="${f1(ly)}" r="${R1(1.3)}"/>`);
  // doormat in front of the doorway
  const MAT = { x: XL + 2, y: y0, w: 16, d: DOOR.w, r: 1 };
  o.push(g("m-mat", S(k.slabOf(MAT, 0, 0.8, P, 2, 0.2), { tone: "mid" })));
  o.push(L(Array.from({ length: 6 }, (_, i) => k.lineOnTop([MAT.x + 2.5 + i * 2.2, MAT.y + 0.4], [MAT.x + 2.5 + i * 2.2, MAT.y + MAT.d - 0.4], 0.8, P)).join(""), { tone: "lo" }));
  return o.join("");
}
function doorPanel() {
  const geo = doorGeom(0, at, DOOR);
  // the drawing on the panel, authored on the closed front plane: two sunk panels and the lever handle
  const xf = DOOR.hx + DOOR.t, Y = (s) => DOOR.hy + s;
  const rect = (s0, s1, z0, z1, cls) => `<path class="${cls}" d="${path([[xf, Y(s0), z0], [xf, Y(s1), z0], [xf, Y(s1), z1], [xf, Y(s0), z1]])}"/>`;
  const art = [
    rect(4.5, 29.5, 27, 46, "door-inset"),
    rect(4.5, 29.5, 4.5, 23, "door-inset"),
    rect(29.2, 31.6, 21.6, 29.4, "door-plate"),
    `<path class="door-lever" d="${k.segment([xf, Y(30.4), 27], [xf, Y(25.4), 27], P)}"/>`,
    `<circle class="door-knob" cx="${f1(at([xf, Y(30.4), 27])[0])}" cy="${f1(at([xf, Y(30.4), 27])[1])}" r="${R1(0.7)}"/>`,
  ].join("");
  return `<g class="door${geo.front ? "" : " back"}" data-part="door">` +
    `<path class="door-face" data-part="doorFace" d="${geo.face}"/>` +
    `<g data-part="doorArt" transform="${geo.m}">${art}</g>` +
    `<path class="door-top" data-part="doorTop" d="${geo.top}"/>` +
    `<path class="door-edge" data-part="doorEdge" d="${geo.edge}"/></g>`;
}

// ---------- shielded pool ----------
function pool() {
  const o = [`<path class="iso-halo" d="${k.haloOf(POOL, 0, POOL_H, P)}"/>`];
  const X = POOL.x + POOL.w, Y = POOL.y + POOL.d;
  const sight = { y0: FY - 40, y1: FY - 28, z0: 4, z1: 17 };
  const inner = [
    L(k.sideSeam(POOL, 4, P, 8), { tone: "faint" }),
    xRect(X, sight.y0, sight.y1, sight.z0, sight.z1, "pool-glass"),
    xRect(X, sight.y0 + 1.2, sight.y1 - 1.2, sight.z0 + 1.2, WATER_Z - 1.4, "pool-water-side"),
    yRect(POOL.x + 12, POOL.x + 62, Y, 6.5, 14.5, "pool-plate"),
    tx(sideL(POOL.x + 37, Y, 10.5), "SHIELDED POOL", 3, { cls: "ui pool-label", i18n: "fn.fig.pool" }),
  ].join("");
  o.push(g("m-pool", S(k.slabOf(POOL, 0, POOL_H, P, 8, 1), { tone: "hi", inner })));
  o.push(g("m-pool", D([[POOL.x + 14, Y, 8.5], [POOL.x + 60, Y, 8.5], [POOL.x + 14, Y, 12.5], [POOL.x + 60, Y, 12.5]].map(at), { size: 0.45, tone: "hi" })));
  // opening: inner walls and water, clipped to the rim
  const openD = k.planOutline(OPEN, POOL_H, P, 8);
  o.push(`<path class="pool-wall" d="${openD}"/>`);
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const notes = Array.from({ length: 14 }, () => at([OPEN.x + 6 + rnd() * (OPEN.w - 12), OPEN.y + 6 + rnd() * (OPEN.d - 12), WATER_Z]));
  o.push(`<g clip-path="url(#lo-pool)"><path class="pool-water" d="${k.planOutline(OPEN, WATER_Z, P, 8)}"/>` +
    `<g class="notes">${notes.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${(0.8 + (i % 3) * 0.25).toFixed(2)}"/>`).join("")}</g>` +
    `<path class="caustic" d="${[0, 1, 2].map((i) => k.onTop(Array.from({ length: 16 }, (_, j) => [OPEN.x + 8 + j * (OPEN.w - 16) / 15, OPEN.y + 12 + i * 18 + Math.sin(j * 0.9 + i * 2) * 2]), WATER_Z, P)).join("")}"/>` +
    `<g data-part="ripples">${[0, 1, 2].map((i) => `<path class="ripple" data-part="ripple${i}" opacity="0"/>`).join("")}</g></g>`);
  o.push(g("m-pool", L(k.planOutline(k.insetPlan(POOL, 3), POOL_H, P, 8), { tone: "faint" }) + D(k.corners(POOL, 3).map(([x, y]) => at([x, y, POOL_H])), { size: 0.5, tone: "hi" })));
  // the chute's rest block on the rim
  o.push(g("m-frame", S(k.slabOf({ x: 61, y: CY - 4, w: 4, d: 8, r: 0.3 }, POOL_H, bottomZ(65) - POOL_H, P, 2, 0.2), { tone: "mid" })));
  return o.join("");
}
function chuteLeg() {
  return g("m-frame", S(k.cylinder(LEG_X, CY, 3.2, 0, 1, P, 22, 0.3), { tone: "mid" }) +
    S(k.cylinder(LEG_X, CY, 1.3, 1, bottomZ(LEG_X + 1.3) - 1, P, 16), { tone: "mid", crease: "none" }));
}
const prism = (poly, s0, s1) => G.prismOf(CHUTE, poly, s0, s1, P);
const chuteFloor = () => g("m-frame", S(prism([[-4.6, -1.2], [4.6, -1.2], [4.6, 0], [-4.6, 0]], 0, LEN), { tone: "mid" }) +
  S(prism([[-4.6, 0], [-3.6, 0], [-3.6, 4], [-4.6, 4]], 0, LEN), { tone: "mid" }));
const chuteNear = () => g("m-frame", S(prism([[3.6, 0], [4.6, 0], [4.6, 4], [3.6, 4]], 0, LEN), { tone: "mid" }) +
  D([6, 18, 30].map((s) => at(along(s, 2).map((v, i) => (i === 1 ? CY + 4.6 : v)))), { size: 0.4, tone: "hi" }));

// ---------- the coin: drawn at its start on the chute, moved as a whole ----------
function coin() {
  const F = G.frameAlong(COIN0, [0, 1, 0]);
  const body = S(G.disc(-0.8, 0.8, COIN_R, F, P), { tone: "hi", crease: "faint" });
  const ring = L(G.circleOf(F, 0.8, 2.6, P, 40), { tone: "mid" });
  const [cx, cy, cz] = COIN0, yy = cy + 0.85;
  const zd = k.pathOf([[1.1, 1.2], [-1.1, 1.2], [1.1, -1.2], [-1.1, -1.2]].map(([dx, dz]) => at([cx + dx, yy, cz + dz])));
  return `<g data-part="coin" opacity="0"><g class="m-coin">${body}${ring}<path class="iso-line coin-z" data-tone="mid" data-free="" d="${zd}"/></g></g>`;
}
function clips() {
  // the coin is seen above the pool's near inner rim edge (the whole opening lies above that line, seen from here)
  const e0 = at([20, OPEN.y + OPEN.d, POOL_H]), e1 = at([180, OPEN.y + OPEN.d, POOL_H]);
  const above = `M${f1(e0[0])} ${f1(e0[1])}L${f1(e1[0])} ${f1(e1[1])}L${f1(e1[0])} -200L${f1(e0[0])} -200Z`;
  return `<clipPath id="lo-coin"><path d="${above}"/></clipPath>` +
    `<clipPath id="lo-pool"><path d="${k.planOutline(OPEN, POOL_H, P, 8)}"/></clipPath>`;
}

// ---------- the counter: rack, seals, invoice, till ----------
function counter() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(CTOP, 0, TOP_Z, P)}"/>`);
  o.push(g("m-cab", S(k.slabOf(PLINTH, 0, 3, P, 2, 0.4), { tone: "mid" })));
  const yF = COUNTER.y + COUNTER.d, xF = COUNTER.x + COUNTER.w;
  const inner = [
    L(k.sideSeam(COUNTER, 6, P, 2), { tone: "faint" }),
    ...[[-66, -30], [-24, 10], [16, 38]].map(([x0, x1]) => yRect(x0, x1, yF, 9, 25, "panel-in")),
    yRect(-14, 0, yF, 19, 23.4, "plate-face"),
    kj(sideL(-7, yF, 21.2), "登記", 3, "kj plate-k"),
  ].join("");
  o.push(g("m-cab", S(k.slabOf(COUNTER, 3, TOP_Z - 2.5 - 3, P, 2, 0.4), { tone: "mid", inner })));
  o.push(D([[-14 + 1, yF, 21.2], [-1, yF, 21.2]].map(at), { size: 0.35, tone: "hi" }));
  o.push(D([[xF, COUNTER.y + 3, 25], [xF, yF - 3, 25], [xF, COUNTER.y + 3, 6], [xF, yF - 3, 6]].map(at), { size: 0.45, tone: "hi" }));
  o.push(g("m-top", S(k.slabOf(CTOP, TOP_Z - 2.5, 2.5, P, 3, 0.5), { tone: "mid" })));
  o.push(L(k.planOutline(k.insetPlan(CTOP, 1.4), TOP_Z, P, 3), { tone: "faint" }));
  // seal rack
  o.push(g("m-rack", S(k.slabOf(RACK, TOP_Z, RACK_H, P, 2, 0.5), { tone: "mid", inner: L(k.sideSeam(RACK, TOP_Z + 1.4, P, 2), { tone: "faint" }) })));
  o.push(g("m-rack", L(SEAL_AT.map(([x, y]) => k.ring(x, y, 3.6, SEAL_Z, P, 28)).join(""), { tone: "lo" })));
  SEAL_AT.forEach(([, y], i) => o.push(kj(sideR(RACK.x + RACK.w, y, TOP_Z + 2), SEALS[i].k, 2.6, "kj rack-k")));
  // the invoice
  o.push(g("m-sheet", S(k.slabOf(SHEET, TOP_Z, SH_Z - TOP_Z, P, 2), { tone: "mid", crease: "none" })));
  const z = SH_Z;
  o.push(tx(k.topMatrix([SHEET.x + 4, SHEET.y + 4], z, P), INVOICE, 2.7, { cls: "ui sheet-t", anchor: "start" }));
  o.push(L(k.lineOnTop([SHEET.x + 4, SHEET.y + 6.6], [SHEET.x + 30, SHEET.y + 6.6], z, P), { tone: "lo", free: true }));
  for (const [y, w] of [[4.2, 12], [6.6, 9]]) o.push(L(k.lineOnTop([SHEET.x + SHEET.w - 4 - w, SHEET.y + y], [SHEET.x + SHEET.w - 4, SHEET.y + y], z, P), { tone: "lo", free: true }));
  CIRC.forEach(([x, y], i) => {
    o.push(L(k.ring(x, y, 5.2, z, P, 40), { tone: "mid" }));
    o.push(kj(k.topMatrix([x, y], z, P), SEALS[i].k, 5, "kj ghost-k"));
  });
  // impressions, hidden until pressed
  CIRC.forEach(([x, y], i) => {
    const [cx, cy] = at([x, y, z]);
    o.push(`<g class="imp" data-part="imp${i}" data-cx="${f1(cx)}" data-cy="${f1(cy)}" opacity="0"><g transform="${k.topMatrix([x, y], z, P)} rotate(${[-7, 5, -3][i]})"><circle r="4.6" class="imp-ring"/><circle r="4" class="imp-ring thin"/><text class="kj imp-k" font-size="5.4" text-anchor="middle" dominant-baseline="central">${SEALS[i].k}</text></g></g>`);
  });
  // the fingerprint line, filled in once all three seals are on
  o.push(L(k.lineOnTop([SHEET.x + 4, SHEET.y + 22.4], [SHEET.x + 34, SHEET.y + 22.4], z, P), { tone: "faint", free: true }));
  o.push(tx(k.topMatrix([SHEET.x + 4, SHEET.y + 20.4], z, P), "N", 3, { cls: `ui sheet-n`, anchor: "start", extra: ' data-part="sheetN"' }));
  // the till: payments go in here and out by the chute
  const tInner = [
    L(k.sideSeam(TILL, TOP_Z + 2, P, 2), { tone: "faint" }),
    xRect(TX, MOUTH.y0, MOUTH.y1, MOUTH.z0, MOUTH.z1, "recess"),
    yRect(TILL.x + 4, TILL.x + 16, TILL.y + TILL.d, 34.4, 39.6, "plate-face"),
    kj(sideL(TILL.x + 10, TILL.y + TILL.d, 37), "入金", 2.8, "kj plate-k"),
  ].join("");
  o.push(g("m-till", S(k.slabOf(TILL, TOP_Z, TILL_TOP - TOP_Z, P, 2, 0.5), { tone: "mid", inner: tInner })));
  o.push(`<path class="recess" d="${path([[TILL.x + 6, CY - 0.8, TILL_TOP], [TILL.x + 14, CY - 0.8, TILL_TOP], [TILL.x + 14, CY + 0.8, TILL_TOP], [TILL.x + 6, CY + 0.8, TILL_TOP]])}"/>`);
  o.push(D(k.corners(TILL, 1.6).map(([x, y]) => at([x, y, TILL_TOP])), { size: 0.4, tone: "hi" }));
  return o.join("");
}
function seal(i) {
  const [x, y] = SEAL_AT[i], z = SEAL_Z;
  const o = [];
  o.push(g("m-ink", S(k.cylinder(x, y, 3.1, z, 1.2, P, 30), { tone: "hi" })));
  o.push(g("m-seal", S(k.cylinder(x, y, 2.8, z + 1.2, 11.8, P, 30), { tone: "hi", inner: L(k.sideArc(x, y, 2.8, z + 4, P, 24) + k.sideArc(x, y, 2.8, z + 11.6, P, 24), { tone: "mid" }) })));
  o.push(g("m-seal", S(k.cylinder(x, y, 1.9, z + 13, 1.2, P, 22), { tone: "hi" })));
  o.push(g("m-seal", S(k.cylinder(x, y, 2.5, z + 14.2, 2.8, P, 26, 0.5), { tone: "hi" })));
  o.push(kj(k.topMatrix([x, y], z + 17, P), SEALS[i].k, 2.8, "kj seal-k"));
  return `<g data-part="seal${i}">${o.join("")}</g>`;
}

// ---------- the try desk: one invoice, sold twice ----------
function tryDesk() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(TRY_TOP_PLAN, 0, TRY_Z, P)}"/>`);
  const yF = TRY.y + TRY.d;
  const inner = [
    L(k.sideSeam(TRY, 4, P, 2), { tone: "faint" }),
    yRect(TRY.x + 4, TRY.x + 22, yF, 5, 14, "panel-in"),
    yRect(TRY.x + 26, TRY.x + 46, yF, 7.6, 13.4, "plate-face"),
    kj(sideL(TRY.x + 31, yF, 10.5), "試", 4.2, "kj plate-k"),
    tx(sideL(TRY.x + 35, yF, 10.5), "TRY", 2, { cls: "ui plate-text", anchor: "start", i18n: "fig.try" }),
  ].join("");
  o.push(g("m-cab", S(k.slabOf(TRY, 0, TRY_Z - 2, P, 2, 0.4), { tone: "mid", inner })));
  o.push(g("m-top", S(k.slabOf(TRY_TOP_PLAN, TRY_Z - 2, 2, P, 3, 0.5), { tone: "mid" })));
  const z = TRY_SH_Z;
  for (const [i, SH] of [COPY_A, COPY_B].entries()) {
    o.push(g("m-sheet", S(k.slabOf(SH, TRY_Z, z - TRY_Z, P, 2), { tone: "mid", crease: "none" })));
    o.push(tx(k.topMatrix([SH.x + 3, SH.y + 4], z, P), INVOICE, 2.2, { cls: "ui sheet-t", anchor: "start" }));
    o.push(L(k.lineOnTop([SH.x + 3, SH.y + 6.4], [SH.x + 15, SH.y + 6.4], z, P), { tone: "lo", free: true }));
    o.push(L(k.lineOnTop([SH.x + 3, SH.y + 9], [SH.x + 11, SH.y + 9], z, P), { tone: "lo", free: true }));
    o.push(tx(k.topMatrix([SH.x + 3, SH.y + 21.5], z, P), "", 2.2, { cls: "ui sheet-n on", anchor: "start", extra: ` data-part="tryN${i}"` }));
  }
  // the first copy carries its registration; the second waits for the refusal
  const [ax, ay] = [COPY_A.x + 13, COPY_A.y + 14.5];
  o.push(`<g class="imp" opacity="0.94"><g transform="${k.topMatrix([ax, ay], z, P)} rotate(-6)"><circle r="4.2" class="imp-ring"/><circle r="3.6" class="imp-ring thin"/><text class="kj imp-k" font-size="4.8" text-anchor="middle" dominant-baseline="central">登</text></g></g>`);
  const [bx, by] = [COPY_B.x + 12, COPY_B.y + 14];
  o.push(L(k.ring(bx, by, 5, z, P, 40), { tone: "faint" }));
  const [cx, cy] = at([bx, by, z]);
  o.push(`<g class="imp refuse" data-part="tryStamp" data-cx="${f1(cx)}" data-cy="${f1(cy)}" opacity="0"><g transform="${k.topMatrix([bx, by], z, P)} rotate(9)"><circle r="5.6" class="imp-ring"/><circle r="4.9" class="imp-ring thin"/><text class="kj imp-k" font-size="6.2" text-anchor="middle" dominant-baseline="central">拒</text></g></g>`);
  return o.join("");
}

// ---------- wire ----------
function wire(pts, name) {
  const scr = pts.map(at);
  return `<g class="cable">${k.wireSvg(scr[0], scr[scr.length - 1], { via: scr.slice(1, -1), tone: "mid", size: 0.9 })}` +
    `<circle class="pulse-halo" data-part="${name}Halo" r="3.4" opacity="0"/><circle class="pulse" data-part="${name}" r="1.6" opacity="0"/></g>`;
}
// ---------- the lobby: a floor spot, a hit hull and a pin anchor per room ----------
const PANE_BOX = (R) => ({ x: R.x0 - 1.4, y: YB, w: R.x1 - R.x0 + 2.8, d: 2.4, z0: R.z0 - 1.4, z1: R.z1 + 1.4 });
const ROOMS = [
  // painter's order for the hulls: back to front, so a nearer room takes the pointer first
  { id: "outsider", spot: { x: -136, y: -114, w: 86, d: 16, r: 4 }, hull: [PANE_BOX(SCR)], pin: [(SCR.x0 + SCR.x1) / 2, YB, BF_Z[1]] },
  { id: "verify", spot: { x: -50, y: -114, w: 44, d: 16, r: 4 }, hull: [PANE_BOX(VFY)], pin: [(VFY.x0 + VFY.x1) / 2, YB, BF_Z[1]] },
  { id: "rates", spot: { x: -6, y: -114, w: 44, d: 16, r: 4 }, hull: [PANE_BOX(RATE)], pin: [(RATE.x0 + RATE.x1) / 2, YB, BF_Z[1]] },
  { id: "financier", spot: { x: -140, y: -46, w: 26, d: 46, r: 6 }, hull: [{ x: XL - 6, y: -44, w: 8, d: 42, z0: 0, z1: 64 }, { x: XL, y: -40, w: 20, d: 34, z0: 0, z1: 1 }], pin: [XL, -23, 63.4] },
  { id: "member", spot: { x: 54, y: -36, w: 92, d: 86, r: 12 }, hull: [{ x: POOL.x, y: POOL.y, w: POOL.w, d: POOL.d, z0: 0, z1: POOL_H }, { x: 44, y: CY - 5, w: 20, d: 10, z0: 0, z1: 36 }], pin: [100, 7, POOL_H] },
  { id: "buyer", spot: { x: 18, y: 14, w: 32, d: 46, r: 6 }, hull: [{ x: 20, y: FY - 2, w: 26, d: 30, z0: 0, z1: TILL_TOP }], pin: [34, FY + 13, TILL_TOP] },
  { id: "supplier", spot: { x: -78, y: 12, w: 94, d: 50, r: 8 }, hull: [{ x: -72, y: FY - 2, w: 92, d: 30, z0: 0, z1: SEAL_Z + 17 }], pin: [-24, FY + 2, SH_Z] },
  { id: "try", spot: { x: -142, y: 47, w: 66, d: 42, r: 8 }, hull: [{ x: -137, y: 52, w: 56, d: 33, z0: 0, z1: TRY_Z + 2 }], pin: [-108.5, 56, TRY_SH_Z] },
];
function hullOf(boxes) {
  const pts = boxes.flatMap((b) => k.boxCorners(b, b.z0, b.z1).map(at)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  const ring = [...half(pts), ...half([...pts].reverse())];
  return "M" + ring.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L") + "Z";
}
const spots = () => `<g class="spots">${ROOMS.map((r) => `<path class="spot" data-room="${r.id}" d="${k.planOutline(r.spot, 0.2, P, 6)}"/>`).join("")}</g>`;
const hits = () => `<g class="hits">${ROOMS.map((r) => `<path class="hit" data-room="${r.id}" d="${hullOf(r.hull)}"/>`).join("")}</g>`;
const ANCHORS = Object.fromEntries(ROOMS.map((r) => {
  const [x, y] = at(r.pin);
  return [r.id, [Math.round((x / WIDTH) * 1e4) / 100, Math.round((y / HEIGHT) * 1e4) / 100]];
}));

// ---------- assemble ----------
const GEOMETRY = {
  P, door: DOOR, doorMax: DOOR_MAX, sealAt: SEAL_AT, circ: CIRC, w1: W1,
  chute: { a: A, ax: AX, vup: VUP, len: LEN, coinR: COIN_R, coin0: COIN0 },
  waterZ: WATER_Z, land: LAND, lift: 7, press: SH_Z - SEAL_Z,
};
const round = (v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
const geometry = JSON.stringify(GEOMETRY, (_, v) => round(v)).replace(/"/g, "&quot;");

const body = [
  `<defs>${clips()}</defs>`,
  base(),
  spots(),
  backWall(),
  board(),
  wire(W1, "pulse1"),
  leftWall(),
  doorPanel(),
  chuteLeg(),
  pool(),
  counter(),
  `<g data-part="seals">${[0, 1, 2].map(seal).join("")}</g>`,
  chuteFloor(),
  `<g clip-path="url(#lo-coin)">${coin()}</g>`,
  chuteNear(),
  tryDesk(),
  hits(),
].join("");

const LABEL = "The registry office, as the app's directory. A side desk holds two copies of the same invoice, TES-INV-0003; the copy is stamped refused (try). At the counter the invoice is sealed by the supplier 売, the buyer 買 and the financier 融 (supplier); payments go into the till (buyer). Only its fingerprint N travels by wire to the back wall, where one frame holds the public board with N and block only (what outsiders see), the check that finds the same N twice and refuses the second (verify), and the rate index tubes (rate index). The advance rolls into the deep blue shielded pool (fund member). The door in the left wall leads to the financier console.";
const svg =
  `<!-- Generated by scripts/figures/lobby-office.build.mjs; do not edit by hand. -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg ro-svg lobby-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${LABEL}" data-geometry="${geometry}">${body.replace(/ data-i18n="[^"]*"/g, "")}</svg>\n`;

for (const bad of [/<script/i, /<style/i, /\sstyle="/i]) if (bad.test(svg)) throw new Error(`lobby-office.svg must not contain ${bad}`);
// the pins: one rule per room, in % of the figure's box (the pins sit over the drawing in HTML)
const pins =
  `/* Generated by scripts/figures/lobby-office.build.mjs; do not edit by hand. Where each room's pin\n` +
  `   stands over the lobby's drawing (src/app/figures/lobby-office.svg), in % of its box. */\n` +
  Object.entries(ANCHORS).map(([id, [x, y]]) => `.lobby .pin[data-room="${id}"] { left: ${x}%; top: ${y}%; }`).join("\n") + "\n";
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
writeFileSync(PINS, pins);
console.log("wrote", OUT, (svg.length / 1024).toFixed(1) + " KB", "and", PINS);
