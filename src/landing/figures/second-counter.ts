// Runtime for the chapter 4 second financier's counter (second-counter.svg, built by
// scripts/figures/second-counter.build.mjs). The drawing is static; this moves its parts, one step
// at a time, as the chapter's real jitsuin-wasm flow finishes each call: the offer slides out of the
// intake (arrive), A's entry is inked on the public board (post), B's reader scans the offer and its
// N runs to the board, where the row lights (lookup), the row is A's: the verdict runs to B's
// counter (found), the 重 lamp lights (lamp), the shutter comes down over B's drawer (shutter) and
// the printer prints Exhibit A (exhibit). No state of its own about the invoice: N and A's
// commitment come from the chapter. Each step resolves when its motion is over.
// requestAnimationFrame runs only while something moves. Colours live in landing.css (.tc-*); only
// transforms, opacities, classes, texts and path data are written here, as attributes.

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  w1: Vec3[];
  w2: Vec3[];
  head: Vec3;
  scan: { x0: number; x1: number; y0: number; y1: number; z: number };
  paperRest: number;
  shutOpen: number;
  slipIn: number;
}

export interface SecondCounterOptions {
  reduced: boolean;
  /** The visitor pressed the counter (click, or Enter/Space with the figure focused). */
  onPress: () => void;
}

export interface SecondCounter {
  /** The offer to financier B slides out of the intake onto the tray. */
  arrive(): Promise<void>;
  /** A's entry is on the public board: the hero's line shows nShort and A's commitment. */
  post(nShort: string, commitShort: string): Promise<void>;
  /** B's reader scans the offer, shows nShort and sends it down the wire; the board row lights. */
  lookup(nShort: string): Promise<void>;
  /** Same N, another financier: A's line lights, the reader says SEEN · A, the verdict runs to B. */
  found(): Promise<void>;
  /** The 重 lamp on B's counter lights. */
  lamp(): Promise<void>;
  /** The shutter comes down over B's drawer: no money moves. */
  shutter(): Promise<void>;
  /** The printer prints Exhibit A (with nShort) and it slides out. */
  exhibit(nShort: string): Promise<void>;
  /** Everything back at rest: the offer in the slot, the board line empty, the shutter up. */
  reset(): void;
  /** Texts for [data-i18n] and aria labels for [data-i18n-aria], by key. */
  setLabels(map: Record<string, string>): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
const NO_N = "N ——";

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));

function geometryOf(svg: SVGSVGElement): Geometry {
  const raw = svg.dataset.geometry;
  if (!raw) throw new Error("second-counter: the svg has no data-geometry");
  return JSON.parse(raw) as Geometry;
}

const all = <E extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll<E>(sel)];
function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`second-counter: missing ${sel}`);
  return el;
}

/** One moving step: a timeline of `dur` seconds drawn by `draw(t)`. */
type Motion = { t0: number; dur: number; draw: (t: number) => void; resolve: () => void };

