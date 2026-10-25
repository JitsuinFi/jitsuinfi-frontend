// Chapter 5 figure, the buyer's history cabinet (HNK-33.T5): five drawers hold the buyer's history
// certificates #0..#4 (TES-INV-0000..0004), each riveted to the one before by a link plate. A new
// lender's reader runs on a rail above the drawers: each drawer slides out, its certificate rises,
// the lens reads it, the station sends its N to the public board at the back right (where only N
// and a tag appear), the row lights, the station shows ANCHORED, a 済 stamp lands (遅 on a late
// one) and the link lights. At the end the split-flap plate at the back left turns to the tally.
//
// Rebuild (only when the drawing changes; the output is committed):
//   node scripts/figures/history-cabinet.build.mjs
// It needs the anatomy skill kit (iso-kit.mjs, lathe.mjs): ANATOMY_KIT=/path/to/kit overrides
// the default ~/.claude/skills/anatomy/kit. The certificates' dates are real: TES-INV-0000..0004
// from scripts/landing-keys.mjs (the same book as src/landing/History.tsx; #4 was due 14 Aug and
// paid 17 Aug). The two other entries on the board are other parties' real fingerprints
// (jitsuin-wasm, from TES- labels): the board is shared and anonymous.
//
// Output: src/landing/figures/history-cabinet.svg, static markup only. No <script>, no <style>,
// no inline style attributes (the site CSP has no 'unsafe-inline'): every colour comes from the
// .hc-* rules in src/landing/landing.css, which map the kit's --anatomy-* variables onto the DS-PAL
// tokens. The geometry the runtime needs (projection, drawer centres, wires, rail, lens, flaps)
// travels on the root as data-geometry; src/landing/figures/history-cabinet.ts reads it. What the
// chapter computes at runtime (each certificate's N on the board and on the station's screen, the
// stamps, the tally on the flaps) is left empty or at rest here and set by the runtime. Small
// English labels carry data-i18n="<key>" (aria labels: data-i18n-aria) so the chapter can set them
// per language; a date or a number in a label travels as data-i18n-d (ISO date) or data-i18n-n.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT = process.env.ANATOMY_KIT ?? join(homedir(), ".claude/skills/anatomy/kit");
const k = await import(pathToFileURL(join(KIT, "iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "lathe.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "src", "landing", "figures", "history-cabinet.svg");
const WIDTH = 640, HEIGHT = 470;

// ---------- truth ----------
const WASM = join(ROOT, "src", "wasm");
const keys = JSON.parse(execFileSync("node", [join(ROOT, "scripts", "landing-keys.mjs"), WASM], { encoding: "utf8" }));
const iso = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (d) => { const t = new Date(d * 86_400_000); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`; };
// certificates #0..#4: TES-INV-0000..0004, as src/landing/History.tsx books them
const CERTS = keys.history.slice(0, 5).map((h, i) => {
  if (h.invoice_id !== `TES-INV-000${i}`) throw new Error("the buyer's book changed");
  return { due: iso(h.due_date), paid: iso(h.paid), dueText: dm(h.due_date), paidText: dm(h.paid), late: Math.max(0, h.paid - h.due_date) };
});
if (CERTS[4].due !== "2026-08-14" || CERTS[4].paid !== "2026-08-17" || CERTS.some((c, i) => (c.late > 0) !== (i === 4))) throw new Error("the late invoice changed");
// register entries sit on the board at 4 500 000 + 2i (History.tsx posts each settlement at 2i + 1)
const spaced = (h) => h.toLocaleString("en-US").replace(/,/g, " ");
const HEIGHTS = CERTS.map((_, i) => spaced(4_500_000 + 2 * i));
// other parties' entries in between: real fingerprints of two invoices to another buyer
const short = (h) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const w = await import(pathToFileURL(join(WASM, "jitsuin_wasm.js")).href);
w.initSync({ module: readFileSync(join(WASM, "jitsuin_wasm_bg.wasm")) });
const OTHERS = [0, 1].map((j) => {
  const id = `TES-INV-010${j}`;
  const inv = w.invoiceEncode(JSON.stringify({
    invoice_id: id, supplier_pk: w.publicKey(sha("TES-landing-other-supplier")),
    buyer_pk: JSON.parse(w.buyerKeys(sha("TES-landing-other-buyer"), j)).invoice_pk,
    amount_zat: 50000 + 5000 * j, issue_date: 20670 + 9 * j, due_date: 20730 + 9 * j, terms_hash: sha(`${id} terms: 60 days net`),
  }));
  return { n: `N ${short(w.invoiceNullifier(inv))}`, h: spaced(4_500_011 + 2 * j) };
});

// ---------- world (same base plate and camera as chapters 2-4) ----------
const BASE = { x: -150, y: -125, w: 300, d: 225, r: 10 };
const BASE_H = 12, FOOT_H = 5;

// the history cabinet: one row of five drawers along x, fronts facing +y
const CAB = { x: -114, y: -16, w: 216, d: 30, r: 1.5 };
const PLINTH = { x: -116, y: -18, w: 220, d: 34, r: 2 };
const CAP = { x: -116, y: -18, w: 220, d: 34, r: 2 };
const PLINTH_H = 3, CAB_TOP = 42, CAP_T = 2.5;
const YF = CAB.y + CAB.d;                   // the front face, y = 14
const PITCH = 42;
const CX = Array.from({ length: CERTS.length }, (_, i) => -90 + PITCH * i);   // drawer centres
const OPEN_Z = [7, 35], PANEL_Z = [6, 36], PANEL_T = 1.6, OPEN_HW = 17.4, PANEL_HW = 18.4, TRAY_HW = 17;
const TRAY_D = 26, TRAY_Z = 7.5, WALL_TOP = 34;
const OUT_Y = 18;                            // how far a drawer slides out
const RISE = 20;                             // how far the certificate rises out of its drawer
const CARD = { w: 32, t: 0.8, z0: 8 + RISE, z1: 34 + RISE, y: YF - 8 + OUT_Y };   // authored in its final pose
const LINK_Z = [50, 52.8];
const EYE = 14.5;                            // eyelet offset from a card centre

// the lender's reader: a gantry rail high above the drawers (on screen it runs clear of the cabinet
// and the cards), a carriage with a lens on a drop tube, and the check station; the right post
// stands on the station, out past drawer #4, so no card hides behind it
const RAIL = { x: -128, y: 43, w: 262, d: 6, r: 0.6 };
const RAIL_Z = 105, RAIL_T = 3.5;
const POST = { x: -128, y: 43, w: 6, d: 6, r: 0.6 };
const PARK = -108;
const LOOK = 22;                            // the lens sits this far +x of the card it reads, so it shows above it
const CARR = { hw: 6, y: 42.5, d: 7, z0: 98, z1: 105 };
const HEAD_R = 3.4, HEAD_Z = [80, 86], NOZ_Z = 77.5;
const ST = { x: 104, y: 40, w: 36, d: 24, r: 2 };
const ST_H = 22;
const MAST = { x: 128, y: 43, w: 6, d: 6, r: 0.5 };
const MX = MAST.x + MAST.w / 2;
const SCR = { x0: 107, x1: 129, z0: 3.6, z1: 19 };

// public board (back right): the same open ledger as chapters 2 and 4, on a stand
const STAND = { x: 24, y: -118, w: 122, d: 76, r: 3 };
const VT = 16;
const BX = 4, BY = -6;
const COVER = { x: 28 + BX, y: -106 + BY, w: 112, d: 66, r: 2 };
const PAGE_L = { x: 32 + BX, y: -102 + BY, w: 52, d: 58, r: 0.4 };
const PAGE_R = { x: 84 + BX, y: -102 + BY, w: 52, d: 58, r: 0.4 };
const COVER_T = 1.6, PAGE_TOP = VT + 4;
const ROWS = Array.from({ length: 7 }, (_, i) => -91 + BY + i * 7);

// verdict plate (back left)
const VPL = { x: -142, y: -106, w: 68, d: 14, r: 1.5 };
const VPN = { x: -140, y: -102, w: 64, d: 6, r: 0.6 };
const VPL_H = 3.5, VPN_TOP = 36, VY = VPN.y + VPN.d;
const WIN = [[-136, -120], [-116, -100], [-96, -80]];
const WIN_Z = [13, 25];

// wires: station -> board (lookup), station -> verdict plate
const W1 = [[132, ST.y, 5], [132, 34, 0.6], [132, -36, 0.6], [132, STAND.y + STAND.d, 5]];
const W2 = [[110, ST.y, 5], [110, 34, 0.6], [110, -30, 0.6], [-58, -30, 0.6], [-58, -98, 0.6], [VPL.x + VPL.w, -98, 1.8]];

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [RAIL.x, RAIL.y, RAIL_Z + RAIL_T + 2], [RAIL.x + RAIL.w + 2, RAIL.y + RAIL.d, RAIL_Z + RAIL_T + 2], [VPN.x, VPN.y, VPN_TOP + 4]],
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
const yRect = (x0, x1, y, z0, z1, cls) => `<path class="${cls}" d="${yFace(x0, x1, y, z0, z1)}"/>`;
const sideL = (x, y, z) => k.sideMatrix([x, y], z, P, "left");
const hanko = (m, ch, r, rot) => `<g transform="${m} rotate(${rot})"><circle r="${r}" class="hanko-ring"/><circle r="${(r * 0.85).toFixed(2)}" class="hanko-ring thin"/><text class="kj hanko-k" font-size="${(r * 1.1).toFixed(2)}" text-anchor="middle" dominant-baseline="central">${ch}</text></g>`;
// convex hull of screen points (monotone chain): the clip of a drawer's travel
function hull(pts) {
  const p = pts.map(at).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return k.pathOf(lo.slice(0, -1).concat(up.slice(0, -1)), true);
}
const boxPts = (x0, x1, y0, y1, z0, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];

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
  // label plate, front left
  const plate = { x: -136, y: 64, w: 34, d: 20, r: 1.5 };
  o.push(S(k.slabOf(plate, 0, 0.8, P, 3, 0.4), { tone: "mid" }));
  for (const [y, w] of [[69, 22], [74, 16], [79, 19]]) o.push(L(k.lineOnTop([plate.x + 5, y], [plate.x + 5 + w, y], 0.8, P), { tone: "lo", free: true }));
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
  // wire gland on the +y face, where the station's lookup line comes in
  o.push(g("m-stand", S(G.disc(0, 1.6, 2.4, G.frameAlong([W1[3][0], yF, W1[3][2]], [0, 1, 0]), P), { tone: "mid" })));
  // ledger: cover, pages
  o.push(g("m-cover", S(k.slabOf(COVER, VT, COVER_T, P, 3, 0.4), { tone: "mid" })));
  for (const pg of [PAGE_L, PAGE_R]) {
    const pin = L(k.sideSeam(pg, VT + COVER_T + 0.8, P, 2) + k.sideSeam(pg, VT + COVER_T + 1.6, P, 2), { tone: "faint" });
    o.push(g("m-page", S(k.slabOf(pg, VT + COVER_T, PAGE_TOP - VT - COVER_T, P, 2), { tone: "mid", inner: pin })));
  }
  const z = PAGE_TOP;
  // highlight bands under each certificate's entry (lit as the reader finds it)
  const band = (r) => path([[PAGE_L.x + 0.6, ROWS[r] - 5.6, z], [PAGE_R.x + PAGE_R.w - 0.6, ROWS[r] - 5.6, z], [PAGE_R.x + PAGE_R.w - 0.6, ROWS[r] + 0.4, z], [PAGE_L.x + 0.6, ROWS[r] + 0.4, z]]);
  CERTS.forEach((_, i) => o.push(`<path class="row-hl" data-part="hl${i}" d="${band(i)}"/>`));
  // spine, margin rules, ruled lines (each runs edge to edge)
  const sx = PAGE_L.x + PAGE_L.w;
  o.push(L(k.lineOnTop([sx, PAGE_L.y], [sx, PAGE_L.y + PAGE_L.d], z, P), { tone: "mid" }));
  o.push(L(k.lineOnTop([PAGE_L.x + 7, PAGE_L.y], [PAGE_L.x + 7, PAGE_L.y + PAGE_L.d], z, P) + k.lineOnTop([PAGE_R.x + 32, PAGE_R.y], [PAGE_R.x + 32, PAGE_R.y + PAGE_R.d], z, P), { tone: "lo", className: "margin" }));
  o.push(L(ROWS.map((y) => k.lineOnTop([PAGE_L.x, y], [PAGE_L.x + PAGE_L.w, y], z, P) + k.lineOnTop([PAGE_R.x, y], [PAGE_R.x + PAGE_R.w, y], z, P)).join(""), { tone: "faint" }));
  const cl = PAGE_L.x + 10, cr = PAGE_R.x + 4;
  o.push(tx(k.topMatrix([cl, ROWS[0] - 8.4], z, P), "PUBLIC BOARD", 2.6, { cls: "ui board-head", anchor: "start", i18n: "fp.fig.board" }));
  o.push(tx(k.topMatrix([cr, ROWS[0] - 8.4], z, P), "BLOCK", 2.6, { cls: "ui board-head", anchor: "start", i18n: "hs.fig.block" }));
  ROWS.forEach((y, i) => o.push(tx(k.topMatrix([PAGE_L.x + 3.5, y - 2.6], z, P), String(i + 1), 2.4, { cls: "ui row-no", extra: i < CERTS.length ? ` data-part="rowNo${i}"` : "" })));
  // the buyer's register entries: N and a tag, nothing else; inked at runtime as each is posted
  CERTS.forEach((_, i) => {
    o.push(`<g class="entry-row" data-part="row${i}">` +
      tx(k.topMatrix([cl, ROWS[i] - 2.6], z, P), "", 4.2, { cls: "ui entry-n", anchor: "start", extra: ' data-n=""' }) +
      tx(k.topMatrix([cr, ROWS[i] - 2.6], z, P), HEIGHTS[i], 3, { cls: "ui entry-h", anchor: "start" }) +
      tx(k.topMatrix([cr + 15.5, ROWS[i] - 2.6], z, P), "· tag", 3, { cls: "ui entry-tag", anchor: "start", i18n: "hs.fig.tag" }) + `</g>`);
  });
  // other people's entries in between: the board is shared and anonymous
  OTHERS.forEach((e, j) => {
    const r = CERTS.length + j;
    o.push(tx(k.topMatrix([cl, ROWS[r] - 2.6], z, P), e.n, 4.2, { cls: "ui entry-n old", anchor: "start" }));
    o.push(tx(k.topMatrix([cr, ROWS[r] - 2.6], z, P), e.h, 3, { cls: "ui entry-h", anchor: "start" }));
  });
  // ribbon bookmark over the near edge of the right page
  const rx = PAGE_R.x + 44, ny = PAGE_R.y + PAGE_R.d;
  o.push(`<path class="ribbon" d="${path([[rx, ny - 20, z], [rx + 2, ny - 20, z], [rx + 2, ny, z], [rx + 2, ny + 0.2, VT + 0.6], [rx + 2, ny + 3.6, VT + COVER_T], [rx, ny + 3.6, VT + COVER_T], [rx, ny + 0.2, VT + 0.6], [rx, ny, z]])}"/>`);
  return o.join("");
}

// ---------- verdict plate ----------
function verdict() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(VPL, 0, VPN_TOP, P)}"/>`);
  o.push(g("m-booth", S(k.slabOf(VPL, 0, VPL_H, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(VPL, 1.4, P, 3), { tone: "faint" }) })));
  // wire gland on the plinth's +x face
  o.push(g("m-booth", S(G.disc(0, 1.4, 1.9, G.frameAlong([VPL.x + VPL.w, -98, 1.8], [1, 0, 0]), P), { tone: "mid" })));
  const face = [];
  face.push(tx(sideL(VPN.x + 3, VY, 31.2), "HISTORY", 2.5, { cls: "ui plate-text", anchor: "start", i18n: "hs.fig.history" }));
  face.push(tx(sideL(VPN.x + VPN.w - 3, VY, 31.2), "履歴", 4.4, { cls: "kj vp-k", anchor: "end" }));
  face.push(L(k.segment([VPN.x + 2.4, VY, 28.2], [VPN.x + VPN.w - 2.4, VY, 28.2], P), { tone: "lo" }));
  face.push(D([[VPN.x + 2.4, VY, 28.2], [VPN.x + VPN.w - 2.4, VY, 28.2]].map(at), { size: 0.45, tone: "hi" }));
  const labels = [["on time", "hs.fig.onTime", ""], ["late", "hs.fig.late", " late"], ["defaulted", "hs.fig.defaulted", ""]];
  WIN.forEach(([x0, x1], i) => {
    face.push(yRect(x0 - 1.2, x1 + 1.2, VY, WIN_Z[0] - 1.2, WIN_Z[1] + 1.2, "bezel"));
    face.push(yRect(x0, x1, VY, WIN_Z[0], WIN_Z[1], "screen"));
    face.push(tx(sideL((x0 + x1) / 2, VY, 8.6), labels[i][0], 2.1, { cls: `ui vp-label${labels[i][2]}`, i18n: labels[i][1] }));
  });
  o.push(g("m-booth", S(k.slabOf(VPN, VPL_H, VPN_TOP - VPL_H, P, 2, 0.5), { tone: "mid", inner: face.join("") })));
  // the flaps: a digit each, hinged across the middle of its window; the runtime turns them
  WIN.forEach(([x0, x1], i) => {
    const cx = (x0 + x1) / 2, cz = (WIN_Z[0] + WIN_Z[1]) / 2;
    o.push(`<g data-part="flap${i}"><g data-part="flapIn${i}">${tx(sideL(cx, VY, cz), "–", 9.6, { cls: `ui flap-d${i === 1 ? " late" : ""}`, extra: ` data-part="digit${i}"` })}</g></g>`);
    o.push(L(k.segment([x0 - 1.2, VY, cz], [x1 + 1.2, VY, cz], P), { tone: "lo", className: "hinge" }));
  });
  const sc = [[VPN.x + 1.6, 3.2 + VPL_H], [VPN.x + VPN.w - 1.6, 3.2 + VPL_H], [VPN.x + 1.6, VPN_TOP - 1.6], [VPN.x + VPN.w - 1.6, VPN_TOP - 1.6]];
  o.push(D(sc.map(([x, z]) => at([x, VY, z])), { size: 0.45, tone: "hi" }));
  return o.join("");
}

