// Runtime for the lobby's registry office (lobby-office.svg, built by
// scripts/figures/lobby-office.build.mjs; HNK-34.T1). The drawing is static; this moves its parts,
// as src/landing/figures/registry-office.ts does for chapter 6, one room at a time: each room of the
// app has its own motion in the office (the seals press, N goes to the board, the advance sinks into
// the pool, the console door opens, the check stamps the second entry 拒, the rate index is
// scanned). It lights a room's floor spot and pane, and reports pointing and clicks on a room's part
// to the page, which lights the room's pin and directory line and runs the tour. The board's data
// (TES-INV-0003's N and its two blocks) comes from the page. requestAnimationFrame runs only while
// something moves. Colours live in landing.css (.ro-*) and lobby.css (.lobby-svg); only transforms,
// opacities, classes, texts and path data are written here, as attributes.

type Vec2 = [number, number];
type Vec3 = [number, number, number];

import type { Room } from "../lobby-data";
export type { Room };

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  door: { hx: number; hy: number; w: number; t: number; z0: number; z1: number };
  doorMax: number;
  sealAt: Vec2[];
  circ: Vec2[];
  w1: Vec3[];
  chute: { a: Vec3; ax: Vec3; vup: Vec3; len: number; coinR: number; coin0: Vec3 };
  waterZ: number;
  land: Vec2;
  lift: number;
  press: number;
}

/** What the board says about TES-INV-0003, as the office prints it. */
export interface OfficeData {
  /** N's short form, "N 56ed…8450". */
  n: string;
  /** The block of its register entry, and of the second one the board refuses ("4 509 299"). */
  first: string;
  second: string;
}

export interface LobbyOfficeOptions {
  reduced: boolean;
  /** The pointer came onto a room's part. */
  onPoint: (room: Room) => void;
  /** The pointer left a room's part. */
  onLeave: () => void;
  /** A room's part was clicked. */
  onGo: (room: Room) => void;
}

export interface LobbyOffice {
  /** The room's own motion; resolves when it is over (at once with reduced motion). */
  run(room: Room): Promise<void>;
  /** Lights the room's floor spot and pane (null: none). */
  light(room: Room | null): void;
  /** Everything back at rest: seals on the rack, the board line empty, the door shut. */
  reset(): void;
  /** Every room at its end state, the door shut (reduced motion). */
  endState(): void;
  /** The board's data; the texts that show it are written at once. */
  setData(d: OfficeData): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t: number, a: number, b: number) => smooth(clamp((t - a) / (b - a)));
const typed = (full: string, u: number) => (u <= 0 ? "" : full.slice(0, Math.ceil(full.length * clamp(u))));

function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`lobby-office.svg: missing ${sel}`);
  return el;
}