export function mountSecondCounter(svg: SVGSVGElement, opts: SecondCounterOptions): SecondCounter {
  const G = geometryOf(svg);
  const { P } = G;
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
  const pt = (p: Vec3) => {
    const q = iso(p);
    return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  };

  const part = <E extends Element>(name: string) => one<E>(svg, `[data-part="${name}"]`);
  const paper = part<SVGGElement>("paper");
  const slip = part<SVGGElement>("slip");
  const curtain = part<SVGGElement>("curtain");
  const lampEl = part<SVGGElement>("lamp");
  const beam = part<SVGGElement>("beam");
  const beamFan = one<SVGPathElement>(beam, ".beam");
  const beamLine = one<SVGPathElement>(beam, ".scan");
  const headLed = part<SVGCircleElement>("headLed");
  const pled = part<SVGCircleElement>("pled");
  const scrN = part<SVGTextElement>("scrN");
  const scrV = part<SVGTextElement>("scrV");
  const hlN = part<SVGPathElement>("hlN");
  const hlA = part<SVGPathElement>("hlA");
  const rowNo = part<SVGTextElement>("rowNo");
  const rowN = part<SVGGElement>("rowN");
  const rowA = part<SVGGElement>("rowA");
  const boardN = one<SVGTextElement>(rowN, "[data-n]");
  const boardC = one<SVGTSpanElement>(rowA, "[data-c]");
  const slipN = one<SVGTextElement>(slip, "[data-n]");
  const pulses: Record<1 | 2, [SVGCircleElement, SVGCircleElement, Vec3[]]> = {
    1: [part("pulse1"), part("pulse1Halo"), G.w1],
    2: [part("pulse2"), part("pulse2Halo"), G.w2],
  };

  let motions: Motion[] = [];
  let frame = 0;

  // ---- drawing helpers: each acts on one part ----
  const text = (el: SVGElement, s: string) => void (el.textContent !== s && (el.textContent = s));
  const flag = (el: Element, cls: string, on: boolean) => el.classList.toggle(cls, on);
  const placePaper = (dx: number) => paper.setAttribute("transform", move([dx, 0, 0]));
  const placeSlip = (dx: number) => slip.setAttribute("transform", move([dx, 0, 0]));
  const placeCurtain = (dz: number) => curtain.setAttribute("transform", move([0, 0, dz]));
  function drawBeam(u: number, op: number) {
    beam.setAttribute("opacity", op.toFixed(3));
    if (op <= 0) return;
    const S = G.scan;
    const x = lerp(S.x0, S.x1, u);
    const a: Vec3 = [x, S.y0, S.z];
    const b: Vec3 = [x, S.y1, S.z];
    beamFan.setAttribute("d", `M${pt(G.head)}L${pt(a)}L${pt(b)}Z`);
    beamLine.setAttribute("d", `M${pt(a)}L${pt(b)}`);
  }
  function placePulse(n: 1 | 2, u: number) {
    const [dot, halo, W] = pulses[n];
    if (u <= 0 || u >= 1) {
      dot.setAttribute("opacity", "0");
      halo.setAttribute("opacity", "0");
      return;
    }
    const len = W.slice(1).map((p, i) => Math.hypot(p[0] - W[i][0], p[1] - W[i][1], p[2] - W[i][2]));
    let s = u * len.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < len.length - 1 && s > len[i]) s -= len[i++];
    const f = clamp(s / len[i]);
    const q = iso(W[i].map((v, j) => lerp(v, W[i + 1][j], f)) as Vec3);
    for (const el of [dot, halo]) {
      el.setAttribute("cx", q[0].toFixed(1));
      el.setAttribute("cy", q[1].toFixed(1));
    }
    dot.setAttribute("opacity", "1");
    halo.setAttribute("opacity", "0.35");
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
  const arrive = () => play(1.2, (t) => placePaper(lerp(G.paperRest, 0, span(t, 0, 1.2))));

  function post(nShort: string, commitShort: string) {
    text(boardN, `N ${nShort}`);
    text(boardC, commitShort);
    flag(rowN, "on", true);
    flag(rowA, "on", true);
    return play(0.6, () => undefined);
  }

  function lookup(nShort: string) {
    return play(2.2, (t) => {
      // the reader scans the offer, then N runs down the wire to the board, where the row lights
      const scanning = t > 0 && t < 1.2;
      drawBeam(span(t, 0.1, 1.0), scanning ? Math.min(span(t, 0, 0.2), 1 - span(t, 1.0, 1.2)) : 0);
      flag(headLed, "on", scanning);
      text(scrN, t >= 0.8 ? `N ${nShort}` : NO_N);
      placePulse(1, clamp((t - 1.1) / 1.0));
      flag(hlN, "on", t >= 2.05);
      flag(rowNo, "hot", t >= 2.05);
    });
  }

  function found() {
    flag(scrV, "on", true);
    flag(hlA, "on", true);
    flag(rowA, "found", true);
    return play(1.5, (t) => placePulse(2, clamp((t - 0.5) / 1.0)));
  }

  function lamp() {
    flag(lampEl, "on", true);
    return play(0.5, () => undefined);
  }

  const shutter = () => play(1.4, (t) => placeCurtain(G.shutOpen * (1 - span(t, 0, 1.4))));

  function exhibit(nShort: string) {
    text(slipN, `N ${nShort}`);
    flag(pled, "on", true);
    return play(1.6, (t) => placeSlip(lerp(G.slipIn, 0, span(t, 0.2, 1.6))));
  }

  function reset() {
    stopAll();
    placePaper(G.paperRest);
    placeSlip(G.slipIn);
    placeCurtain(G.shutOpen);
    drawBeam(0, 0);
    placePulse(1, 0);
    placePulse(2, 0);
    text(scrN, NO_N);
    text(boardN, "");
    text(boardC, "");
    text(slipN, "");
    for (const [el, cls] of [[scrV, "on"], [headLed, "on"], [pled, "on"], [lampEl, "on"], [hlN, "on"], [hlA, "on"], [rowNo, "hot"], [rowN, "on"], [rowA, "on"], [rowA, "found"]] as const) flag(el, cls, false);
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

  // input: a click anywhere on the counter; Enter or Space while the figure has focus
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
    arrive,
    post,
    lookup,
    found,
    lamp,
    shutter,
    exhibit,
    reset,
    setLabels,
    destroy() {
      off.abort();
      stopAll();
    },
  };
}
