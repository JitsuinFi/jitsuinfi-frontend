// The clerk's loupe over the handed-in sheet (HNK-34.T4): hairline's loupe figure ported as plain
// SVG (same camera idea: the counter plane projected, the lens on three legs at height LZ, the
// sheet magnified 1.5x inside the glass through <use>). Strokes are non-scaling hairlines in
// DS-PAL inks (verify.css). The page drives it with real results: the loupe slides line by line,
// presses each check's mark, and dots the lines it reads. Reduced motion shows end states.
import { dur, ease, tween, still } from "../try/anim";
import { M, P, docSvg, layout, unproject, type Layout, type Sheet } from "./sheet";

const NS = "http://www.w3.org/2000/svg";
const LZ = 46;
const R = 60;
const GLASS = 56;
const FOOT = 88;
const MAG = 1.5;
const LEGS = [50, 170, 290].map((a) => (a * Math.PI) / 180);

type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
};

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return "M" + pts.join("L");
}

interface Parts {
  clipC: SVGCircleElement;
  shadow: SVGCircleElement;
  pads: SVGCircleElement[];
  legs: SVGPathElement;
  ring: SVGCircleElement[];
  mag: SVGGElement;
  shine: SVGPathElement;
  shine2: SVGPathElement;
}

export class Loupe {
  readonly svg: SVGSVGElement;
  L!: Layout;
  private drop!: SVGGElement;
  private rows: SVGGElement[] = [];
  private p!: Parts;
  private lx = NaN;
  private ly = NaN;
  private follow = 0;
  private target: [number, number] | null = null;
  /** True while the loupe follows the pointer (nothing handed in yet). */
  idle = true;

  constructor(host: HTMLElement, label: string) {
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("class", "vf-scene");
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", label);
    host.replaceChildren(this.svg);
    this.svg.addEventListener("pointermove", this.onMove);
    this.svg.addEventListener("pointerleave", this.onLeave);
  }

  destroy(): void {
    cancelAnimationFrame(this.follow);
    this.svg.removeEventListener("pointermove", this.onMove);
    this.svg.removeEventListener("pointerleave", this.onLeave);
    this.svg.remove();
  }

  private restAt(L = this.L): [number, number] {
    return L.narrow ? [L.W - 104, 112] : [L.W - 150, 122];
  }