// ---------- cabinet ----------
function cabinet() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, 0, CAB_TOP + CAP_T, P)}"/>`);
  o.push(g("m-cab", S(k.slabOf(PLINTH, 0, PLINTH_H, P, 3, 0.6), { tone: "mid" })));
  const xF = CAB.x + CAB.w;
  const inner = [
    L(k.sideSeam(CAB, PLINTH_H + 2, P, 3) + k.sideSeam(CAB, CAB_TOP - 3, P, 3), { tone: "faint" }),
    // drawer openings: the dark recess each drawer slides out of
    ...CX.map((c) => `<path class="recess" d="${yFace(c - OPEN_HW, c + OPEN_HW, YF, OPEN_Z[0], OPEN_Z[1])}"/>`),
    // stiles between the openings
    L(CX.slice(1).map((c) => k.rise([c - PITCH / 2, YF, 0], PLINTH_H + 2, CAB_TOP - 3, P)).join(""), { tone: "faint" }),
    // nameplate on the +x face: the buyer's seal
    `<path class="plate-face" d="${xFace(xF, -10, 8, 18, 34)}"/>`,
    hanko(k.sideMatrix([xF, -1], 27.6, P, "right"), "買", 4, -6),
    tx(k.sideMatrix([xF, -1], 20.6, P, "right"), "BUYER", 1.8, { cls: "ui plate-text", i18n: "hs.fig.buyer" }),
  ].join("");
  o.push(g("m-cab", S(k.slabOf(CAB, PLINTH_H, CAB_TOP - PLINTH_H, P, 3, 0.6), { tone: "mid", inner })));
  o.push(D([[xF, -8.6, 19.2], [xF, 6.6, 19.2], [xF, -8.6, 32.8], [xF, 6.6, 32.8], [xF, CAB.y + 3, PLINTH_H + 4], [xF, YF - 3, PLINTH_H + 4]].map(at), { size: 0.4, tone: "hi" }));
  o.push(D([[CAB.x + 3, YF, CAB_TOP - 1.5], [xF - 3, YF, CAB_TOP - 1.5], [CAB.x + 3, YF, PLINTH_H + 1], [xF - 3, YF, PLINTH_H + 1]].map(at), { size: 0.45, tone: "hi" }));
  // cap, with an index plate and a lock on top
  o.push(g("m-cab", S(k.slabOf(CAP, CAB_TOP, CAP_T, P, 3, 0.6), { tone: "mid" })));
  const zt = CAB_TOP + CAP_T;
  o.push(L(k.planOutline(k.insetPlan(CAP, 3), zt, P, 3), { tone: "faint" }));
  const IP = { x: -40, y: -11, w: 56, d: 20, r: 1.2 };
  const ipInner = L(k.planOutline(k.insetPlan(IP, 1.6), zt + 0.8, P, 2), { tone: "lo" });
  o.push(g("m-drawer", S(k.slabOf(IP, zt, 0.8, P, 2, 0.3), { tone: "mid", inner: ipInner })));
  o.push(kj(k.topMatrix([IP.x + 14, IP.y + 10], zt + 0.8, P), "履歴", 8.4, "kj top-k"));
  o.push(tx(k.topMatrix([IP.x + 29, IP.y + 8], zt + 0.8, P), "CERTIFICATES", 2.3, { cls: "ui plate-text", anchor: "start", i18n: "hs.fig.certs" }));
  o.push(tx(k.topMatrix([IP.x + 29, IP.y + 12.6], zt + 0.8, P), "#0 – #4", 2.9, { cls: "ui plate-b", anchor: "start" }));
  o.push(D(k.corners(IP, 1).map(([x, y]) => at([x, y, zt + 0.8])), { size: 0.4, tone: "hi" }));
  o.push(g("m-cab", S(k.cylinder(70, -1, 3, zt, 1.2, P, 22, 0.3), { tone: "mid" })));
  o.push(L(k.segment([70 - 1.2, -1, zt + 1.2], [70 + 1.2, -1, zt + 1.2], P), { tone: "hi", className: "keyway", free: true }));
  o.push(D(k.corners(CAP, 3).map(([x, y]) => at([x, y, zt])), { size: 0.5, tone: "hi" }));
  return o.join("");
}

