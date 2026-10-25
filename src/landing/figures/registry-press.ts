// Runtime for the chapter 2 registry press (registry-press.svg, built by
// scripts/figures/registry-press.build.mjs). The drawing is static; this moves its parts: the lever
// goes down, the invoice feeds from the tray into the press, the hashing drum and its flywheel
// spin, the fingerprint runs down the cable to the print carriage, which drives to the next ruled
// line of the public board and stamps N there, while the paper leaves by the exit slot and drops
// into the shielded vault. No state of its own about the invoice: the chapter computes N with
// jitsuin-wasm and calls press(short N) / editAmount / editDue / reset.
// requestAnimationFrame runs only while the press moves. Colours and the lever's cue blink live in
// landing.css (.rp-*); only transforms, opacities and path data are written here, as attributes.

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Geometry {
  P: { origin: Vec2; scale: number; azimuth?: number; elevation?: number };
  lever: { x: number; y: number; z: number; len: number; rest: number; down: number; knob: number };
  drum: { x0: number; x1: number; cy: number; cz: number; r: number };
  wheel: { x0: number; x1: number; cy: number; cz: number; r: number };
  rows: number[];
  newRows: number[];
  park: number;
  drop: number;
  trayTop: number;
  exitZ: number;
  vt: number;
  feedDy: number;
  inDx: number;
  exitDx: number;
  sink: number;
  wire: Vec3[];
}

/** Where a press is: the lever is down and the invoice feeds; the drum hashes; N goes to the board; done. */
export type PressPhase = "feed" | "hash" | "print" | "done";

export interface RegistryPressOptions {
  reduced: boolean;
  /** The lever was pulled (click, Enter/Space on it, or P with the figure focused). */
  onPress: () => void;
  /** A press reached a new phase. */
  onPhase?: (phase: PressPhase) => void;
}

export interface RegistryPress {
  /** Feeds the invoice and prints nShort on the board's next line; resolves when the press is at rest. */
  press(nShort: string): Promise<void>;
  /** The amount on the invoice in the tray (edited marks it); a pressed invoice comes back to the tray. */
  editAmount(text: string, edited: boolean): void;
  /** The due date on the invoice, the same way. */
  editDue(text: string, edited: boolean): void;
  /** Empty lines, the invoice back in the tray, the press at rest. */
  reset(): void;
  /** Texts for [data-i18n] and aria labels for [data-i18n-aria], by key. */
  setLabels(map: Record<string, string>): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
const T_END = 5.0; // one press, in seconds
const SHEETS_AT_REST = 2;

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));

function geometryOf(svg: SVGSVGElement): Geometry {
  const raw = svg.dataset.geometry;
  if (!raw) throw new Error("registry-press: the svg has no data-geometry");
  return JSON.parse(raw) as Geometry;
}

const all = <E extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll<E>(sel)];
function one<E extends Element>(root: ParentNode, sel: string): E {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`registry-press: missing ${sel}`);
  return el;
}