  /** Draws the sheet (or the blank one) with the loupe at rest. Marks start hidden. */
  build(sheet: Sheet | null, narrow: boolean): void {
    const L = (this.L = layout(sheet, narrow));
    this.svg.replaceChildren();
    // view box: the sheet, the loupe's reach and its height
    const pts: Array<[number, number]> = [];
    for (const [x, y] of [[0, 0], [L.W, 0], [0, L.H], [L.W, L.H]]) pts.push(P(x, y, -2.6), P(x + 10, y + 14, 0));
    const reach: Array<[number, number]> = [this.restAt(L), [60, 40], [L.W - 60, 40], [60, L.H - 30], [L.W - 60, L.H - 30], [L.mx - 6, 80], [L.mx - 6, L.H - 30]];
    for (const [x, y] of reach) {
      for (let a = 0; a < 360; a += 15) {
        const r = (a * Math.PI) / 180;
        pts.push(P(x + R * Math.cos(r), y + R * Math.sin(r), LZ));
      }
      for (const a of LEGS) pts.push(P(x + FOOT * Math.cos(a), y + FOOT * Math.sin(a), 0));
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 6;
    const y0 = Math.min(...ys) - 6;
    this.svg.setAttribute("viewBox", `${x0.toFixed(1)} ${y0.toFixed(1)} ${(Math.max(...xs) - x0 + 6).toFixed(1)} ${(Math.max(...ys) - y0 + 6).toFixed(1)}`);
    const svg = this.svg;
    const defs = el("defs", {}, svg);
    const clip = el("clipPath", { id: "vf-lens-clip" }, defs);
    const clipC = el("circle", { r: GLASS - 1 }, clip);
    // the sheet lying on the counter: shadow, edge, face
    el("rect", { class: "plate-shadow", x: 10, y: 14, width: L.W, height: L.H, rx: 4 }, el("g", { transform: M(0) }, svg));
    el("rect", { class: "plate-side", x: 0, y: 0, width: L.W, height: L.H, rx: 3 }, el("g", { transform: M(-2.6) }, svg));
    const face = el("g", { transform: M(0) }, svg);
    this.drop = el("g", {}, face);
    const doc = el("g", { id: "vf-doc" }, this.drop);
    doc.innerHTML = docSvg(L, sheet);
    this.rows = [...doc.querySelectorAll<SVGGElement>(".vf-row")];
    // the loupe
    const lens = el("g", { class: "loupe" }, svg);
    const flat = el("g", { transform: M(0) }, lens);
    const shadow = el("circle", { class: "lens-shadow", r: R + 2 }, flat);
    const pads = LEGS.map(() => el("circle", { class: "pad", r: 3.2 }, flat));
    const legs = el("path", { class: "leg" }, lens);
    const rimLo = el("circle", { class: "rim-lo", r: R }, el("g", { transform: M(LZ - 6) }, lens));
    const top = el("g", { transform: M(LZ) }, lens);
    const bg = el("circle", { class: "glass-bg", r: GLASS }, top);
    const mag = el("g", {}, el("g", { "clip-path": "url(#vf-lens-clip)" }, top));
    el("use", { href: "#vf-doc" }, mag);
    const glass = el("circle", { class: "glass", r: GLASS }, top);
    const shine = el("path", { class: "shine" }, top);
    const shine2 = el("path", { class: "shine-2" }, top);
    const rim = el("circle", { class: "rim", r: R }, top);
    this.p = { clipC, shadow, pads, legs, ring: [rimLo, bg, glass, rim], mag, shine, shine2 };
    this.lx = this.ly = NaN;
    const [rx, ry] = this.restAt();
    this.setLens(rx, ry);
  }

  private setLens(x: number, y: number): void {
    if (x === this.lx && y === this.ly) return;
    this.lx = x;
    this.ly = y;
    const p = this.p;
    p.clipC.setAttribute("cx", `${x}`);
    p.clipC.setAttribute("cy", `${y}`);
    p.shadow.setAttribute("cx", `${x + 12}`);
    p.shadow.setAttribute("cy", `${y + 20}`);
    for (const c of p.ring) {
      c.setAttribute("cx", `${x}`);
      c.setAttribute("cy", `${y}`);
    }
    p.mag.setAttribute("transform", `translate(${x} ${y}) scale(${MAG}) translate(${-x} ${-y})`);
    p.shine.setAttribute("d", arc(x, y, GLASS * 0.8, 200, 248));
    p.shine2.setAttribute("d", arc(x, y, GLASS * 0.86, 30, 62));
    let d = "";
    LEGS.forEach((a, i) => {
      const fx = x + Math.cos(a) * FOOT;
      const fy = y + Math.sin(a) * FOOT;
      p.pads[i].setAttribute("cx", `${fx}`);
      p.pads[i].setAttribute("cy", `${fy}`);
      const f = P(fx, fy, 0);
      const t = P(x + Math.cos(a) * (R - 3), y + Math.sin(a) * (R - 3), LZ - 6);
      d += `M${f[0].toFixed(2)} ${f[1].toFixed(2)}L${t[0].toFixed(2)} ${t[1].toFixed(2)}`;
    });
    p.legs.setAttribute("d", d);
  }

  /** Slides the loupe to (x, y) on the sheet; `onStep` sees where it is on every frame. */
  move(x: number, y: number, ms: number, curve: (t: number) => number = ease.softInOut, onStep?: (x: number, y: number) => void): Promise<void> {
    const x0 = this.lx;
    const y0 = this.ly;
    return tween(0, 1, ms, (t) => {
      this.setLens(x0 + (x - x0) * t, y0 + (y - y0) * t);
      onStep?.(this.lx, this.ly);
    }, curve);
  }

  /** The sheet lands on the counter. */
  land(): Promise<void> {
    const { W, H } = this.L;
    return tween(0, 1, dur.enter, (t) => this.drop.setAttribute("transform", `translate(0 ${(-26 * (1 - t)).toFixed(2)}) rotate(${(-2.4 * (1 - t)).toFixed(3)} ${W / 2} ${H / 2})`), ease.softLand);
  }

  /** Presses line i's mark: a stamp lands (snapSettle, from 1.9x and −10°), or a dot appears. */
  mark(i: number): void {
    const m = this.rows[i]?.querySelector<SVGGElement>(".vf-mark");
    if (!m || m.dataset.on) return;
    m.dataset.on = "1";
    const dot = !!m.dataset.dot;
    if (still()) {
      m.setAttribute("opacity", "1");
      m.setAttribute("transform", dot ? "" : "rotate(-4)");
      return;
    }
    void tween(0, 1, dot ? dur.fade : dur.seal, (t) => {
      m.setAttribute("opacity", Math.min(1, t * 2.8).toFixed(3));
      m.setAttribute("transform", dot ? `scale(${(0.4 + 0.6 * t).toFixed(3)})` : `rotate(${(-10 + 6 * t).toFixed(2)}) scale(${(1.9 - 0.9 * t).toFixed(3)})`);
    }, dot ? ease.softLand : ease.snapSettle);
  }

  /** Lines not read (a refused sheet) fade back. */
  dim(i: number): void {
    const row = this.rows[i];
    if (row) void tween(1, 0.32, dur.enter, (v) => row.setAttribute("opacity", v.toFixed(3)), ease.softLand);
  }

  /** The end state at once: every mark pressed, unread lines dimmed, the loupe parked on `park`. */
  settle(park: number): void {
    this.L.rows.forEach((r, i) => {
      if (r.unread) this.rows[i]?.setAttribute("opacity", "0.32");
      else {
        const m = this.rows[i]?.querySelector<SVGGElement>(".vf-mark");
        if (m) {
          m.dataset.on = "1";
          m.setAttribute("opacity", "1");
          m.setAttribute("transform", m.dataset.dot ? "" : "rotate(-4)");
        }
      }
    });
    const r = this.L.rows[park];
    if (r) this.setLens(this.L.mx - 6, r.cy);
  }

  /* idle: the loupe follows the pointer over the blank sheet, as hairline's does */
  private onMove = (ev: PointerEvent) => {
    if (!this.idle || still()) return;
    const m = this.svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    const [ux, uy] = unproject(pt.x, pt.y);
    this.target = [Math.max(60, Math.min(this.L.W - 60, ux)), Math.max(40, Math.min(this.L.H - 30, uy))];
    if (!this.follow) this.follow = requestAnimationFrame(this.step);
  };
  private onLeave = () => {
    if (this.idle) this.target = this.restAt();
  };
  private step = () => {
    const t = this.target;
    if (!t || !this.idle) {
      this.follow = 0;
      return;
    }
    const nx = this.lx + (t[0] - this.lx) * 0.16;
    const ny = this.ly + (t[1] - this.ly) * 0.16;
    this.setLens(nx, ny);
    this.follow = Math.hypot(t[0] - nx, t[1] - ny) > 0.3 ? requestAnimationFrame(this.step) : 0;
  };
}
