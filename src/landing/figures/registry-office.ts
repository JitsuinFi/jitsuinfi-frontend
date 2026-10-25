// Runtime for the chapter 6 registry office (registry-office.svg, built by
// scripts/figures/registry-office.build.mjs). The drawing is static; this moves its parts, one step
// at a time, as the chapter tells it: the three seals press in turn (seal), N is written on the
// invoice (fingerprint), N runs by wire to the public board and its line is printed with the block
// (post), the advance rolls down the chute and sinks into the shielded pool (advance), the OPEN lamp
// lights and the door to the console swings open (open). No state of its own about the invoice: N
// and the block come from the chapter. Each step resolves when its motion is over.
// requestAnimationFrame runs only while something moves. Colours live in landing.css (.ro-*); only
// transforms, opacities, classes, texts and path data are written here, as attributes.

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Door {
  hx: number;
  hy: number;
  w: number;
  t: number;
  z0: number;
  z1: number;
}

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  door: Door;
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

export interface RegistryOfficeOptions {
  reduced: boolean;
  /** The visitor pressed the office (click, or Enter/Space with the figure focused). */
  onPress: () => void;
}

export interface RegistryOffice {
  /** Seal i (0 売, 1 買, 2 融) lifts off the rack, presses its circle on the invoice and goes home. */
  seal(i: number): Promise<void>;
  /** N is written on the sealed invoice. */
  fingerprint(nShort: string): Promise<void>;
  /** N runs by wire to the public board; its line is printed with the block and lights. */
  post(nShort: string, block: string): Promise<void>;
  /** The advance rolls out of the till, down the chute, and sinks into the shielded pool. */
  advance(): Promise<void>;
  /** The OPEN lamp lights and the door to the console swings open. */
  open(): Promise<void>;
  /** Everything back at rest: seals on the rack, no impressions, the board line empty, the door shut. */
  reset(): void;
  /** Texts for [data-i18n] and aria labels for [data-i18n-aria], by key. */
  setLabels(map: Record<string, string>): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));
/** The first part of `full`, as if typed: u from 0 (nothing) to 1 (all of it). */
const typed = (full: string, u: number) => (u <= 0 ? "" : full.slice(0, Math.ceil(full.length * clamp(u))));

function geometryOf(svg: SVGSVGElement): Geometry {
  const raw = svg.dataset.geometry;
  if (!raw) throw new Error("registry-office: the svg has no data-geometry");
  return JSON.parse(raw) as Geometry;
}

const all = <E extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll<E>(sel)];
function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`registry-office: missing ${sel}`);
  return el;
}

/** One moving step: a timeline of `dur` seconds drawn by `draw(t)`. */
type Motion = { t0: number; dur: number; draw: (t: number) => void; resolve: () => void };