export function mountRegistryPress(svg: SVGSVGElement, opts: RegistryPressOptions): RegistryPress {
  const G = geometryOf(svg);
  const { P, lever: LV, drum: DRUM, wheel: WHEEL } = G;
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
  const view: Vec3 = [cam.ca * cam.ce, cam.sa * cam.ce, cam.se];

  const part = <E extends Element>(name: string) => one<E>(svg, `[data-part="${name}"]`);
  const slots = Object.fromEntries(all<SVGGElement>(svg, "[data-slot]").map((el) => [el.dataset.slot!, el])) as Record<"feed" | "out" | "in", SVGGElement>;
  const paper = part<SVGGElement>("paper");
  const lever = part<SVGGElement>("lever");
  const carriage = part<SVGGElement>("carriage");
  const stamp = part<SVGGElement>("stamp");
  const lamp = part<SVGCircleElement>("lamp");
  const spokes = part<SVGPathElement>("spokes");
  const crank = part<SVGCircleElement>("crank");
  const pulse = part<SVGCircleElement>("pulse");
  const ribs = [...part<SVGGElement>("ribs").children] as SVGPathElement[];
  const [leverO, leverC, knob, shine] = [".lever-o", ".lever-c", ".lever-knob", ".lever-shine"].map((s) => one<SVGElement>(lever, s));
  const amountEl = one<SVGTSpanElement>(svg, "[data-amount]");
  const dueEl = one<SVGTSpanElement>(svg, "[data-due]");
  const entries = G.newRows.map((r) => one<SVGGElement>(svg, `.entry[data-row="${r}"]`));
  const sheets = all<SVGPathElement>(svg, "[data-sheet]");

  let inTray = true;
  let printed = 0;
  let sheetsIn = SHEETS_AT_REST;
  let run: { t0: number; n: string; row: number; fresh: boolean; phase: PressPhase | null; sheet: boolean; inked: boolean; resolve: () => void; done: Promise<void> } | null = null;
  let frame = 0;
  let spin = 0;
  let last = 0;

  // ---- drawing helpers: each acts on one element ----
  function drawLever(deg: number) {
    const a = deg * RAD;
    const p0: Vec3 = [LV.x, LV.y, LV.z];
    const p1: Vec3 = [LV.x + LV.len * Math.cos(a), LV.y, LV.z + LV.len * Math.sin(a)];
    const d = `M${pt(p0)}L${pt(p1)}`;
    const w = 2.4 * cam.k;
    const e = iso(p1);
    const r = LV.knob * cam.k;
    leverO.setAttribute("d", d);
    leverO.setAttribute("stroke-width", (w + 1.2).toFixed(2));
    leverC.setAttribute("d", d);
    leverC.setAttribute("stroke-width", w.toFixed(2));
    knob.setAttribute("cx", e[0].toFixed(1));
    knob.setAttribute("cy", e[1].toFixed(1));
    shine.setAttribute("cx", (e[0] - r * 0.35).toFixed(1));
    shine.setAttribute("cy", (e[1] - r * 0.4).toFixed(1));
  }
  // the drum's ribs (axis along x) and the flywheel's spokes turn by the same angle
  function drawDrum(phase: number) {
    ribs.forEach((el, i) => {
      const a = phase + (i / ribs.length) * Math.PI * 2;
      const cy = Math.cos(a);
      const sz = Math.sin(a);
      const face = cy * view[1] + sz * view[2];
      if (face < 0.04) return void el.removeAttribute("d");
      const y = DRUM.cy + DRUM.r * cy;
      const z = DRUM.cz + DRUM.r * sz;
      el.setAttribute("d", `M${pt([DRUM.x0 + 1, y, z])}L${pt([DRUM.x1 - 1, y, z])}`);
      el.setAttribute("stroke-opacity", Math.min(1, face * 1.8).toFixed(2));
    });
    let d = "";
    for (let i = 0; i < 5; i++) {
      const a = phase + (i / 5) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      d += `M${pt([WHEEL.x1, WHEEL.cy + 3 * c, WHEEL.cz + 3 * s])}L${pt([WHEEL.x1, WHEEL.cy + (WHEEL.r - 2.4) * c, WHEEL.cz + (WHEEL.r - 2.4) * s])}`;
    }
    spokes.setAttribute("d", d);
    const q = iso([WHEEL.x1 + 0.6, WHEEL.cy + (WHEEL.r - 1.2) * Math.cos(phase + 0.6), WHEEL.cz + (WHEEL.r - 1.2) * Math.sin(phase + 0.6)]);
    crank.setAttribute("cx", q[0].toFixed(1));
    crank.setAttribute("cy", q[1].toFixed(1));
  }
  // the invoice: which slot it is drawn in and how far it has moved from the tray
  function placePaper(slot: keyof typeof slots, [dx, dy, dz]: Vec3, op = 1) {
    if (paper.parentNode !== slots[slot]) slots[slot].appendChild(paper);
    if (dx || dy || dz) paper.setAttribute("transform", move([dx, dy, dz]));
    else paper.removeAttribute("transform");
    paper.setAttribute("opacity", op.toFixed(3));
  }
  function placeCarriage(y: number, drop: number) {
    if (y === G.park) carriage.removeAttribute("transform");
    else carriage.setAttribute("transform", move([0, y - G.park, 0]));
    if (drop) stamp.setAttribute("transform", move([0, 0, -drop]));
    else stamp.removeAttribute("transform");
  }
  function placePulse(u: number) {
    if (u <= 0 || u >= 1) return void pulse.setAttribute("opacity", "0");
    const seg = G.wire.length - 1;
    const f = u * seg;
    const i = Math.min(seg - 1, Math.floor(f));
    const t = f - i;
    const p = iso(G.wire[i].map((v, n) => lerp(v, G.wire[i + 1][n], t)) as Vec3);
    pulse.setAttribute("cx", p[0].toFixed(1));
    pulse.setAttribute("cy", p[1].toFixed(1));
    pulse.setAttribute("opacity", "1");
  }
  function printRow(n: string) {
    const el = entries[printed];
    if (!el) return;
    entries.forEach((e) => e.classList.remove("fresh"));
    one<SVGTextElement>(el, "[data-n]").textContent = `N ${n}`;
    el.classList.add("on", "fresh");
    printed++;
  }
  function clearRows() {
    printed = 0;
    entries.forEach((e) => {
      e.classList.remove("on", "fresh");
      one<SVGTextElement>(e, "[data-n]").textContent = "";
    });
  }
  function addSheet() {
    sheets[sheetsIn]?.classList.add("on");
    sheetsIn = Math.min(sheets.length, sheetsIn + 1);
  }
  const cue = () => {
    lever.classList.toggle("cue", !run);
    lever.setAttribute("aria-disabled", String(!!run));
  };
  const phase = (p: PressPhase) => {
    if (!run || run.phase === p) return;
    run.phase = p;
    opts.onPhase?.(p);
  };
  /** A pressed invoice comes back to the tray (a new copy, or the edited one). */
  function backToTray() {
    if (run || inTray) return;
    inTray = true;
    placePaper("feed", [0, 0, 0], 1);
  }

  // ---- one press: a timeline in seconds ----
  function frameAt(t: number) {
    const r = run!;
    const row = r.row;
    // the lever goes down, then back up
    drawLever(lerp(LV.rest, LV.down, span(t, 0, 0.45)) + (LV.rest - LV.down) * span(t, 1.3, 1.9));
    // the invoice: tray, into the press, out over the hopper, down into the vault
    if (t < 2.4) placePaper("feed", [0, G.feedDy * span(t, 0.25, 1.55), 0], r.fresh ? span(t, 0, 0.2) : 1);
    else if (t < 3.25) placePaper("out", [lerp(G.inDx, G.exitDx, span(t, 2.4, 3.2)), G.feedDy, G.exitZ - G.trayTop]);
    else placePaper("in", [G.exitDx, G.feedDy, G.exitZ - G.trayTop - G.sink * span(t, 3.25, 4.0)], 1 - span(t, 3.6, 4.0));
    if (t >= 4.0 && !r.sheet) {
      r.sheet = true;
      addSheet();
    }
    lamp.classList.toggle("on", t > 0.9 && t < 2.7);
    // N runs down the cable to the carriage
    placePulse(clamp((t - 2.6) / 0.5));
    // the carriage: park, the line, stamp down, print, stamp up, park
    const y = lerp(G.park, row, span(t, 3.0, 3.6)) + (G.park - row) * span(t, 4.2, 4.9);
    placeCarriage(y, G.drop * (span(t, 3.6, 3.8) - span(t, 3.85, 4.1)));
    if (t >= 3.8 && !r.inked) {
      r.inked = true;
      printRow(r.n);
    }
    phase(t < 0.9 ? "feed" : t < 2.6 ? "hash" : "print");
  }
  const omega = (t: number) => 14 * (span(t, 0.9, 1.3) - span(t, 2.3, 2.9));
  function tick(now: number) {
    if (!run) return void (frame = 0);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const t = (now - run.t0) / 1000;
    spin += omega(t) * dt;
    drawDrum(spin);
    frameAt(Math.min(t, T_END));
    if (t >= T_END) return finish();
    frame = requestAnimationFrame(tick);
  }
  function finish() {
    const r = run;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    placeCarriage(G.park, 0);
    drawLever(LV.rest);
    lamp.classList.remove("on");
    placePulse(0);
    placePaper("feed", [0, 0, 0], 0);
    inTray = false;
    if (!r) return;
    if (!r.sheet) addSheet();
    if (!r.inked) printRow(r.n);
    run = null;
    cue();
    opts.onPhase?.("done");
    r.resolve();
  }

  function press(nShort: string): Promise<void> {
    if (run) return run.done;
    if (printed >= entries.length) clearRows(); // the page is full: a fresh page
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const fresh = !inTray;
    inTray = true;
    run = { t0: performance.now(), n: nShort, row: G.rows[G.newRows[printed]], fresh, phase: null, sheet: false, inked: false, resolve, done };
    cue();
    if (opts.reduced) {
      phase("feed");
      finish();
      return done;
    }
    placePaper("feed", [0, 0, 0], fresh ? 0 : 1);
    frame = requestAnimationFrame(tick);
    return done;
  }

  function editAmount(text: string, edited: boolean) {
    if (amountEl.textContent !== text) amountEl.textContent = text;
    amountEl.classList.toggle("edited", edited);
    backToTray();
  }
  function editDue(text: string, edited: boolean) {
    if (dueEl.textContent !== text) dueEl.textContent = text;
    dueEl.classList.toggle("edited", edited);
    backToTray();
  }

  function reset() {
    const r = run;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    run = null;
    inTray = true;
    clearRows();
    sheetsIn = SHEETS_AT_REST;
    sheets.forEach((s, i) => s.classList.toggle("on", i < SHEETS_AT_REST));
    placePaper("feed", [0, 0, 0], 1);
    placeCarriage(G.park, 0);
    drawLever(LV.rest);
    lamp.classList.remove("on");
    placePulse(0);
    cue();
    r?.resolve();
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

  // input: click or Enter/Space on the lever; P while the figure (or the lever) has focus
  const off = new AbortController();
  const { signal } = off;
  lever.addEventListener("click", () => opts.onPress(), { signal });
  svg.addEventListener(
    "keydown",
    (e) => {
      const onLever = e.target === lever && (e.key === "Enter" || e.key === " ");
      if (!onLever && e.key !== "p" && e.key !== "P") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      opts.onPress();
    },
    { signal },
  );

  cue();

  return {
    press,
    editAmount,
    editDue,
    reset,
    setLabels,
    destroy() {
      off.abort();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      run?.resolve();
      run = null;
    },
  };
}
