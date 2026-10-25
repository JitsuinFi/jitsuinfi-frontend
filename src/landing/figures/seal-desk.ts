// Runtime for the chapter 3 seal desk (seal-desk.svg, built by scripts/figures/seal-desk.build.mjs).
// The drawing is static; this moves its parts: a hanko lifts off the rack, travels over its circle
// on the letter, presses (the impression appears, one latch lifts, its lamp lights), and returns;
// a wrong seal shakes; after the third the shutter rises and the coin rolls down the chute, falls
// into the shielded pool and sinks with a ripple. breakSeals() cracks and fades the impressions,
// drops the latches and closes the shutter on the coin. No state of its own about the chain: the
// chapter decides what a press means and calls stamp/open/breakSeals.
// requestAnimationFrame runs only while something moves. Colours and the cue blink live in
// landing.css (.sd-*); only transforms and opacities are written here, as SVG attributes.
import { ease as motionEase } from "../motion";

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  sealAt: Vec2[];
  circles: Vec2[];
  rackH: number;
  letterTop: number;
  shutLift: number;
  waterZ: number;
  poolH: number;
  a: Vec3;
  ax: Vec3;
  up: Vec3;
  len: number;
  sRest: number;
  sGate: number;
  coinR: number;
  rest: Vec3;
}

export interface SealDeskOptions {
  reduced: boolean;
  /** A seal in the figure was pressed (click, Enter/Space on it, or 1/2/3 with the figure focused). */
  onPress: (i: number) => void;
}

export interface SealDesk {
  /** Seal i moves to its circle and presses; resolves when it is back on the rack. */
  stamp(i: number): Promise<void>;
  /** The out-of-order nudge: seal i shakes in place. */
  shake(i: number): void;
  /** The gate opens and the coin rolls into the shielded pool. */
  open(): void;
  /** The letter was edited: impressions crack and fade, latches drop, the shutter falls shut. */
  breakSeals(): void;
  reset(): void;
  /** Texts for [data-i18n] and aria labels for [data-i18n-aria], by key. */
  setLabels(map: Record<string, string>): void;
  destroy(): void;
}

type Tween = { t0: number; dur: number; ease: (t: number) => number; step: (v: number) => void; end?: () => void };
type Splash = { t0: number; p: Vec3 };
type Phase = { p: Vec3; phase: "roll"; s: number } | { p: Vec3; phase: "fall" } | { p: Vec3; phase: "sink"; sink: number };

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
// the seal's path: rest, up, over the circle, down (press), hold, back up, home
const T_SEAL = 2.3;
const PRESS = 0.6;
// the coin: initial speed and acceleration along the chute, then gravity (world units, seconds)
const V0 = 22;
const ACC = 26;
const GRAV = 420;
const GATE_MS = 900;

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function geometryOf(svg: SVGSVGElement): Geometry {
  const raw = svg.dataset.geometry;
  if (!raw) throw new Error("seal-desk: the svg has no data-geometry");
  return JSON.parse(raw) as Geometry;
}

const all = <E extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll<E>(sel)];
function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`seal-desk: missing ${sel}`);
  return el;
}

