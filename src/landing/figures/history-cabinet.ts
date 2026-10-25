// Runtime for the chapter 5 history cabinet (history-cabinet.svg, built by
// scripts/figures/history-cabinet.build.mjs). The drawing is static; this moves its parts, one step
// at a time, as the chapter's real jitsuin-wasm flow finishes each call: a certificate's register
// entry is inked on the public board (post), the reader rides to a drawer, which slides out and
// its certificate rises (open), the lens reads it and its N runs to the board, where the row
// lights (scan), the check comes back anchored: 済 or 遅 lands and the link to the certificate
// before lights (anchor), or the drawer stays shut while its entry is on the board (missing); at
// the end the tally runs to the plate and the flaps turn (verdict), or nothing turns (refuse).
// No state of its own about the history: N, the outcomes and the tally come from the chapter.
// Each step resolves when its motion is over. requestAnimationFrame runs only while something
// moves. Colours live in landing.css (.hc-*); only transforms, opacities, classes, texts and path
// data are written here, as attributes.

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  cx: number[];
  park: number;
  look: number;
  outY: number;
  rise: number;
  w1: Vec3[];
  w2: Vec3[];
  railTop: number;
  railZ: number;
  mastFront: number;
  stTop: number;
  mx: number;
  lensY: number;
  lensZ: number;
  cardY: number;
  cardHw: number;
  scanZ: [number, number];
  win: [number, number][];
  winZ: [number, number];
  vy: number;
}

export interface HistoryCabinetOptions {
  reduced: boolean;
  /** The visitor pressed the cabinet (click, or Enter/Space with the figure focused). */
  onPress: () => void;
}

export interface HistoryCabinet {
  /** Certificate i's register entry is on the public board: its row shows nShort. */
  post(i: number, nShort: string): Promise<void>;
  /** The reader rides to drawer i; the drawer slides out and certificate i rises, linked to i-1. */
  open(i: number): Promise<void>;
  /** The lens reads certificate i, its N runs to the board and back; the row lights. */
  scan(i: number, nShort: string): Promise<void>;
  /** The board anchors certificate i: ANCHORED, the stamp (遅 when late, else 済), the link lights. */
  anchor(i: number, late: boolean): Promise<void>;
  /** Certificate i is not shown: the reader stops at its shut drawer, its entry lights on the board. */
  missing(i: number, nShort: string): Promise<void>;
  /** The tally runs to the plate and the flaps turn: on time, late, defaulted. */
  verdict(tally: [number, number, number]): Promise<void>;
  /** The check refused the history: the line runs to the plate, the flaps stay blank. */
  refuse(): Promise<void>;
  /** Everything back at rest: drawers shut, the board's rows empty, the flaps blank. */
  reset(): void;
  /** Texts for [data-i18n] and aria labels for [data-i18n-aria], by key; {d} takes the element's
   *  data-i18n-d through `date`, {n} its data-i18n-n. */
  setLabels(map: Record<string, string>, date: (iso: string) => string): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
const NO_NO = "#—";
const NO_N = "N ——";
const BLANK = "–";

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));

function geometryOf(svg: SVGSVGElement): Geometry {
  const raw = svg.dataset.geometry;
  if (!raw) throw new Error("history-cabinet: the svg has no data-geometry");
  return JSON.parse(raw) as Geometry;
}

const all = <E extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll<E>(sel)];
function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`history-cabinet: missing ${sel}`);
  return el;
}

/** One moving step: a timeline of `dur` seconds drawn by `draw(t)`. */
type Motion = { t0: number; dur: number; draw: (t: number) => void; resolve: () => void };

