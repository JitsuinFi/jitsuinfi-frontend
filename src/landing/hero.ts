// Chapter 1, the hero: a test invoice floats on cool document paper at the tear where the shielded
// pool shows through. The buyer's jitsuin presses on it, its fingerprint N resolves digit by
// digit on the sheet, and sixteen of those digits lift off and sink into the pool.
import { animate, createTimeline } from "animejs";
import { hover, press, animate as motionAnimate } from "motion";
import { createField, type Field } from "./field";
import { dur, ease, sibling, wordDelays } from "./motion";

/// Real values: `node scripts/hero-n.mjs src/wasm` (jitsuin-wasm, test keys derived from TES- labels).
export const HERO_INVOICE = {
  id: "TES-INV-0007",
  supplier: "ed7ed2ff196e991257fa507e384dfea6fac4c66725e4b2dfc35861291421af8b",
  buyer: "fd647194d340b147764394b7dabee0c60df9fbad2a14ec8e4ba141f54219560a",
  amount: "0.0004 ZEC",
  issued: "19 Oct 2026",
  due: "18 Dec 2026",
  terms: "4b5958693a4f019b7de30dda6ee98ffc9d8412dfa2a7648d4095aba299950b77",
  n: "8ee58d12d3b4170056ae09509f2339a742fcee9073af1f8cfe01b068ebdc8354",
};

export const SPEC_URL = "https://github.com/JitsuinFi/jitsuinfi-zcash/blob/main/docs/zip-shielded-receivable-registry.md";

const HEADLINE = ["Zcash stops double-spending.", "JitsuinFi stops double-financing."];
const LEDE =
  "Private invoice financing on Zcash. Every invoice gets one fingerprint on a public board, so it can be financed once, while amounts, parties and documents stay shielded.";

const SVG = "http://www.w3.org/2000/svg";
const short = (hex: string) => `${hex.slice(0, 4)}…${hex.slice(-4)}`;
/// anime.js reads a bare function as a per-target value; wrapping hands it the ease itself.
const fn = (f: (t: number) => number) => () => f;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/// The round seal: a heavy outer ring, a fine inner ring, 実印 set vertically.
function sealMark(): SVGGElement {
  const g = svg("g", { class: "seal-mark" }) as SVGGElement;
  g.append(
    svg("circle", { cx: 50, cy: 50, r: 45, class: "seal-ring" }),
    svg("circle", { cx: 50, cy: 50, r: 37.5, class: "seal-ring-fine" }),
  );
  const a = svg("text", { x: 50, y: 47, class: "seal-kanji", "text-anchor": "middle" });
  a.textContent = "実";
  const b = svg("text", { x: 50, y: 76, class: "seal-kanji", "text-anchor": "middle" });
  b.textContent = "印";
  g.append(a, b);
  return g;
}

/// Deterministic noise for the torn edge.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/// A straight sheet torn along one side: `right` on desktop (toward the pool), `bottom` on phones.
function tearPath(w: number, h: number, side: "right" | "bottom", seed = 11): string {
  const r = rng(seed);
  const pts: string[] = [];
  const depth = 7;
  if (side === "right") {
    pts.push("0px 0px");
    for (let y = 0; y <= h; y += 5) {
      const j = depth * (0.5 + 0.5 * Math.sin(y / 37)) * 0.6 + r() * depth * 0.6;
      pts.push(`${(w - j).toFixed(1)}px ${y}px`);
    }
    pts.push(`0px ${h}px`);
  } else {
    pts.push("0px 0px", `${w}px 0px`);
    for (let x = w; x >= 0; x -= 5) {
      const j = depth * (0.5 + 0.5 * Math.sin(x / 41)) * 0.6 + r() * depth * 0.6;
      pts.push(`${x}px ${(h - j).toFixed(1)}px`);
    }
  }
  return `polygon(${pts.join(",")})`;
}