export function mountSealDesk(svg: SVGSVGElement, opts: SealDeskOptions): SealDesk {
  const G = geometryOf(svg);
  const { P } = G;
  const cam = (() => {
    const a = (P.azimuth ?? 45) * RAD;
    const e = (P.elevation ?? 30) * RAD;
    return { sa: Math.sin(a), ca: Math.cos(a), se: Math.sin(e), ce: Math.cos(e), k: P.scale * UNIT };
  })();
  const iso = ([x, y, z]: Vec3): Vec2 => [P.origin[0] + (x * cam.sa - y * cam.ca) * cam.k, P.origin[1] + ((x * cam.ca + y * cam.sa) * cam.se - z * cam.ce) * cam.k];
  const depth = ([x, y, z]: Vec3) => (x * cam.ca + y * cam.sa) * cam.ce + z * cam.se;
  const move = ([dx, dy, dz]: Vec3) => {
    const o = iso([0, 0, 0]);
    const m = iso([dx, dy, dz]);
    return `translate(${(m[0] - o[0]).toFixed(2)} ${(m[1] - o[1]).toFixed(2)})`;
  };
  const ringD = (cx: number, cy: number, r: number, z: number) => {
    let d = "";
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = iso([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
      d += `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    }
    return `${d}Z`;
  };
  const chute = (s: number, h: number): Vec3 => [G.a[0] + G.ax[0] * s + G.up[0] * h, G.a[1] + G.ax[1] * s + G.up[1] * h, G.a[2] + G.ax[2] * s + G.up[2] * h];

  const sealsBox = one<SVGGElement>(svg, '[data-part="seals"]');
  const seals = all<SVGGElement>(svg, ".seal");
  const imps = all<SVGGElement>(svg, ".imp");
  const cracks = all<SVGGElement>(svg, ".crack");
  const cues = all<SVGPathElement>(svg, ".cue");
  const latches = all<SVGGElement>(svg, ".latch");
  const lamps = all<SVGCircleElement>(svg, "[data-lamp]");
  const shutter = one<SVGGElement>(svg, '[data-part="shutter"]');
  const coin = one<SVGGElement>(svg, ".coin");
  const slots = {
    in: one<SVGGElement>(svg, '[data-slot="in"]'),
    above: one<SVGGElement>(svg, '[data-slot="above"]'),
    back: one<SVGGElement>(svg, '[data-slot="back"]'),
    front: one<SVGGElement>(svg, '[data-slot="front"]'),
  };
  const ripples = all<SVGPathElement>(svg, ".ripples path");
  const newNote = one<SVGCircleElement>(svg, ".new-note");

  let done = 0;
  let broken = false;
  let anim: { i: number; t0: number; stamped: boolean; resolve: () => void } | null = null;
  let shakes: { i: number; t0: number }[] = [];
  let gate: { t0: number } | null = null;
  let coinRun: { t0: number } | null = null;
  let impact: { f: number; p: Vec3 } | null = null;
  let splash: Splash | null = null;
  let tweens: Tween[] = [];
  let shutZ = 0;
  let frame = 0;
  const sealPos: Vec3[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  const cue = () => cues.forEach((c, i) => c.classList.toggle("next", !broken && i === done && done < 3));

  function sealOffset(i: number, u: number): Vec3 {
    const [sx, sy] = G.sealAt[i];
    const [cx, cy] = G.circles[i];
    const dx = cx - sx;
    const dy = cy - sy;
    const low = G.letterTop - G.rackH;
    const hover = low + 22;
    const high = 42;
    const seg: [number, Vec3][] = [
      [0, [0, 0, 0]],
      [0.18, [0, 0, high]],
      [0.46, [dx, dy, hover]],
      [0.56, [dx, dy, low]],
      [0.66, [dx, dy, low]],
      [0.74, [dx, dy, hover]],
      [0.9, [0, 0, high]],
      [1, [0, 0, 0]],
    ];
    for (let j = 1; j < seg.length; j++) {
      if (u <= seg[j][0]) {
        const t = smooth((u - seg[j - 1][0]) / (seg[j][0] - seg[j - 1][0]));
        const [a, b] = [seg[j - 1][1], seg[j][1]];
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      }
    }
    return [0, 0, 0];
  }

  function placeSeals(now: number) {
    seals.forEach((el, i) => {
      let tr = move(sealPos[i]);
      const s = shakes.find((q) => q.i === i);
      if (s) {
        const t = (now - s.t0) / 1000;
        const amp = 1.8 * Math.max(0, 1 - t / 0.42);
        tr += ` translate(${(Math.sin(t * 52) * amp).toFixed(2)} 0)`;
      }
      el.setAttribute("transform", tr);
    });
    // painter's order: the seal nearer the viewer is drawn last
    const order = [0, 1, 2].sort((a, b) => depth([G.sealAt[a][0] + sealPos[a][0], G.sealAt[a][1] + sealPos[a][1], 0]) - depth([G.sealAt[b][0] + sealPos[b][0], G.sealAt[b][1] + sealPos[b][1], 0]));
    order.forEach((i, n) => {
      if (sealsBox.children[n] !== seals[i]) sealsBox.appendChild(seals[i]);
    });
  }

  function mark(i: number) {
    imps[i].classList.add("on");
    latches[i].classList.add("out");
    latches[i].setAttribute("transform", move([0, 0, 4]));
    lamps[i].classList.add("on");
    seals[i].classList.add("used");
    seals[i].setAttribute("aria-disabled", "true");
    done = Math.max(done, i + 1);
    cue();
  }

  const setShutter = (z: number) => {
    shutZ = z;
    if (z <= 0) shutter.removeAttribute("transform");
    else shutter.setAttribute("transform", move([0, 0, z]));
  };

  // the coin: roll down the chute, leave its end, fall, sink
  const lipPos = (): Vec3 => chute(G.len, G.coinR);
  function coinAt(t: number): Phase {
    const disc = V0 * V0 + 2 * ACC * (G.len - G.sRest);
    const tRoll = (-V0 + Math.sqrt(disc)) / ACC;
    if (t <= tRoll) {
      const s = G.sRest + V0 * t + 0.5 * ACC * t * t;
      return { p: chute(s, G.coinR), s, phase: "roll" };
    }
    const v = V0 + ACC * tRoll;
    const f = t - tRoll;
    const p0 = lipPos();
    const zAt = (m: number) => p0[2] + G.ax[2] * v * m - 0.5 * GRAV * m * m;
    const fall: Vec3 = [p0[0], p0[1] + G.ax[1] * v * f, zAt(f)];
    if (fall[2] > G.waterZ - 2) return { p: fall, phase: "fall" };
    if (!impact) {
      let lo = 0;
      let hi = f;
      for (let n = 0; n < 30; n++) {
        const m = (lo + hi) / 2;
        if (zAt(m) > G.waterZ - 2) lo = m;
        else hi = m;
      }
      impact = { f: lo, p: [p0[0], p0[1] + G.ax[1] * v * lo, G.waterZ - 2] };
      splash = { t0: performance.now(), p: impact.p };
    }
    const sink = f - impact.f;
    return { p: [impact.p[0], impact.p[1] - sink * 6, impact.p[2] - sink * 16], phase: "sink", sink };
  }
  function slotFor(st: Phase): SVGGElement {
    if (st.phase === "roll") return st.s < G.sGate ? slots.front : slots.back;
    return st.p[2] > G.poolH + G.coinR - 1 ? slots.above : slots.in;
  }
  function placeNote() {
    const p = impact ? impact.p : [G.rest[0], -82, G.waterZ];
    const q = iso([p[0], p[1] - 4, G.waterZ]);
    newNote.setAttribute("cx", q[0].toFixed(1));
    newNote.setAttribute("cy", q[1].toFixed(1));
  }
  function coinHome(opacity: number) {
    coin.removeAttribute("transform");
    coin.setAttribute("opacity", opacity.toFixed(3));
    if (coin.parentNode !== slots.front) slots.front.appendChild(coin);
  }

  function tick(now: number) {
    let busy = false;
    if (anim) {
      const u = clamp((now - anim.t0) / 1000 / T_SEAL);
      sealPos[anim.i] = sealOffset(anim.i, u);
      if (!anim.stamped && u >= PRESS) {
        anim.stamped = true;
        mark(anim.i);
      }
      if (u >= 1) {
        const { resolve } = anim;
        anim = null;
        resolve();
      } else busy = true;
    }
    shakes = shakes.filter((q) => now - q.t0 < 420);
    if (shakes.length) busy = true;
    placeSeals(now);
    if (gate) {
      const t = clamp((now - gate.t0) / GATE_MS);
      setShutter(G.shutLift * (1 - Math.pow(1 - t, 3)));
      if (t >= 0.55 && !coinRun) coinRun = { t0: now };
      if (t >= 1) gate = null;
      else busy = true;
    }
    if (coinRun) {
      const st = coinAt((now - coinRun.t0) / 1000);
      const want = slotFor(st);
      if (coin.parentNode !== want) want.appendChild(coin);
      coin.setAttribute("transform", move([st.p[0] - G.rest[0], st.p[1] - G.rest[1], st.p[2] - G.rest[2]]));
      const op = st.phase === "sink" ? clamp(1 - st.sink / 0.7) : 1;
      coin.setAttribute("opacity", op.toFixed(3));
      if (st.phase === "sink" && op <= 0) {
        coinRun = null;
        coin.remove();
        placeNote();
        newNote.classList.add("on");
      } else busy = true;
    }
    if (splash) {
      const sp = splash;
      const t = (now - sp.t0) / 1000;
      ripples.forEach((el, n) => {
        const tt = t - n * 0.22;
        if (tt < 0) return void el.setAttribute("opacity", "0");
        el.setAttribute("d", ringD(sp.p[0], sp.p[1], 2 + tt * 22, G.waterZ));
        el.setAttribute("opacity", clamp(0.9 * (1 - tt / 1.3)).toFixed(3));
      });
      if (t > 1.8) splash = null;
      else busy = true;
    }
    if (tweens.length) {
      tweens = tweens.filter((tw) => {
        const u = clamp((now - tw.t0) / tw.dur);
        tw.step(tw.ease(u));
        if (u < 1) return true;
        tw.end?.();
        return false;
      });
      if (tweens.length) busy = true;
    }
    frame = busy ? requestAnimationFrame(tick) : 0;
  }
  const run = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const tween = (dur: number, delay: number, ease: (t: number) => number, step: (v: number) => void, end?: () => void) => {
    tweens.push({ t0: performance.now() + delay, dur, ease, step, end });
  };

  /** Lands a seal in flight at once (a reset, a break or a second stamp while it moves). */
  function settle() {
    if (!anim) return;
    const { i, stamped, resolve } = anim;
    anim = null;
    sealPos[i] = [0, 0, 0];
    if (!stamped) mark(i);
    resolve();
  }

  function stamp(i: number): Promise<void> {
    settle();
    if (opts.reduced) {
      mark(i);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      anim = { i, t0: performance.now(), stamped: false, resolve };
      run();
    });
  }

  function shake(i: number) {
    if (opts.reduced) return;
    shakes = shakes.filter((q) => q.i !== i);
    shakes.push({ i, t0: performance.now() });
    run();
  }

  function open() {
    if (opts.reduced) {
      setShutter(G.shutLift);
      coin.remove();
      placeNote();
      newNote.classList.add("on");
      return;
    }
    gate = { t0: performance.now() };
    run();
  }

  function breakSeals() {
    settle();
    broken = true;
    gate = null;
    const coinMoved = coinRun !== null || !coin.isConnected || coin.hasAttribute("transform");
    coinRun = null;
    cue();
    newNote.classList.remove("on");
    lamps.forEach((l) => l.classList.remove("on"));
    seals.forEach((s) => {
      s.classList.add("used");
      s.setAttribute("aria-disabled", "true");
    });
    for (let i = 0; i < done; i++) {
      imps[i].classList.add("cracked");
      cracks[i].classList.add("on");
    }
    latches.forEach((l) => l.classList.remove("out"));
    if (opts.reduced) {
      latches.forEach((l) => l.removeAttribute("transform"));
      setShutter(0);
      coinHome(1);
      return;
    }
    const paths = (i: number) => all<SVGPathElement>(cracks[i], "path");
    for (let i = 0; i < done; i++) {
      paths(i).forEach((p) => p.setAttribute("stroke-dashoffset", "1"));
      tween(500, i * 80, motionEase.snapSettle, (v) => paths(i).forEach((p) => p.setAttribute("stroke-dashoffset", (1 - v).toFixed(3))));
    }
    latches.forEach((l, i) => {
      if (!l.hasAttribute("transform")) return;
      tween(433, 200 + i * 67, motionEase.accelExit, (v) => l.setAttribute("transform", move([0, 0, 4 * (1 - v)])), () => l.removeAttribute("transform"));
    });
    const from = shutZ;
    if (from > 0) tween(433, 0, motionEase.accelExit, (v) => setShutter(from * (1 - v)));
    if (coinMoved) {
      coinHome(0);
      tween(400, 500, motionEase.softLand, (v) => coin.setAttribute("opacity", v.toFixed(3)));
    }
    run();
  }

  function reset() {
    settle();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    done = 0;
    broken = false;
    shakes = [];
    gate = null;
    coinRun = null;
    impact = null;
    splash = null;
    tweens = [];
    [0, 1, 2].forEach((i) => {
      sealPos[i] = [0, 0, 0];
      imps[i].classList.remove("on", "cracked");
      cracks[i].classList.remove("on");
      all<SVGPathElement>(cracks[i], "path").forEach((p) => p.removeAttribute("stroke-dashoffset"));
      latches[i].classList.remove("out");
      latches[i].removeAttribute("transform");
      lamps[i].classList.remove("on");
      seals[i].classList.remove("used");
      seals[i].removeAttribute("aria-disabled");
    });
    placeSeals(performance.now());
    setShutter(0);
    coinHome(1);
    ripples.forEach((el) => el.setAttribute("opacity", "0"));
    newNote.classList.remove("on");
    cue();
  }

  function setLabels(map: Record<string, string>) {
    all<SVGElement>(svg, "[data-i18n]").forEach((el) => {
      const s = map[el.dataset.i18n ?? ""];
      if (s !== undefined && el.textContent !== s) el.textContent = s;
    });
    [svg, ...all<SVGElement>(svg, "[data-i18n-aria]")].forEach((el) => {
      const s = map[el.dataset.i18nAria ?? ""];
      if (s !== undefined) el.setAttribute("aria-label", s);
    });
  }

  // input: click or Enter/Space on a seal; 1/2/3 while the figure (or a seal in it) has focus
  const off = new AbortController();
  const { signal } = off;
  seals.forEach((el, i) => {
    el.addEventListener("click", () => opts.onPress(i), { signal });
    el.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        opts.onPress(i);
      },
      { signal },
    );
  });
  svg.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "1" && e.key !== "2" && e.key !== "3") return;
      e.preventDefault();
      opts.onPress(Number(e.key) - 1);
    },
    { signal },
  );

  cue();

  return {
    stamp,
    shake,
    open,
    breakSeals,
    reset,
    setLabels,
    destroy() {
      off.abort();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      settle();
      tweens = [];
    },
  };
}