export function mountLobbyOffice(svg: SVGSVGElement, opts: LobbyOfficeOptions): LobbyOffice {
  const { reduced } = opts;
  const G = JSON.parse(svg.dataset.geometry ?? "") as Geometry;
  const { P, door: DOOR, chute: C } = G;
  const cam = (() => {
    const a = (P.azimuth ?? 45) * RAD;
    const e = (P.elevation ?? 30) * RAD;
    return { sa: Math.sin(a), ca: Math.cos(a), se: Math.sin(e), ce: Math.cos(e), k: P.scale * UNIT };
  })();
  const iso = ([x, y, z]: Vec3): Vec2 => [P.origin[0] + (x * cam.sa - y * cam.ca) * cam.k, P.origin[1] + ((x * cam.ca + y * cam.sa) * cam.se - z * cam.ce) * cam.k];
  const move = ([dx, dy, dz]: Vec3) => {
    const o = iso([0, 0, 0]);
    const m = iso([dx, dy, dz]);
    return `translate(${(m[0] - o[0]).toFixed(2)} ${(m[1] - o[1]).toFixed(2)})`;
  };
  const along = (s: number, h: number): Vec3 => [C.a[0] + C.ax[0] * s + C.vup[0] * h, C.a[1], C.a[2] + C.ax[2] * s + C.vup[2] * h];

  const part = <E extends Element = SVGElement>(name: string) => one<E>(svg, `[data-part="${name}"]`);
  const seals = [0, 1, 2].map((i) => part(`seal${i}`));
  const imps = [0, 1, 2].map((i) => part(`imp${i}`));
  const [sheetN, rowN, rowH, rowHl, boardLed, pulse, pulseHalo, coin] = ["sheetN", "rowN", "rowH", "rowHl", "boardLed", "pulse1", "pulse1Halo", "coin"].map((n) => part(n));
  const ripples = [0, 1, 2].map((i) => part(`ripple${i}`));
  const [doorG, doorFace, doorArt, doorTop, doorEdge, openT, lamp, lampGlow] = ["door", "doorFace", "doorArt", "doorTop", "doorEdge", "openT", "lamp", "lampGlow"].map((n) => part(n));
  const [vRow1, vStamp, tryStamp, rateScan] = ["vRow1", "vStamp", "tryStamp", "rateScan"].map((n) => part(n));
  const [vN, v1, v2, tryN0, tryN1] = ["vN", "v1", "v2", "tryN0", "tryN1"].map((n) => part(n));

  const text = (el: Element, s: string) => void (el.textContent !== s && (el.textContent = s));
  const flag = (el: Element, cls: string, on: boolean) => el.classList.toggle(cls, on);
  const op = (el: Element, v: number) => el.setAttribute("opacity", v.toFixed(3));

  let data: OfficeData = { n: "", first: "", second: "" };
  let ended = false;
  let alive = true;

  // ---- drawing helpers (as registry-office.ts) ----
  function placeSeal(i: number, u: number) {
    const [sx, sy] = G.sealAt[i];
    const [cx, cy] = G.circ[i];
    const { lift: LIFT, press: PRESS } = G;
    const go = u <= 0 ? 0 : span(u, 0.18, 0.45) - span(u, 0.7, 0.9);
    const dz = u <= 0 ? 0 : LIFT * span(u, 0, 0.18) + (PRESS - LIFT) * span(u, 0.45, 0.55) + (LIFT - PRESS) * span(u, 0.62, 0.7) - LIFT * span(u, 0.9, 1);
    seals[i].setAttribute("transform", move([(cx - sx) * go, (cy - sy) * go, dz]));
  }
  function landImp(i: number, u: number) {
    const el = imps[i];
    const cx = Number(el.getAttribute("data-cx"));
    const cy = Number(el.getAttribute("data-cy"));
    const s = 1 + 0.18 * (1 - smooth(clamp(u)));
    if (u > 0 && u < 1) el.setAttribute("transform", `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`);
    else el.removeAttribute("transform");
    op(el, 0.94 * clamp(u * 3));
  }
  const W = G.w1;
  const wireLen = W.slice(1).map((p, i) => Math.hypot(p[0] - W[i][0], p[1] - W[i][1], p[2] - W[i][2]));
  const wireTotal = wireLen.reduce((a, b) => a + b, 0);
  function placePulse(u: number) {
    if (u <= 0 || u >= 1) {
      op(pulse, 0);
      op(pulseHalo, 0);
      return;
    }
    let s = u * wireTotal;
    let i = 0;
    while (i < wireLen.length - 1 && s > wireLen[i]) s -= wireLen[i++];
    const f = clamp(s / wireLen[i]);
    const q = iso(W[i].map((v, j) => lerp(v, W[i + 1][j], f)) as Vec3);
    for (const el of [pulse, pulseHalo]) {
      el.setAttribute("cx", q[0].toFixed(1));
      el.setAttribute("cy", q[1].toFixed(1));
    }
    op(pulse, 1);
    op(pulseHalo, 0.35);
  }
  function placeCoin(p: Vec3, o: number) {
    coin.setAttribute("transform", move([p[0] - C.coin0[0], p[1] - C.coin0[1], p[2] - C.coin0[2]]));
    op(coin, o);
  }
  function ringPath(cx: number, cy: number, r: number) {
    let d = "";
    for (let j = 0; j <= 40; j++) {
      const a = (j / 40) * Math.PI * 2;
      const q = iso([cx + r * Math.cos(a), cy + r * Math.sin(a), G.waterZ]);
      d += `${j ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }
    return `${d}Z`;
  }
  function placeRipples(u: number) {
    ripples.forEach((el, i) => {
      const v = (u - i * 0.18) / 0.82;
      if (v <= 0 || v >= 1) return op(el, 0);
      el.setAttribute("d", ringPath(G.land[0], G.land[1], 1 + 13 * Math.sqrt(v)));
      op(el, 0.75 * (1 - v));
    });
  }
  function placeDoor(th: number) {
    const s = Math.sin(th);
    const c = Math.cos(th);
    const u: Vec2 = [s, c];
    const n: Vec2 = [c, -s];
    const p = (sv: number, d: number, z: number): Vec3 => [DOOR.hx + sv * u[0] + d * n[0], DOOR.hy + sv * u[1] + d * n[1], z];
    const q = (pts: Vec3[]) => `M${pts.map((v) => iso(v).map((x) => x.toFixed(2)).join(" ")).join("L")}Z`;
    const front = th < Math.PI / 4;
    const off = front ? DOOR.t : 0;
    const o = iso([0, 0, 0]);
    const dir = (v: Vec3): Vec2 => {
      const a = iso(v);
      return [a[0] - o[0], a[1] - o[1]];
    };
    const U0 = dir([0, 1, 0]);
    const U = dir([u[0], u[1], 0]);
    const Z = dir([0, 0, 1]);
    const det = U0[0] * Z[1] - Z[0] * U0[1];
    const inv = [Z[1] / det, -U0[1] / det, -Z[0] / det, U0[0] / det]; // [U0 | Z]^-1, column-major
    const a = U[0] * inv[0] + Z[0] * inv[1];
    const b = U[1] * inv[0] + Z[1] * inv[1];
    const cc = U[0] * inv[2] + Z[0] * inv[3];
    const dd = U[1] * inv[2] + Z[1] * inv[3];
    const A0 = iso([DOOR.hx + DOOR.t, DOOR.hy, 0]);
    const B0 = iso(p(0, off, 0));
    const e = B0[0] - a * A0[0] - cc * A0[1];
    const f = B0[1] - b * A0[0] - dd * A0[1];
    doorFace.setAttribute("d", q([p(0, off, DOOR.z0), p(DOOR.w, off, DOOR.z0), p(DOOR.w, off, DOOR.z1), p(0, off, DOOR.z1)]));
    doorTop.setAttribute("d", q([p(0, 0, DOOR.z1), p(DOOR.w, 0, DOOR.z1), p(DOOR.w, DOOR.t, DOOR.z1), p(0, DOOR.t, DOOR.z1)]));
    doorEdge.setAttribute("d", q([p(DOOR.w, 0, DOOR.z0), p(DOOR.w, DOOR.t, DOOR.z0), p(DOOR.w, DOOR.t, DOOR.z1), p(DOOR.w, 0, DOOR.z1)]));
    doorArt.setAttribute("transform", `matrix(${[a, b, cc, dd, e, f].map((v) => v.toFixed(4)).join(" ")})`);
    flag(doorG, "back", !front);
  }

  // ---- motion: every running step draws itself each frame; rAF only while one runs ----
  type Motion = { t0: number; dur: number; draw: (t: number) => void; resolve: () => void };
  let motions: Motion[] = [];
  let frame = 0;
  const timers = new Set<number>();
  function tick(now: number) {
    frame = 0;
    const live: Motion[] = [];
    for (const m of motions) {
      const t = (now - m.t0) / 1000;
      m.draw(Math.min(t, m.dur));
      if (t >= m.dur) m.resolve();
      else live.push(m);
    }
    motions = live;
    if (motions.length) frame = requestAnimationFrame(tick);
  }
  function play(dur: number, draw: (t: number) => void): Promise<void> {
    if (reduced || !alive) {
      draw(dur);
      return Promise.resolve();
    }
    draw(0);
    return new Promise((resolve) => {
      motions.push({ t0: performance.now(), dur, draw, resolve });
      if (!frame) frame = requestAnimationFrame(tick);
    });
  }
  const wait = (ms: number) =>
    new Promise<void>((r) => {
      if (reduced || !alive) return r();
      const id = window.setTimeout(() => (timers.delete(id), r()), ms);
      timers.add(id);
    });

  // ---- each room's own motion ----
  const seal = (i: number) => play(1.0, (t) => (placeSeal(i, t), landImp(i, (t - 0.53) / 0.12)));
  function fingerprint() {
    flag(sheetN, "on", true);
    return play(0.45, (t) => text(sheetN, typed(data.n, t / 0.45) || "N"));
  }
  function post() {
    return play(1.3, (t) => {
      placePulse(t / 0.8);
      text(rowN, typed(data.n, (t - 0.8) / 0.45));
      text(rowH, typed(data.first, (t - 1.0) / 0.3));
      flag(rowHl, "on", t >= 0.8);
      flag(boardLed, "on", t >= 0.75);
    });
  }
  function advance() {
    const R = C.coinR;
    const start = along(R + 0.4, R);
    const bottom = along(C.len, R);
    return play(2.2, (t) => {
      if (t < 0.15) placeCoin(start, span(t, 0, 0.15));
      else if (t < 0.85) placeCoin(along(lerp(R + 0.4, C.len, clamp((t - 0.15) / 0.7) ** 2), R), 1);
      else if (t < 1.15) {
        const v = clamp((t - 0.85) / 0.3);
        placeCoin([bottom[0] + (G.land[0] - bottom[0]) * v, bottom[1], lerp(bottom[2], G.waterZ, v * v)], 1);
      } else {
        const v = clamp((t - 1.15) / 0.55);
        placeCoin([G.land[0], G.land[1], G.waterZ - 6 * v], 1 - v);
      }
      placeRipples((t - 1.15) / 1.0);
    });
  }
  function open() {
    flag(openT, "on", true);
    flag(lamp, "on", true);
    return play(1.6, (t) => (op(lampGlow, 0.32 * span(t, 0, 0.3)), placeDoor(G.doorMax * span(t, 0.25, 1.35))));
  }
  /** A stamp lands: CSS carries it from a wide hover to its place (snapSettle). */
  async function stamp(el: Element) {
    el.classList.remove("on");
    void el.getBoundingClientRect();
    await wait(60);
    el.classList.add("on");
    await wait(420);
  }
  async function verify() {
    flag(vRow1, "on", true);
    await wait(500);
    await stamp(vStamp);
  }
  function scan() {
    const w = 36.6;
    return play(1.5, (t) => {
      const u = span(t, 0, 1.4);
      rateScan.setAttribute("transform", move([w * u, 0, 0]));
      op(rateScan, t >= 1.5 ? 0 : 0.85 * Math.sin(Math.PI * clamp(u)) ** 0.4);
    });
  }
  const RUN: Record<Room, () => Promise<void>> = {
    supplier: () => seal(0),
    buyer: () => seal(1),
    financier: async () => {
      await seal(2);
      await open();
    },
    outsider: async () => {
      await fingerprint();
      await post();
    },
    member: () => advance(),
    verify: () => verify(),
    try: () => stamp(tryStamp),
    rates: () => scan(),
  };

  function reset() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    motions.splice(0).forEach((m) => m.resolve());
    ended = false;
    for (let i = 0; i < 3; i++) {
      placeSeal(i, 0);
      landImp(i, 0);
    }
    text(sheetN, "N");
    text(rowN, "");
    text(rowH, "");
    placePulse(0);
    placeCoin(C.coin0, 0);
    placeRipples(0);
    op(lampGlow, 0);
    placeDoor(0);
    op(rateScan, 0);
    for (const el of [sheetN, rowHl, boardLed, openT, lamp, vRow1, vStamp, tryStamp]) el.classList.remove("on");
  }
  function endState() {
    ended = true;
    for (let i = 0; i < 3; i++) landImp(i, 1);
    flag(sheetN, "on", true);
    text(sheetN, data.n || "N");
    text(rowN, data.n);
    text(rowH, data.first);
    for (const el of [rowHl, boardLed, vRow1, vStamp, tryStamp]) el.classList.add("on");
  }
  function setData(d: OfficeData) {
    data = d;
    for (const el of [vN, tryN0, tryN1]) text(el, d.n);
    text(v1, d.first);
    text(v2, d.second);
    if (ended) endState();
  }

  // ---- rooms: floor spot and pane light; a part reports pointing and clicks ----
  let lit: Room | null = null;
  function light(room: Room | null) {
    if (lit === room) return;
    if (lit) svg.querySelectorAll(`.spot[data-room="${lit}"], .pane-lit[data-room="${lit}"]`).forEach((el) => el.classList.remove("is-on"));
    lit = room;
    if (room) svg.querySelectorAll(`.spot[data-room="${room}"], .pane-lit[data-room="${room}"]`).forEach((el) => el.classList.add("is-on"));
  }
  const roomOf = (e: Event) => ((e.target as Element).closest?.(".hit") as SVGElement | null)?.dataset.room as Room | undefined;
  const over = (e: PointerEvent) => {
    const r = roomOf(e);
    if (r) opts.onPoint(r);
  };
  const out = (e: PointerEvent) => {
    if (!roomOf(e)) return;
    const to = (e.relatedTarget as Element | null)?.closest?.(".hit");
    if (!to) opts.onLeave();
  };
  const click = (e: MouseEvent) => {
    const r = roomOf(e);
    if (r) opts.onGo(r);
  };
  svg.addEventListener("pointerover", over);
  svg.addEventListener("pointerout", out);
  svg.addEventListener("click", click);

  reset();
  if (reduced) endState();

  return {
    run: (room) => RUN[room](),
    light,
    reset,
    endState,
    setData,
    destroy() {
      alive = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      motions.splice(0).forEach((m) => m.resolve());
      for (const id of timers) clearTimeout(id);
      timers.clear();
      svg.removeEventListener("pointerover", over);
      svg.removeEventListener("pointerout", out);
      svg.removeEventListener("click", click);
    },
  };
}