// ---------- drawers and certificates ----------
function clips() {
  return CX.map((c, i) =>
    `<clipPath id="hc-tray${i}"><path d="${hull(boxPts(c - OPEN_HW, c + OPEN_HW, YF, YF + OUT_Y + 6, OPEN_Z[0], OPEN_Z[1]))}"/></clipPath>` +
    `<clipPath id="hc-panel${i}"><path d="${hull(boxPts(c - PANEL_HW - 0.6, c + PANEL_HW + 0.6, YF, YF + OUT_Y + 8, PANEL_Z[0] - 0.6, PANEL_Z[1] + 0.6))}"/></clipPath>`).join("");
}
function trayBack(i) {
  const c = CX[i], y0 = YF - TRAY_D;
  const o = [];
  o.push(g("m-drawer", S(k.slabOf({ x: c - TRAY_HW, y: y0, w: 2 * TRAY_HW, d: TRAY_D, r: 0.3 }, TRAY_Z - 0.8, 0.8, P, 2), { tone: "mid", crease: "none" })));
  o.push(g("m-drawer", S(k.slabOf({ x: c - TRAY_HW, y: y0, w: 2 * TRAY_HW, d: 1, r: 0.2 }, TRAY_Z, WALL_TOP - TRAY_Z, P, 2), { tone: "mid" })));
  o.push(g("m-drawer", S(k.slabOf({ x: c - TRAY_HW, y: y0, w: 1, d: TRAY_D, r: 0.2 }, TRAY_Z, WALL_TOP - TRAY_Z, P, 2), { tone: "mid" })));
  // the card's lift slot along the floor
  o.push(L(k.lineOnTop([c - TRAY_HW + 1, YF - 8.9], [c + TRAY_HW - 1, YF - 8.9], TRAY_Z, P), { tone: "lo" }));
  return `<g clip-path="url(#hc-tray${i})"><g data-part="trayB${i}">${o.join("")}</g></g>`;
}
function trayFront(i) {
  const c = CX[i], y0 = YF - TRAY_D;
  const wall = g("m-drawer", S(k.slabOf({ x: c + TRAY_HW - 1, y: y0, w: 1, d: TRAY_D, r: 0.2 }, TRAY_Z, WALL_TOP - TRAY_Z, P, 2), { tone: "mid" }));
  return `<g clip-path="url(#hc-tray${i})"><g data-part="trayF${i}">${wall}</g></g>`;
}
function panel(i) {
  const c = CX[i], yP = YF + PANEL_T;
  const PNL = { x: c - PANEL_HW, y: YF, w: 2 * PANEL_HW, d: PANEL_T, r: 0.4 };
  const inner = [
    yRect(c - 7, c + 7, yP, 25, 31.4, "plate-face"),
    tx(sideL(c, yP, 28.2), "#" + i, 3.8, { cls: "ui plate-b" }),
  ].join("");
  const o = [g("m-drawer", S(k.slabOf(PNL, PANEL_Z[0], PANEL_Z[1] - PANEL_Z[0], P, 2, 0.4), { tone: "mid", inner }))];
  o.push(D([[c - 6.2, yP, 30.8], [c + 6.2, yP, 30.8], [c - 6.2, yP, 25.6], [c + 6.2, yP, 25.6]].map(at), { size: 0.35, tone: "hi" }));
  // pull knob
  const F = G.frameAlong([c, yP, 15], [0, 1, 0]);
  o.push(g("m-drawer", S(G.disc(0, 1.2, 1.4, F, P), { tone: "mid" }) + S(G.disc(1.2, 2.6, 2.4, F, P), { tone: "mid" })));
  return `<g clip-path="url(#hc-panel${i})"><g data-part="panel${i}">${o.join("")}</g></g>`;
}
function card(i) {
  const c = CX[i], cert = CERTS[i], y = CARD.y, x0 = c - CARD.w / 2;
  const PL = { x: x0, y: y - CARD.t, w: CARD.w, d: CARD.t, r: 0.2 };
  const face = [];
  face.push(tx(sideL(c - 12, y, 48.4), "#" + i, 6.4, { cls: "ui card-no", anchor: "start" }));
  face.push(L(k.segment([c - 12, y, 44.8], [c + 3, y, 44.8], P), { tone: "lo", free: true }));
  face.push(tx(sideL(c - 12, y, 42), "due " + cert.dueText, 2.1, { cls: "ui card-due", anchor: "start", i18n: "hs.due", extra: ` data-i18n-d="${cert.due}"` }));
  face.push(tx(sideL(c - 12, y, 38.4), "paid " + cert.paidText, 2.2, { cls: "ui card-line", anchor: "start", i18n: "hs.paidOn", extra: ` data-i18n-d="${cert.paid}"` }));
  face.push(tx(sideL(c - 12, y, 34.6), "with", 2.2, { cls: "ui card-with", anchor: "start", i18n: "hs.fig.with" }));
  // who the invoice was with: shielded, never on the certificate
  face.push(yRect(c - 5.8, c + 3, y, 33.8, 35.4, "shield"));
  // the link eyelets
  face.push(L(G.circleOf(G.frameAlong([c - EYE, y, (LINK_Z[0] + LINK_Z[1]) / 2], [0, 1, 0]), 0, 0.9, P, 16) + G.circleOf(G.frameAlong([c + EYE, y, (LINK_Z[0] + LINK_Z[1]) / 2], [0, 1, 0]), 0, 0.9, P, 16), { tone: "lo" }));
  const o = [g("m-sheet", S(k.slabOf(PL, CARD.z0, CARD.z1 - CARD.z0, P, 2), { tone: "mid", crease: "none", inner: face.join("") }))];
  // the verdict stamp: 済 on time, 遅 late; the runtime sets which from the check
  const [sx, sy] = at([c + 9.6, y, 38]);
  const stamp = `<g transform="translate(${f1(sx)} ${f1(sy)})"><g transform="${k.sideMatrix([0, 0], 0, { ...P, origin: [0, 0] }, "left")}"><g transform="rotate(${-8 + (i % 3) * 5})">` +
    `<rect x="-5" y="-5" width="10" height="10" rx="1.2" class="stamp-box"/><rect x="-4.1" y="-4.1" width="8.2" height="8.2" rx="0.8" class="stamp-fine"/>` +
    `<text class="kj stamp-k" font-size="6.6" text-anchor="middle" dominant-baseline="central" data-k="">済</text></g></g></g>`;
  o.push(`<g class="stamp" data-part="stamp${i}" data-cx="${f1(sx)}" data-cy="${f1(sy)}" opacity="0">${stamp}</g>`);
  if (cert.late) o.push(tx(sideL(c - 12, y, 31), cert.late + " days late", 2, { cls: "ui card-late", anchor: "start", i18n: "hs.late", extra: ` data-i18n-n="${cert.late}"` }));
  return `<g data-part="card${i}" transform="${move([0, -OUT_Y, -RISE])}" opacity="0">${o.join("")}</g>`;
}
function link(i) {
  // the hinge link from certificate i to i-1: a bar riveted through both cards' eyelets
  const xa = CX[i - 1] + 12.5, xb = CX[i] - 12.5, y = CARD.y, zm = (LINK_Z[0] + LINK_Z[1]) / 2;
  const bar = S(k.slabOf({ x: xa, y: y, w: xb - xa, d: 0.6, r: 0.2 }, LINK_Z[0], LINK_Z[1] - LINK_Z[0], P, 2), { tone: "mid" });
  const rivets = [CX[i - 1] + EYE, CX[i] - EYE].map((x) => S(G.disc(0.6, 1.3, 1.25, G.frameAlong([x, y, zm], [0, 1, 0]), P), { tone: "mid" })).join("");
  return `<g class="link" data-part="link${i}" opacity="0">${g("m-link", bar + rivets)}</g>`;
}