export function mountHistoryCabinet(svg: SVGSVGElement, opts: HistoryCabinetOptions): HistoryCabinet {
  const G = geometryOf(svg);
  const { P } = G;
  const N = G.cx.length;
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
  const each = <E extends Element>(name: string) => G.cx.map((_, i) => part<E>(`${name}${i}`));
  const trayB = each<SVGGElement>("trayB");
  const trayF = each<SVGGElement>("trayF");
  const panels = each<SVGGElement>("panel");
  const cards = each<SVGGElement>("card");
  const stamps = each<SVGGElement>("stamp");
  const stampK = stamps.map((s) => one<SVGTextElement>(s, "[data-k]"));
  const rows = each<SVGGElement>("row");
  const rowN = rows.map((r) => one<SVGTextElement>(r, "[data-n]"));
  const hls = each<SVGPathElement>("hl");
  const rowNos = each<SVGTextElement>("rowNo");
  const links = G.cx.map((_, i) => (i ? part<SVGGElement>(`link${i}`) : null));
  const carriage = part<SVGGElement>("carriage");
  const beam = part<SVGGElement>("beam");
  const beamFan = one<SVGPathElement>(beam, ".beam");
  const beamLine = one<SVGPathElement>(beam, ".scan");
  const headLed = part<SVGCircleElement>("headLed");
  const pled = part<SVGCircleElement>("pled");
  const scrNo = part<SVGTextElement>("scrNo");
  const scrN = part<SVGTextElement>("scrN");
  const scrV = part<SVGTextElement>("scrV");
  const scrX = part<SVGTextElement>("scrX");
  const flaps = [0, 1, 2].map((i) => part<SVGGElement>(`flapIn${i}`));
  const digits = [0, 1, 2].map((i) => part<SVGTextElement>(`digit${i}`));
  const pulses: Record<"G" | 1 | 2, [SVGCircleElement, SVGCircleElement]> = {
    G: [part("pulseG"), part("pulseGHalo")],
    1: [part("pulse1"), part("pulse1Halo")],
    2: [part("pulse2"), part("pulse2Halo")],
  };

  let motions: Motion[] = [];
  let frame = 0;
  let carX = G.park;

  // ---- drawing helpers: each acts on one part ----
  const text = (el: SVGElement, s: string) => void (el.textContent !== s && (el.textContent = s));
  const flag = (el: Element, cls: string, on: boolean) => el.classList.toggle(cls, on);
  const op = (el: Element, v: number) => el.setAttribute("opacity", v.toFixed(3));
  function placeDrawer(i: number, out: number) {
    const m = move([0, out, 0]);
    for (const el of [trayB[i], trayF[i], panels[i]]) el.setAttribute("transform", m);
  }
  function placeCard(i: number, out: number, rise: number, shown: boolean) {
    cards[i].setAttribute("transform", move([0, out - G.outY, rise - G.rise]));
    op(cards[i], shown ? 1 : 0);
  }
  function placeCarriage(x: number) {
    carX = x;
    carriage.setAttribute("transform", move([x - G.park, 0, 0]));
  }
  function landStamp(i: number, u: number) {
    // the stamp comes down from above the card and settles: scale 1.7 -> 1 about its centre
    const el = stamps[i];
    const cx = Number(el.dataset.cx);
    const cy = Number(el.dataset.cy);
    const s = 1 + 0.7 * (1 - ease(clamp(u)));
    if (u > 0 && u < 1) el.setAttribute("transform", `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`);
    else el.removeAttribute("transform");
    op(el, clamp(u * 2.5));
  }
  function drawBeam(x: number, u: number, o: number) {
    op(beam, o);
    if (o <= 0) return;
    const z = lerp(G.scanZ[0], G.scanZ[1], u);
    const a: Vec3 = [x - G.cardHw, G.cardY, z];
    const b: Vec3 = [x + G.cardHw, G.cardY, z];
    beamFan.setAttribute("d", `M${pt([x + G.look, G.lensY, G.lensZ])}L${pt(a)}L${pt(b)}Z`);
    beamLine.setAttribute("d", `M${pt(a)}L${pt(b)}`);
  }
  // the reader's own line: along the rail top from the carriage, down the mast's front to the station
  const gantry = (x: number): Vec3[] => [[x, G.lensY, G.railTop], [G.mx, G.lensY, G.railTop], [G.mx, G.mastFront, G.railZ], [G.mx, G.mastFront, G.stTop]];
  function placePulse(name: "G" | 1 | 2, W: Vec3[], u: number) {
    const [dot, halo] = pulses[name];
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
  function setScreen(no: string, n: string) {
    text(scrNo, no);
    text(scrN, n);
  }
  /** Only row i is the current one: its band lights, its number is hot. */
  function current(i: number, cls: "on" | "miss") {
    hls.forEach((el, j) => {
      flag(el, "on", j === i && cls === "on");
      flag(el, "miss", j === i && cls === "miss");
      if (j === i) flag(el, "done", false);
      flag(rowNos[j], "hot", j === i);
    });
  }
  // a split flap: the digit folds about the window's hinge (world z scaled about its centre); its
  // text swaps when edge-on
  const EX = (() => {
    const o = iso([0, 0, 0]);
    const a = iso([1, 0, 0]);
    return [a[0] - o[0], a[1] - o[1]];
  })();
  const EZ = (() => {
    const o = iso([0, 0, 0]);
    const a = iso([0, 0, 1]);
    return [a[0] - o[0], a[1] - o[1]];
  })();
  function flip(i: number, u: number, to: string) {
    const s = u <= 0 || u >= 1 ? 1 : Math.abs(Math.cos(Math.PI * u));
    if (u >= 0.5) text(digits[i], to);
    if (s === 1) {
      flaps[i].removeAttribute("transform");
      return;
    }
    const c = iso([(G.win[i][0] + G.win[i][1]) / 2, G.vy, (G.winZ[0] + G.winZ[1]) / 2]);
    // M = [EX | s EZ] [EX | EZ]^-1, about the window's centre
    const det = EX[0] * EZ[1] - EZ[0] * EX[1];
    const inv = [EZ[1] / det, -EX[1] / det, -EZ[0] / det, EX[0] / det];
    const a = EX[0] * inv[0] + s * EZ[0] * inv[1];
    const b = EX[1] * inv[0] + s * EZ[1] * inv[1];
    const cc = EX[0] * inv[2] + s * EZ[0] * inv[3];
    const d = EX[1] * inv[2] + s * EZ[1] * inv[3];
    const e = c[0] - a * c[0] - cc * c[1];
    const f = c[1] - b * c[0] - d * c[1];
    flaps[i].setAttribute("transform", `matrix(${[a, b, cc, d, e, f].map((v) => v.toFixed(4)).join(" ")})`);
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
  function post(i: number, nShort: string) {
    text(rowN[i], `N ${nShort}`);
    flag(rows[i], "on", true);
    return play(0.4, () => undefined);
  }

  /** The carriage rides from where it is to drawer i's reading spot. */
  const ride = (i: number) => {
    const from = carX;
    const to = G.cx[i] + G.look;
    return (u: number) => placeCarriage(lerp(from, to, u));
  };

  function open(i: number) {
    const go = ride(i);
    flag(pled, "on", true);
    return play(0.9, (t) => {
      go(span(t, 0, 0.55));
      const out = G.outY * span(t, 0.05, 0.5);
      placeDrawer(i, out);
      placeCard(i, out, G.rise * span(t, 0.45, 0.85), t >= 0.3);
      const l = links[i];
      if (l) op(l, t >= 0.8 ? 1 : 0);
    });
  }

  function scan(i: number, nShort: string) {
    const x = G.cx[i];
    flag(scrV, "on", false);
    flag(scrX, "on", false);
    return play(1.0, (t) => {
      // the lens reads the card top to bottom, then N runs along the reader's line to the station,
      // down the wire to the board, and back
      const scanning = t < 0.3;
      drawBeam(x, span(t, 0.02, 0.28), scanning ? Math.min(span(t, 0, 0.06), 1 - span(t, 0.24, 0.3)) : 0);
      flag(headLed, "on", scanning);
      if (t >= 0.2) setScreen(`#${i}`, `N ${nShort}`);
      placePulse("G", gantry(x + G.look), clamp((t - 0.25) / 0.2));
      placePulse(1, G.w1, t < 0.65 ? clamp((t - 0.45) / 0.2) : 1 - clamp((t - 0.65) / 0.15));
      if (t >= 0.65) {
        current(i, "on");
        flag(rows[i], "found", true);
      }
      if (t >= 0.8) placePulse(1, G.w1, 0);
    });
  }

  function anchor(i: number, late: boolean) {
    const x = G.cx[i];
    text(stampK[i], late ? "遅" : "済");
    flag(stamps[i], "late", late);
    flag(scrV, "on", true);
    return play(0.45, (t) => {
      placePulse("G", gantry(x + G.look), t < 0.15 ? 1 - t / 0.15 : 0);
      landStamp(i, (t - 0.1) / 0.16);
      const l = links[i];
      if (l) flag(l, "on", t >= 0.3);
      if (t >= 0.3) {
        flag(hls[i], "on", false);
        flag(hls[i], "done", true);
      }
    });
  }

  function missing(i: number, nShort: string) {
    const go = ride(i);
    flag(pled, "on", true);
    flag(scrV, "on", false);
    return play(1.2, (t) => {
      go(span(t, 0, 0.55));
      if (t >= 0.6) placePulse(1, G.w1, clamp((t - 0.6) / 0.25));
      if (t >= 0.9) {
        placePulse(1, G.w1, 0);
        setScreen(`#${i}`, `N ${nShort}`);
        current(i, "miss");
        flag(rows[i], "miss", true);
        flag(scrX, "on", true);
      }
    });
  }

  function verdict(tally: [number, number, number]) {
    current(-1, "on");
    return play(1.5, (t) => {
      placePulse(2, G.w2, clamp(t / 0.5));
      for (let i = 0; i < 3; i++) flip(i, (t - 0.5 - i * 0.2) / 0.35, String(tally[i]));
      if (t >= 0.9) flag(pled, "on", false);
    });
  }

  function refuse() {
    return play(0.8, (t) => {
      placePulse(2, G.w2, clamp(t / 0.5));
      if (t >= 0.6) flag(pled, "on", false);
    });
  }

  function reset() {
    stopAll();
    placeCarriage(G.park);
    for (let i = 0; i < N; i++) {
      placeDrawer(i, 0);
      placeCard(i, 0, 0, false);
      landStamp(i, 0);
      text(stampK[i], "済");
      flag(stamps[i], "late", false);
      const l = links[i];
      if (l) {
        op(l, 0);
        flag(l, "on", false);
      }
      text(rowN[i], "");
      for (const c of ["on", "found", "miss"]) flag(rows[i], c, false);
      for (const c of ["on", "done", "miss"]) flag(hls[i], c, false);
      flag(rowNos[i], "hot", false);
    }
    drawBeam(0, 0, 0);
    for (const n of ["G", 1, 2] as const) placePulse(n, [], 0);
    setScreen(NO_NO, NO_N);
    for (const [el, cls] of [[scrV, "on"], [scrX, "on"], [headLed, "on"], [pled, "on"]] as const) flag(el, cls, false);
    for (let i = 0; i < 3; i++) {
      flaps[i].removeAttribute("transform");
      text(digits[i], BLANK);
    }
  }

  function setLabels(map: Record<string, string>, date: (iso: string) => string) {
    all<SVGElement>(svg, "[data-i18n]").forEach((el) => {
      const s = map[el.dataset.i18n ?? ""];
      if (s === undefined) return;
      text(el, s.replace("{d}", el.dataset.i18nD ? date(el.dataset.i18nD) : "{d}").replace("{n}", el.dataset.i18nN ?? "{n}"));
    });
    [svg, ...all<SVGElement>(svg, "[data-i18n-aria]")].forEach((el) => {
      const s = map[el.dataset.i18nAria ?? ""];
      if (s !== undefined) el.setAttribute("aria-label", s);
    });
  }

  // input: a click anywhere on the cabinet; Enter or Space while the figure has focus
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
    post,
    open,
    scan,
    anchor,
    missing,
    verdict,
    refuse,
    reset,
    setLabels,
    destroy() {
      off.abort();
      stopAll();
    },
  };
}