function rgbOf(token: string): [number, number, number] {
  const h = getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function mountHero(root: HTMLElement, reduced: boolean): { field: Field | null; el: HTMLElement } {
  const hero = el("section", "hero");
  hero.id = "top";
  hero.setAttribute("aria-labelledby", "hero-title");

  const canvas = el("canvas", "hero-field");
  canvas.setAttribute("aria-hidden", "true");

  // nav
  const nav = el("nav", "nav");
  nav.setAttribute("aria-label", "Main");
  const brand = el("a", "brand");
  brand.href = "#top";
  const brandSvg = svg("svg", { viewBox: "0 0 100 100", class: "brand-seal", "aria-hidden": "true" });
  brandSvg.append(sealMark());
  brand.append(brandSvg, el("span", "brand-name", "JitsuinFi"));
  const links = el("div", "nav-links");
  const how = el("a", "nav-link", "How it works");
  how.href = "#story";
  const spec = el("a", "nav-link nav-spec", "Read the spec");
  spec.href = SPEC_URL;
  spec.rel = "noreferrer";
  const demoNav = el("a", "nav-link nav-demo", "Open the demo");
  demoNav.href = "/app.html";
  links.append(how, spec, demoNav);
  nav.append(brand, links);

  // headline, split by word; each line keeps its words together
  const title = el("h1", "hero-title");
  title.id = "hero-title";
  const words: HTMLElement[] = [];
  HEADLINE.forEach((line) => {
    const l = el("span", "hero-line");
    line.split(" ").forEach((w, i, all) => {
      const s = el("span", "word", w);
      words.push(s);
      l.append(s);
      if (i < all.length - 1) l.append(document.createTextNode(" "));
    });
    title.append(l);
  });

  const copy = el("div", "hero-copy");
  copy.append(title);

  const lede = el("p", "hero-lede", LEDE);
  const calls = el("div", "hero-calls");
  const demo = el("a", "seal-btn");
  demo.href = "/app.html";
  demo.append(el("span", "seal-btn-label", "Open the demo"));
  const read = el("a", "ink-link", "Read the spec");
  read.href = SPEC_URL;
  read.rel = "noreferrer";
  calls.append(demo, read);
  const foot = el("div", "hero-foot");
  foot.append(lede, calls);

  // the invoice sheet: document content only
  const inv = HERO_INVOICE;
  const sheetWrap = el("figure", "sheet-wrap");
  sheetWrap.setAttribute("aria-label", `Test invoice ${inv.id}, sealed by the buyer. Its fingerprint N is ${inv.n}.`);
  const sheet = el("div", "sheet");
  const head = el("div", "sheet-head");
  head.append(el("span", "sheet-title", "Invoice"), el("span", "sheet-no data", inv.id));
  const rows = el("dl", "sheet-rows");
  const row = (k: string, v: string, data = false) => {
    rows.append(el("dt", "", k), el("dd", data ? "data" : "", v));
  };
  row("Supplier", short(inv.supplier), true);
  row("Buyer", short(inv.buyer), true);
  row("Amount", inv.amount);
  row("Issued", inv.issued);
  row("Due", inv.due);
  row("Terms", short(inv.terms), true);

  const fp = el("div", "sheet-fp");
  const fpLabel = el("span", "sheet-fp-label", "Fingerprint N");
  const fpGrid = el("span", "sheet-fp-grid data");
  fpGrid.setAttribute("aria-hidden", "true");
  const digits: HTMLElement[] = [];
  for (let r = 0; r < 4; r++) {
    const line = el("span", "fp-line");
    for (let c = 0; c < 16; c++) {
      const d = el("span", "fp-digit", inv.n[r * 16 + c]);
      digits.push(d);
      line.append(d);
    }
    fpGrid.append(line);
  }
  fp.append(fpLabel, fpGrid);

  const signLine = el("div", "sheet-sign");
  signLine.append(el("span", "sheet-sign-label", "Buyer's seal"));

  // the impression (stays) and the stamp (comes down, lifts away)
  const impression = svg("svg", { viewBox: "0 0 100 100", class: "impression", "aria-hidden": "true" });
  const defs = svg("defs");
  const filter = svg("filter", { id: "bleed", x: "-25%", y: "-25%", width: "150%", height: "150%" });
  const turb = svg("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2, seed: 7, result: "noise" });
  const disp = svg("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: 0, xChannelSelector: "R", yChannelSelector: "G", result: "ink" });
  const blur = svg("feGaussianBlur", { in: "ink", stdDeviation: 0, result: "soft" });
  const flood = svg("feFlood", { "flood-opacity": 0.4, result: "tint" });
  const fringe = svg("feComposite", { in: "tint", in2: "soft", operator: "in", result: "fringe" });
  const merge = svg("feMerge");
  merge.append(svg("feMergeNode", { in: "fringe" }), svg("feMergeNode", { in: "ink" }));
  filter.append(turb, disp, blur, flood, fringe, merge);
  defs.append(filter);
  const impressionMark = sealMark();
  impressionMark.setAttribute("filter", "url(#bleed)");
  impression.append(defs, impressionMark);
  flood.setAttribute("flood-color", `rgb(${rgbOf("--fold").join(",")})`);

  const stamp = svg("svg", { viewBox: "0 0 100 100", class: "stamp", "aria-hidden": "true" });
  stamp.append(sealMark());
  signLine.append(impression, stamp);

  sheet.append(head, rows, fp, signLine);
  sheetWrap.append(sheet);

  const note = el("p", "pool-note");
  note.append(
    el("span", "pool-note-text", "On the board, an invoice is one fingerprint. Amount, parties and documents stay in the shielded pool."),
    el("span", "pool-note-n data", `N ${inv.n.slice(0, 8)}…${inv.n.slice(-6)}`),
  );

  const glyphLayer = el("div", "glyphs");
  glyphLayer.setAttribute("aria-hidden", "true");

  hero.append(canvas, nav, copy, foot, sheetWrap, note, glyphLayer);
  root.append(hero);

  const field = createField(canvas, { reduced });
  if (!field) hero.classList.add("no-gl");

  // layout: the tear runs through the sheet; the sheet's torn side faces the pool
  const place = () => {
    const hr = hero.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const phone = hr.width < 760;
    sheet.style.clipPath = tearPath(sheet.offsetWidth, sheet.offsetHeight, phone ? "bottom" : "right");
    if (!field) return;
    if (phone) field.setEdge((sr.top - hr.top + sr.height * 0.62) / hr.height);
    else field.setEdge((sr.left - hr.left + sr.width * 0.3) / hr.width);
  };
  new ResizeObserver(place).observe(hero);
  document.fonts?.ready.then(place);

  // buttons (Motion gestures): seal button press .97 in 67ms, label nudges 2px on glide
  hover(demo, (t) => {
    motionAnimate(t.querySelector(".seal-btn-label")!, { x: 2 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
    return () => motionAnimate(t.querySelector(".seal-btn-label")!, { x: 0 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
  });
  press(demo, (t) => {
    motionAnimate(t, { scale: 0.97 }, { duration: dur.press / 1000 });
    return () => motionAnimate(t, { scale: 1 }, { duration: dur.press / 1000 });
  });

  if (reduced) {
    hero.classList.add("is-rested");
    disp.setAttribute("scale", "3.5");
    blur.setAttribute("stdDeviation", "0.8");
    requestAnimationFrame(place);
    return { field, el: hero };
  }

  hero.classList.add("is-entering");
  const tl = createTimeline({ autoplay: false });

  // headline: words rise 0.05 of the line, each with its own small delay
  wordDelays(words.length).forEach((d, i) => {
    tl.add(words[i], { y: { from: "0.05em", to: 0 }, duration: dur.enter, ease: fn(ease.softLand) }, d);
    tl.add(words[i], { opacity: { from: 0, to: 1 }, duration: dur.micro, ease: "linear" }, d);
  });

  // lede and calls, uneven siblings
  [lede, demo, read].forEach((t, i) => {
    tl.add(t, { y: { from: 10, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) }, 520 + sibling(i));
  });

  // the sheet lands, from −2° to its rest angle
  tl.add(sheetWrap, { y: { from: 24, to: 0 }, rotate: { from: -3.2, to: 0 }, duration: dur.enter + 200, ease: fn(ease.softLand) }, 260);
  tl.add(sheetWrap, { opacity: { from: 0, to: 1 }, duration: dur.micro, ease: "linear" }, 260);

  // the seal: down on snapSettle, a 67ms squash, lifts away on accelExit; the ink bleeds linearly
  const press0 = 1000;
  tl.add(stamp, { scale: { from: 1.55, to: 1 }, y: { from: -26, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.seal, ease: fn(ease.snapSettle) }, press0);
  tl.add(stamp, { scaleX: [1, 1.03], scaleY: [1, 0.94], duration: dur.press, ease: "linear" }, press0 + dur.seal);
  tl.call(() => {
    impression.classList.add("is-inked");
    const bleed = { s: 0 };
    animate(bleed, {
      s: 1,
      duration: dur.bleed,
      ease: "linear",
      onUpdate: () => {
        disp.setAttribute("scale", (bleed.s * 3.5).toFixed(2));
        blur.setAttribute("stdDeviation", (bleed.s * 0.8).toFixed(2));
      },
    });
  }, press0 + dur.seal);
  tl.add(
    stamp,
    { scale: { from: 1, to: 1.22 }, scaleX: 1, scaleY: 1, y: -18, opacity: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) },
    press0 + dur.seal + dur.press,
  );

  // N resolves: each digit cycles 3–6 random glyphs over 400ms, left to right, 20ms apart
  const resolveAt = press0 + dur.seal + dur.press + 120;
  tl.call(() => resolve(digits), resolveAt);
  const sinkAt = resolveAt + dur.enter + digits.length * 20 + 300;
  tl.call(() => sink(digits, hero, sheet, note, glyphLayer, field), sinkAt);
  tl.add(note, { y: { from: 12, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) }, sinkAt + 1200);
  tl.call(() => hero.classList.replace("is-entering", "is-rested"), sinkAt + 1700);

  // start once the fonts have settled the layout
  const go = () => {
    place();
    tl.play();
  };
  (document.fonts?.ready ?? Promise.resolve()).then(go);

  return { field, el: hero };
}

const HEX = "0123456789abcdef";

function resolve(digits: HTMLElement[]) {
  const finals = digits.map((d) => d.textContent ?? "");
  const r = rng(29);
  const cycles = digits.map(() => 3 + Math.floor(r() * 4));
  const clock = { t: 0 };
  const total = dur.enter + digits.length * 20;
  digits.forEach((d) => d.classList.add("is-cycling"));
  animate(clock, {
    t: total,
    duration: total,
    ease: "linear",
    onUpdate: () => {
      digits.forEach((d, i) => {
        const local = (clock.t - i * 20) / dur.enter;
        if (local <= 0) return;
        if (local >= 1) {
          if (d.textContent !== finals[i]) d.textContent = finals[i];
          d.classList.remove("is-cycling");
          return;
        }
        const k = Math.floor(local * cycles[i]);
        d.textContent = HEX[(i * 7 + k * 5) % 16];
      });
    },
    onComplete: () => digits.forEach((d, i) => ((d.textContent = finals[i]), d.classList.remove("is-cycling"))),
  });
}

/// Sixteen digits (one from each column) lift off the sheet and sink into the pool on an arc.
function sink(digits: HTMLElement[], hero: HTMLElement, sheet: HTMLElement, note: HTMLElement, layer: HTMLElement, field: Field | null) {
  const hr = hero.getBoundingClientRect();
  const shr = sheet.getBoundingClientRect();
  const nr = note.getBoundingClientRect();
  const phone = hr.width < 760;
  const seal = rgbOf("--seal");
  const glint = rgbOf("--glint");
  const r = rng(53);
  const picks = Array.from({ length: 16 }, (_, c) => digits[((c * 3) % 4) * 16 + c]);
  picks.forEach((src, i) => {
    const sr = src.getBoundingClientRect();
    const g = el("span", "glyph data", src.textContent ?? "");
    const x0 = sr.left - hr.left;
    const y0 = sr.top - hr.top;
    // landing points spread through the pool, clear of the sheet
    let x1: number, y1: number;
    let tries = 0;
    do {
      x1 = phone ? hr.width * (0.08 + r() * 0.84) : hr.width * (0.7 + r() * 0.26);
      // phone: between the sheet's torn foot and the pool note
      const top = shr.bottom - hr.top + 24;
      const bottom = Math.max(top + 40, nr.top - hr.top - 16);
      y1 = phone ? top + r() * (bottom - top) : hr.height * (0.18 + r() * 0.7);
      tries++;
    } while (field && !field.inPool(x1, y1) && tries < 8);
    const cx = (x0 + x1) / 2 + (phone ? 0 : 40);
    const cy = Math.min(y0, y1) - (phone ? 60 : 120) - r() * 60;
    g.style.transform = `translate(${x0}px, ${y0}px)`;
    layer.append(g);
    const p = { t: 0 };
    animate(p, {
      t: 1,
      duration: dur.sink,
      delay: sibling(i),
      ease: fn(ease.softLand),
      onUpdate: () => {
        const t = p.t;
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
        const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        const c = seal.map((v, k) => Math.round(v + (glint[k] - v) * t));
        g.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + 0.6 * Math.sin(Math.PI * t)).toFixed(3)})`;
        g.style.color = `rgb(${c.join(",")})`;
        field?.wake(300);
      },
      onComplete: () => {
        field?.drop(x1, y1, 0.05, 0.03);
        // it sinks: shrinks and goes under on accelExit
        const q = { t: 0 };
        animate(q, {
          t: 1,
          duration: dur.exit,
          ease: fn(ease.accelExit),
          onUpdate: () => {
            g.style.transform = `translate(${x1.toFixed(1)}px, ${y1.toFixed(1)}px) scale(${(1 - 0.5 * q.t).toFixed(3)})`;
            g.style.opacity = (1 - q.t).toFixed(3);
          },
          onComplete: () => g.remove(),
        });
      },
    });
  });
}