// ---------- the reader: posts, carriage, rail, station ----------
function station() {
  const o = [];
  o.push(`<path class="iso-halo" d="${k.haloOf(ST, 0, ST_H, P)}"/>`);
  const yF = ST.y + ST.d, xF = ST.x + ST.w;
  const inner = [
    L(k.sideSeam(ST, ST_H - 2.4, P, 3), { tone: "faint" }),
    yRect(SCR.x0 - 1.4, SCR.x1 + 1.4, yF, SCR.z0 - 1.4, SCR.z1 + 1.4, "bezel"),
    yRect(SCR.x0, SCR.x1, yF, SCR.z0, SCR.z1, "screen"),
    tx(sideL(SCR.x0 + 1.6, yF, SCR.z1 - 2), "BOARD CHECK", 1.7, { cls: "ui scr-label", anchor: "start", i18n: "hs.fig.check" }),
    tx(sideL(SCR.x0 + 1.6, yF, SCR.z1 - 5.6), "#—", 3, { cls: "ui scr-n", anchor: "start", extra: ' data-part="scrNo"' }),
    tx(sideL(SCR.x0 + 1.6, yF, SCR.z1 - 9.6), "N ——", 2.4, { cls: "ui scr-n", anchor: "start", extra: ' data-part="scrN"' }),
    tx(sideL(SCR.x0 + 1.6, yF, SCR.z0 + 2), "ANCHORED", 2.2, { cls: "ui scr-v", anchor: "start", i18n: "hs.fig.anchored", extra: ' data-part="scrV"' }),
    tx(sideL(SCR.x0 + 1.6, yF, SCR.z0 + 2), "NOT SHOWN", 2.2, { cls: "ui scr-v miss", anchor: "start", i18n: "hs.fig.missing", extra: ' data-part="scrX"' }),
    // speaker slots beside the screen, vents on the +x face
    L(Array.from({ length: 4 }, (_, i) => yFace(SCR.x1 + 4 + i * 1.8, SCR.x1 + 4.8 + i * 1.8, yF, 5, 15)).join(""), { tone: "lo" }),
    L(Array.from({ length: 5 }, (_, i) => xFace(xF, ST.y + 4 + i * 3.6, ST.y + 5.4 + i * 3.6, 5, 15)).join(""), { tone: "lo" }),
  ].join("");
  o.push(g("m-reader", S(k.slabOf(ST, 0, ST_H, P, 3, 0.8), { tone: "hi", inner })));
  o.push(D([[SCR.x0 - 0.4, yF, SCR.z0 - 0.4], [SCR.x1 + 0.4, yF, SCR.z0 - 0.4], [SCR.x0 - 0.4, yF, SCR.z1 + 0.4], [SCR.x1 + 0.4, yF, SCR.z1 + 0.4]].map(at), { size: 0.4, tone: "hi" }));
  o.push(D([[xF, ST.y + 3, 2.6], [xF, yF - 3, 2.6], [xF, ST.y + 3, ST_H - 4.4], [xF, yF - 3, ST_H - 4.4]].map(at), { size: 0.5, tone: "hi" }));
  // top: mast collar, two keys, status lamp
  o.push(g("m-reader", S(k.slabOf({ x: MAST.x - 2, y: MAST.y - 2, w: MAST.w + 4, d: MAST.d + 4, r: 0.8 }, ST_H, 1.6, P, 2, 0.3), { tone: "mid" })));
  o.push(D(k.corners({ x: MAST.x - 2, y: MAST.y - 2, w: MAST.w + 4, d: MAST.d + 4 }, 1).map(([x, y]) => at([x, y, ST_H + 1.6])), { size: 0.4, tone: "hi" }));
  for (let c = 0; c < 2; c++) o.push(g("m-key", S(k.slabOf({ x: ST.x + 5 + c * 5, y: yF - 7, w: 3.6, d: 3.6, r: 0.5 }, ST_H, 0.9, P, 2, 0.2), { tone: "mid" })));
  o.push(L(k.planOutline({ x: ST.x + 3.5, y: yF - 8.5, w: 12.6, d: 6.6, r: 1 }, ST_H, P, 2), { tone: "faint" }));
  const [lx, ly] = at([ST.x + 22, yF - 5, ST_H]);
  o.push(`<circle class="pled" data-part="pled" cx="${f1(lx)}" cy="${f1(ly)}" r="${(1.2 * camK).toFixed(2)}"/>`);
  // mast up to the rail
  o.push(g("m-reader", S(k.slabOf(MAST, ST_H + 1.6, RAIL_Z - ST_H - 1.6, P, 2, 0.3), { tone: "hi", inner: L(k.sideSeam(MAST, 46, P, 2) + k.sideSeam(MAST, 76, P, 2), { tone: "faint" }) })));
  return o.join("");
}
function leftPost() {
  const o = [];
  const foot = { x: POST.x - 3, y: POST.y - 3, w: POST.w + 6, d: POST.d + 6, r: 1 };
  o.push(`<path class="iso-halo" d="${k.haloOf(foot, 0, 2, P)}"/>`);
  o.push(g("m-reader", S(k.slabOf(foot, 0, 1.8, P, 2, 0.4), { tone: "mid" })));
  o.push(D(k.corners(foot, 1.4).map(([x, y]) => at([x, y, 1.8])), { size: 0.4, tone: "hi" }));
  o.push(g("m-reader", S(k.slabOf(POST, 1.8, RAIL_Z - 1.8, P, 2, 0.3), { tone: "hi", inner: L(k.sideSeam(POST, 46, P, 2) + k.sideSeam(POST, 76, P, 2), { tone: "faint" }) })));
  return o.join("");
}
function carriage() {
  const c = PARK, o = [];
  const CB = { x: c - CARR.hw, y: CARR.y, w: CARR.hw * 2, d: CARR.d, r: 0.8 };
  // lens head hanging under the carriage: nozzle, body, drop tube, then the block
  o.push(g("m-reader", S(k.cylinder(c, 46, 2, NOZ_Z, HEAD_Z[0] - NOZ_Z, P, 20), { tone: "mid" })));
  o.push(g("m-reader", S(k.cylinder(c, 46, HEAD_R, HEAD_Z[0], HEAD_Z[1] - HEAD_Z[0], P, 26, 0.3), { tone: "hi", inner: L(k.sideArc(c, 46, HEAD_R, HEAD_Z[0] + 2, P, 22), { tone: "faint" }) })));
  o.push(g("m-reader", S(k.cylinder(c, 46, 1.5, HEAD_Z[1], CARR.z0 - HEAD_Z[1], P, 16), { tone: "mid", inner: L(k.sideArc(c, 46, 1.5, HEAD_Z[1] + 4, P, 12), { tone: "faint" }) })));
  o.push(g("m-reader", S(k.slabOf(CB, CARR.z0, CARR.z1 - CARR.z0, P, 2, 0.5), { tone: "hi", inner: L(k.sideSeam(CB, CARR.z0 + 2, P, 2), { tone: "faint" }) })));
  o.push(D([[c - 3.5, CB.y + CB.d, CARR.z1 - 2.2], [c + 3.5, CB.y + CB.d, CARR.z1 - 2.2]].map(at), { size: 0.45, tone: "hi" }));
  const [lx, ly] = at([c + 2.4, 46 + 2.4, HEAD_Z[0] + 3.4]);
  o.push(`<circle class="head-led" data-part="headLed" cx="${f1(lx)}" cy="${f1(ly)}" r="${(0.9 * camK).toFixed(2)}"/>`);
  return `<g data-part="carriage">${o.join("")}</g>`;
}
function rail() {
  const o = [];
  const inner = L(k.sideSeam(RAIL, RAIL_Z + 1.2, P, 2), { tone: "faint" });
  o.push(g("m-reader", S(k.slabOf(RAIL, RAIL_Z, RAIL_T, P, 2, 0.4), { tone: "hi", inner })));
  const zt = RAIL_Z + RAIL_T;
  const t = k.topTicks(RAIL.x + 8, RAIL.x + RAIL.w - 8, 4, 5, RAIL.y + RAIL.d, zt, [1.2, 2.2], P);
  o.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  // the certificate positions marked on the rail
  o.push(D(CX.map((c) => at([c, RAIL.y + 1.6, zt])), { size: 0.55, tone: "hi" }));
  o.push(D([[RAIL.x + 3, RAIL.y + 3], [RAIL.x + RAIL.w - 3, RAIL.y + 3]].map(([x, y]) => at([x, y, zt])), { size: 0.45, tone: "hi" }));
  return o.join("");
}
const beam = () => `<g class="beam-g" data-part="beam" opacity="0"><path class="beam"/><path class="scan"/></g>`;

