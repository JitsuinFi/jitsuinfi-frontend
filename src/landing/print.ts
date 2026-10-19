// N drawn as an illustrated fingerprint (SVG line art in the site's ink): a paper fingertip, ~20
// ridges that cap over the top and bend round a core, a core that is rings, a spiral or a loop,
// one clean minutia (a ridge break), and friendly callouts that say which bytes of N shaped what.
// Every number comes from N's 32 bytes, so each invoice has its own print. A new N redraws the
// ridges with anime.js while a seal-red scan line passes over.
import { animate, stagger, svg as animeSvg } from "animejs";
import { dur, ease } from "./motion";

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const svg = (tag: string, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

type Pt = [number, number];
type Pattern = "rings" | "spiral" | "loop";

interface Shape {
  core: Pt;
  spacing: number;
  coreR: number;
  ratio: number;
  tilt: number;
  pattern: Pattern;
  flat: number;
  bytes: number[];
}

/** The fingertip: rounder on top (SVG y grows downward). */
const TIP = { rxT: 128, ryT: 168, rxB: 128, ryB: 150 };
const inTip = ([x, y]: Pt, pad = 0) => {
  const ry = y < 0 ? TIP.ryT : TIP.ryB;
  return (x / (TIP.rxT - pad)) ** 2 + (y / (ry - pad)) ** 2 <= 1;
};

function shapeOf(n: string): Shape {
  const b = Array.from({ length: 32 }, (_, i) => parseInt(n.slice(i * 2, i * 2 + 2), 16));
  const u = (i: number) => b[i] / 255;
  return {
    core: [(u(0) - 0.5) * 50, -14 + (u(1) - 0.5) * 50],
    spacing: 13 + u(2) * 3,
    coreR: 44 + u(3) * 22,
    ratio: 1.05 + u(4) * 0.3,
    tilt: (u(5) - 0.5) * 0.6,
    pattern: u(6) < 0.34 ? "rings" : u(6) < 0.67 ? "spiral" : "loop",
    flat: 0.6 + u(16) * 0.16,
    bytes: b,
  };
}

/** A smooth path through points (quadratic curves through the midpoints). */
function smooth(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const mx = (x + pts[i + 1][0]) / 2;
    const my = (y + pts[i + 1][1]) / 2;
    d += ` Q${x.toFixed(1)} ${y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
}

/** The ridges of a shape, as path data. */
function ridgesOf(s: Shape): { outer: string[]; inner: string[] } {
  const [cx, cy] = s.core;
  const ct = Math.cos(s.tilt);
  const st = Math.sin(s.tilt);
  // the core zone: outer ridges are pushed out of it, compressed into a band round the core
  const zIn = s.coreR + s.spacing * 0.9;
  const zOut = s.coreR + s.spacing * 5.2; // a wide band, so the ridges bend gently round the core
  // measured in the core's own frame (tilted, stretched by ratio), the same frame the rings use
  const bend = ([x, y]: Pt): Pt => {
    const ox = x - cx;
    const oy = y - cy;
    const lx = ox * ct + oy * st;
    const ly = (-ox * st + oy * ct) / s.ratio;
    const d = Math.hypot(lx, ly);
    if (d >= zOut || d < 1e-6) return [x, y];
    const k = (zIn + (d / zOut) * (zOut - zIn)) / d;
    const nx = lx * k;
    const ny = ly * k * s.ratio;
    return [cx + nx * ct - ny * st, cy + nx * st + ny * ct];
  };
  // outer ridges: caps round a centre far below the fingertip
  const Y0 = 330;
  const outer: string[] = [];
  const b = s.bytes;
  // one clean break, away from the core and the edge
  const breaks = [0].map((k) => ({ ridge: 3 + (b[7 + k] % 6), x: ((b[10 + k] / 255) - 0.5) * 120, w: 9 }));
  let ridge = 0;
  for (let R = Y0 - TIP.ryB + 6; R < Y0 + TIP.ryT; R += s.spacing, ridge++) {
    let run: Pt[] = [];
    const flush = () => {
      if (run.length > 7) outer.push(smooth(run)); // no stray stubs
      run = [];
    };
    for (let x = -TIP.rxT; x <= TIP.rxT; x += 3.5) {
      const h = R * R - (s.flat * x) ** 2;
      if (h <= 0) {
        flush();
        continue;
      }
      const p = bend([x, Y0 - Math.sqrt(h)]);
      const gap = breaks.some((g) => g.ridge === ridge && Math.abs(x - g.x) < g.w);
      if (!inTip(p, 12) || gap) {
        flush();
        continue;
      }
      // a ridge through the very centre splits round the core: never bridge the jump
      const prev = run[run.length - 1];
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > s.spacing * 1.6) flush();
      run.push(p);
    }
    flush();
  }
  // inner ridges: rings, a spiral, or a loop open toward the base
  const inner: string[] = [];
  const at = (r: number, a: number): Pt => {
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * s.ratio;
    return [cx + x * ct - y * st, cy + x * st + y * ct];
  };
  if (s.pattern === "spiral") {
    const pts: Pt[] = [];
    for (let a = 0; ; a += 0.12) {
      const r = 5 + (s.spacing * a) / (Math.PI * 2);
      if (r > s.coreR - s.spacing * 0.2) break;
      pts.push(at(r, a));
    }
    inner.push(smooth(pts));
  } else {
    for (let r = s.spacing * 0.75; r <= s.coreR - s.spacing * 0.2; r += s.spacing) {
      const pts: Pt[] = [];
      const open = s.pattern === "loop" ? 0.55 : 0; // the loop opens toward the base
      const a0 = Math.PI / 2 + open;
      const a1 = Math.PI / 2 + Math.PI * 2 - open;
      for (let a = a0; a <= a1 + 1e-6; a += 0.1) pts.push(at(r, a));
      inner.push(smooth(pts) + (open ? "" : " Z"));
    }
  }
  return { outer, inner };
}

export interface PrintView {
  el: SVGSVGElement;
  /** draws N's print; `animated` redraws the ridges and runs the scan line */
  set(n: string, animated: boolean): void;
}

export function createPrintView(): PrintView {
  const root = svg("svg", { class: "fp-illus", viewBox: "-212 -200 424 400", "aria-hidden": "true" }) as SVGSVGElement;
  const defs = svg("defs");
  const clip = svg("clipPath", { id: "fp-tip" });
  const tipD = `M${-TIP.rxT} 0 A${TIP.rxT} ${TIP.ryT} 0 0 1 ${TIP.rxT} 0 A${TIP.rxB} ${TIP.ryB} 0 0 1 ${-TIP.rxT} 0 Z`;
  clip.append(svg("path", { d: tipD }));
  defs.append(clip);
  root.append(defs);
  // the paper fingertip, lifted off the page
  root.append(svg("path", { d: tipD, class: "fp-tip" }));
  const art = svg("g", { "clip-path": "url(#fp-tip)" });
  root.append(art);
  const scan = svg("rect", { x: -TIP.rxT, y: -TIP.ryT - 10, width: TIP.rxT * 2, height: 3, class: "fp-scan", opacity: 0 });
  art.append(scan);
  root.append(svg("path", { d: tipD, class: "fp-tip-line" }));
  // the core marker
  const coreG = svg("g", { class: "fp-core-mark" });
  coreG.append(svg("circle", { r: 9, class: "fp-core-ring" }), svg("circle", { r: 3.6, class: "fp-core-dot" }));
  root.append(coreG);
  // callouts: which bytes of N shaped what
  const callout = (anchorClass: string) => {
    const g = svg("g", { class: `fp-callout ${anchorClass}` });
    const line = svg("path", { class: "fp-callout-line" });
    const dot = svg("circle", { r: 2.6, class: "fp-callout-dot" });
    const t1 = svg("text", { class: "fp-callout-text" });
    const t2 = svg("text", { class: "fp-callout-sub" });
    g.append(line, dot, t1, t2);
    root.append(g);
    return { g, line, dot, t1, t2 };
  };
  const cCore = callout("is-core");
  const cPattern = callout("is-pattern");
  const cRidges = callout("is-ridges");
  const cTilt = callout("is-tilt");
  const place = (c: ReturnType<typeof callout>, from: Pt, elbow: Pt, to: Pt, text: string, sub: string, anchor: "start" | "end") => {
    c.line.setAttribute("d", `M${from[0]} ${from[1]} L${elbow[0]} ${elbow[1]} L${to[0]} ${to[1]}`);
    c.dot.setAttribute("cx", String(from[0]));
    c.dot.setAttribute("cy", String(from[1]));
    for (const [t, dy] of [[c.t1, -6], [c.t2, 12]] as const) {
      t.setAttribute("x", String(to[0] + (anchor === "start" ? 6 : -6)));
      t.setAttribute("y", String(to[1] + dy));
      t.setAttribute("text-anchor", anchor);
    }
    c.t1.textContent = text;
    c.t2.textContent = sub;
  };

  let group: SVGGElement | null = null;
  const NAMES: Record<Pattern, string> = { rings: "whorl", spiral: "spiral whorl", loop: "loop" };

  const set = (n: string, animated: boolean) => {
    const s = shapeOf(n);
    const { outer, inner } = ridgesOf(s);
    const g = svg("g", { class: "fp-ridges" }) as SVGGElement;
    const paths: SVGPathElement[] = [];
    for (const d of outer) paths.push(g.appendChild(svg("path", { d, class: "fp-ridge" })) as SVGPathElement);
    for (const d of inner) paths.push(g.appendChild(svg("path", { d, class: "fp-ridge is-core" })) as SVGPathElement);
    art.insertBefore(g, scan);
    const old = group;
    group = g;
    const [cx, cy] = s.core;
    coreG.setAttribute("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
    const ridgeCount = outer.length > 0 ? Math.round((TIP.ryT + TIP.ryB) / s.spacing) : 0;
    const deg = Math.round((s.tilt * 180) / Math.PI);
    place(cCore, [cx + 10, cy], [cx + 50, cy - 36], [136, cy - 36], "core", "bytes 00–01", "start");
    place(cPattern, [-66, -126], [-100, -158], [-136, -158], NAMES[s.pattern], "byte 06", "end");
    place(cRidges, [-98, 64], [-120, 104], [-136, 104], `${ridgeCount} ridges`, "byte 02", "end");
    place(cTilt, [72, 110], [104, 146], [136, 146], `tilt ${deg >= 0 ? "+" : "−"}${Math.abs(deg)}°`, "byte 05", "start");
    if (!animated) {
      old?.remove();
      return;
    }
    if (old) animate(old, { opacity: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit), onComplete: () => old.remove() });
    // the new ridges draw in, outer to inner, with a seal-red pen that settles to ink
    g.classList.add("is-drawing");
    animate(animeSvg.createDrawable(paths), { draw: ["0 0", "0 1"], duration: dur.sink, delay: stagger(14), ease: fn(ease.softInOut) });
    setTimeout(() => g.classList.remove("is-drawing"), dur.sink + paths.length * 14);
    const sc = { y: 0 };
    animate(sc, {
      y: 1,
      duration: dur.sink + 200,
      ease: fn(ease.softInOut),
      onUpdate: () => {
        scan.setAttribute("y", (-TIP.ryT + sc.y * (TIP.ryT + TIP.ryB)).toFixed(1));
        scan.setAttribute("opacity", (Math.sin(Math.PI * sc.y) * 0.9).toFixed(2));
      },
    });
    animate([coreG, cCore.g, cPattern.g, cRidges.g, cTilt.g], { opacity: { from: 0, to: 1 }, duration: dur.enter, delay: stagger(67, { start: dur.sink * 0.6 }), ease: fn(ease.softLand) });
  };
  return { el: root, set };
}