export function mountRegistryOffice(svg: SVGSVGElement, opts: RegistryOfficeOptions): RegistryOffice {
  const G = geometryOf(svg);
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

  const part = <E extends Element>(name: string) => one<E>(svg, `[data-part="${name}"]`);
  const seals = [0, 1, 2].map((i) => part<SVGGElement>(`seal${i}`));
  const imps = [0, 1, 2].map((i) => part<SVGGElement>(`imp${i}`));
  const sheetN = part<SVGTextElement>("sheetN");
  const rowN = part<SVGTextElement>("rowN");
  const rowH = part<SVGTextElement>("rowH");
  const rowHl = part<SVGPathElement>("rowHl");
  const boardLed = part<SVGCircleElement>("boardLed");
  const pulse = part<SVGCircleElement>("pulse1");
  const pulseHalo = part<SVGCircleElement>("pulse1Halo");
  const coin = part<SVGGElement>("coin");
  const ripples = [0, 1, 2].map((i) => part<SVGPathElement>(`ripple${i}`));
  const doorG = part<SVGGElement>("door");
  const doorFace = part<SVGPathElement>("doorFace");
  const doorArt = part<SVGGElement>("doorArt");
  const doorTop = part<SVGPathElement>("doorTop");
  const doorEdge = part<SVGPathElement>("doorEdge");
  const openT = part<SVGTextElement>("openT");
  const lamp = part<SVGCircleElement>("lamp");
  const lampGlow = part<SVGCircleElement>("lampGlow");
  const loupe = part<SVGGElement>("loupe");
  const lpN = part<SVGTextElement>("lpN");
  const lpH = part<SVGTSpanElement>("lpH");

  let motions: Motion[] = [];
  let frame = 0;

  // ---- drawing helpers: each acts on one part ----
  const text = (el: SVGElement, s: string) => void (el.textContent !== s && (el.textContent = s));
  const flag = (el: Element, cls: string, on: boolean) => el.classList.toggle(cls, on);
  const op = (el: Element, v: number) => el.setAttribute("opacity", v.toFixed(3));

  function placeSeal(i: number, u: number) {
    // lift off the rack, glide over its circle, press, lift, glide home, set down
    const [sx, sy] = G.sealAt[i];
    const [cx, cy] = G.circ[i];
    const { lift: LIFT, press: PRESS } = G;
    const go = u <= 0 ? 0 : span(u, 0.18, 0.45) - span(u, 0.7, 0.9);
    const dz = u <= 0 ? 0 : LIFT * span(u, 0, 0.18) + (PRESS - LIFT) * span(u, 0.45, 0.55) + (LIFT - PRESS) * span(u, 0.62, 0.7) - LIFT * span(u, 0.9, 1);
    seals[i].setAttribute("transform", move([(cx - sx) * go, (cy - sy) * go, dz]));
  }
  function landImp(i: number, u: number) {
    // the impression is there the moment the seal touches, and settles from a slight spread
    const el = imps[i];
    const cx = Number(el.dataset.cx);
    const cy = Number(el.dataset.cy);
    const s = 1 + 0.18 * (1 - ease(clamp(u)));
    if (u > 0 && u < 1) el.setAttribute("transform", `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`);
    else el.removeAttribute("transform");
    op(el, 0.94 * clamp(u * 3));
  }
  function placePulse(u: number) {
    if (u <= 0 || u >= 1) {
      op(pulse, 0);
      op(pulseHalo, 0);
      return;
    }
    const W = G.w1;
    const len = W.slice(1).map((p, i) => Math.hypot(p[0] - W[i][0], p[1] - W[i][1], p[2] - W[i][2]));
    let s = u * len.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < len.length - 1 && s > len[i]) s -= len[i++];
    const f = clamp(s / len[i]);
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
  /** The door panel at angle th: its seen broad face, top and free edge, and the matrix that carries
   *  the panel's drawing (authored closed, on the front plane) onto the face that shows. */
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
    if (opts.reduced) {
      draw(dur);
      return Promise.resolve();
    }
    draw(0);
    return new Promise<void>((resolve) => {
      motions.push({ t0: performance.now(), dur, draw, resolve });
      if (!frame) frame = requestAnimationFrame(tick);
    });
  }
  function stopAll() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const m = motions;
    motions = [];
    m.forEach((x) => x.resolve());
  }

  // ---- the steps ----
  const seal = (i: number) =>
    play(1.0, (t) => {
      placeSeal(i, t);
      landImp(i, (t - 0.53) / 0.12);
    });

  function fingerprint(nShort: string) {
    flag(sheetN, "on", true);
    return play(0.45, (t) => text(sheetN, typed(nShort, t / 0.45) || "N"));
  }

  function post(nShort: string, block: string) {
    text(lpN, nShort);
    text(lpH, block);
    return play(1.3, (t) => {
      placePulse(t / 0.8);
      text(rowN, typed(nShort, (t - 0.8) / 0.45));
      text(rowH, typed(block, (t - 1.0) / 0.3));
      flag(rowHl, "on", t >= 0.8);
      flag(boardLed, "on", t >= 0.75);
      flag(loupe, "on", t >= 0.8);
    });
  }

  function advance() {
    const R = C.coinR;
    const start = along(R + 0.4, R);
    const bottom = along(C.len, R);
    return play(2.2, (t) => {
      if (t < 0.15) placeCoin(start, span(t, 0, 0.15));
      else if (t < 0.85) {
        const v = clamp((t - 0.15) / 0.7);
        placeCoin(along(lerp(R + 0.4, C.len, v * v), R), 1);
      } else if (t < 1.15) {
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
    return play(1.6, (t) => {
      op(lampGlow, 0.32 * span(t, 0, 0.3));
      placeDoor(G.doorMax * span(t, 0.25, 1.35));
    });
  }

  function reset() {
    stopAll();
    for (let i = 0; i < 3; i++) {
      placeSeal(i, 0);
      landImp(i, 0);
    }
    text(sheetN, "N");
    text(rowN, "");
    text(rowH, "");
    text(lpN, "");
    text(lpH, "");
    placePulse(0);
    placeCoin(C.coin0, 0);
    placeRipples(0);
    op(lampGlow, 0);
    placeDoor(0);
    for (const [el, cls] of [[sheetN, "on"], [rowHl, "on"], [boardLed, "on"], [loupe, "on"], [openT, "on"], [lamp, "on"]] as const) flag(el, cls, false);
  }

  function setLabels(map: Record<string, string>) {
    all<SVGElement>(svg, "[data-i18n]").forEach((el) => {
      const s = map[el.dataset.i18n ?? ""];
      if (s !== undefined) text(el, s);
    });
    [svg, ...all<SVGElement>(svg, "[data-i18n-aria]")].forEach((el) => {
      const s = map[el.dataset.i18nAria ?? ""];
      if (s !== undefined) el.setAttribute("aria-label", s);
    });
  }

  // input: a click anywhere on the office; Enter or Space while the figure has focus
  const off = new AbortController();
  const { signal } = off;
  svg.addEventListener("click", () => opts.onPress(), { signal });
  svg.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      opts.onPress();
    },
    { signal },
  );

  reset();

  return {
    seal,
    fingerprint,
    post,
    advance,
    open,
    reset,
    setLabels,
    destroy() {
      off.abort();
      stopAll();
    },
  };
}