// ---------- wires ----------
const pulse = (name) => `<circle class="pulse-halo" data-part="${name}Halo" r="3.4" opacity="0"/><circle class="pulse" data-part="${name}" r="1.6" opacity="0"/>`;
function wire(pts, name) {
  const scr = pts.map(at);
  return `<g class="cable">${k.wireSvg(scr[0], scr[scr.length - 1], { via: scr.slice(1, -1), tone: "mid", size: 0.9 })}${pulse(name)}</g>`;
}

// ---------- assemble ----------
const GEOMETRY = {
  P, cx: CX, park: PARK, look: LOOK, outY: OUT_Y, rise: RISE, w1: W1, w2: W2,
  railTop: RAIL_Z + RAIL_T + 0.05, railZ: RAIL_Z, mastFront: MAST.y + MAST.d + 0.05, stTop: ST_H + 1.7, mx: MX, lensY: 46,
  lensZ: NOZ_Z, cardY: CARD.y + 0.05, cardHw: CARD.w / 2 - 1, scanZ: [CARD.z1 - 1.5, CARD.z0 + 7],
  win: WIN, winZ: WIN_Z, vy: VY,
};
const round = (v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
const geometry = JSON.stringify(GEOMETRY, (_, v) => round(v)).replace(/"/g, "&quot;");

const drawers = CX.map((_, i) => [trayBack(i), card(i), trayFront(i), panel(i), i > 0 ? link(i) : ""].join("")).join("");
const body = [
  `<defs>${clips()}</defs>`,
  base(),
  verdict(),
  board(),
  wire(W2, "pulse2"), wire(W1, "pulse1"),
  cabinet(),
  drawers,
  beam(),
  station(),
  leftPost(),
  carriage(),
  rail(),
  `<g class="cable">${pulse("pulseG")}</g>`,
].join("");

const LABEL = "The buyer’s history cabinet. Five drawers hold certificates #0 to #4, TES-INV-0000 to 0004, each riveted to the one before. A lender’s reader on a rail above the drawers moves from drawer to drawer: each drawer slides out, its certificate rises, the reader checks it against its entry on the public board at the back, which shows only N and a tag, and a 済 stamp lands on it; certificate #4, paid three days late, gets 遅. Whom each invoice was with is a blank blue bar. A plate at the back turns to the tally: on time, late, defaulted. Click it or press Enter to run it.";
const svg =
  `<!-- Generated by scripts/figures/history-cabinet.build.mjs; do not edit by hand. -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hc-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="button" tabindex="0" aria-label="${LABEL}" data-i18n-aria="hs.fig.aria" data-geometry="${geometry}">${body}</svg>\n`;

for (const bad of [/<script/i, /<style/i, /\sstyle="/i]) if (bad.test(svg)) throw new Error(`history-cabinet.svg must not contain ${bad}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log("wrote", OUT, (svg.length / 1024).toFixed(1) + " KB");
