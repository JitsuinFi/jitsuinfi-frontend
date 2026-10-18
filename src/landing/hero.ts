// Chapter 1, the hero (MASTER Amendment 2): the shielded pool seen from above, full-bleed, and a
// story that never stops. An invoice floats in and the buyer's jitsuin slams down; its
// fingerprint N resolves; the invoice sinks and only N stays on the surface as light. Then a copy
// of the same invoice drifts into that ring, the seal is pressed twice, the impression cracks, the
// ring runs seal red and the copy is pushed away. Then it begins again.
import { animate, createTimeline, svg as animeSvg, type JSAnimation } from "animejs";
import { animate as motionAnimate, hover, press } from "motion";
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

/// A real register entry on testnet (TEST-HNK-19, cycle-it, 2026-10-17).
const TESTNET_ENTRY = { txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", height: 4509299 };

export const SPEC_URL = "https://github.com/JitsuinFi/jitsuinfi-zcash/blob/main/docs/zip-shielded-receivable-registry.md";

const LEDE =
  "Private invoice financing on Zcash. Every invoice leaves one fingerprint on a public board, so it can be financed once. Amounts, parties and documents stay shielded.";

const BEATS = [
  { at: 0, label: "Seal", cap: "The buyer seals the invoice." },
  { at: 3400, label: "Register", cap: "Only its fingerprint N reaches the board. The invoice stays shielded." },
  { at: 5800, label: "Press twice", cap: "The same invoice comes back for a second financing." },
  { at: 8400, label: "Refuse", cap: "Same N already on the board. Financing refused." },
];
const LOOP_MS = 10600;

const SVG_NS = "http://www.w3.org/2000/svg";
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
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/// The round seal: a heavy outer ring, a fine inner ring, 実印 set vertically.
function sealMark(): SVGGElement {
  const g = svg("g", { class: "seal-mark" }) as SVGGElement;
  g.append(svg("circle", { cx: 50, cy: 50, r: 45, class: "seal-ring" }), svg("circle", { cx: 50, cy: 50, r: 37.5, class: "seal-ring-fine" }));
  const a = svg("text", { x: 50, y: 47, class: "seal-kanji", "text-anchor": "middle" });
  a.textContent = "実";
  const b = svg("text", { x: 50, y: 76, class: "seal-kanji", "text-anchor": "middle" });
  b.textContent = "印";
  g.append(a, b);
  return g;
}

function sealIcon(cls: string): SVGElement {
  const s = svg("svg", { viewBox: "0 0 100 100", class: cls, "aria-hidden": "true" });
  s.append(sealMark());
  return s;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/// A straight sheet with one torn side (the right).
function tearPath(w: number, h: number, seed: number): string {
  const r = rng(seed);
  const pts: string[] = ["0px 0px"];
  for (let y = 0; y <= h; y += 5) {
    const j = 7 * (0.5 + 0.5 * Math.sin(y / 37 + seed)) * 0.6 + r() * 4.2;
    pts.push(`${(w - j).toFixed(1)}px ${y}px`);
  }
  pts.push(`0px ${h}px`);
  return `polygon(${pts.join(",")})`;
}

function rgbOf(token: string): [number, number, number] {
  const h = getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

interface Sheet {
  wrap: HTMLElement;
  sheet: HTMLElement;
  tint: HTMLElement;
  impression: SVGElement;
  disp: SVGElement;
  blur: SVGElement;
  stamp: SVGElement;
  crack: SVGElement[];
  digits: HTMLElement[];
}

/// The test invoice as a document sheet; `copy` builds the second, identical one.
function makeSheet(key: string, copy: boolean): Sheet {
  const inv = HERO_INVOICE;
  const wrap = el("figure", `sheet-wrap sheet-${key}`);
  wrap.setAttribute("aria-hidden", "true");
  const sheet = el("div", "sheet");
  const head = el("div", "sheet-head");
  head.append(el("span", "sheet-title", "Invoice"), el("span", "sheet-no data", inv.id));
  const rows = el("dl", "sheet-rows");
  const row = (k: string, v: string, data = false) => rows.append(el("dt", "", k), el("dd", data ? "data" : "", v));
  row("Supplier", short(inv.supplier), true);
  row("Buyer", short(inv.buyer), true);
  row("Amount", inv.amount);
  row("Due", inv.due);
  row("Terms", short(inv.terms), true);

  const fp = el("div", "sheet-fp");
  fp.append(el("span", "sheet-fp-label", "Fingerprint N"));
  const grid = el("span", "sheet-fp-grid data");
  const digits: HTMLElement[] = [];
  for (let r = 0; r < 4; r++) {
    const line = el("span", "fp-line");
    for (let c = 0; c < 16; c++) {
      const d = el("span", "fp-digit", "·");
      d.dataset.n = inv.n[r * 16 + c];
      digits.push(d);
      line.append(d);
    }
    grid.append(line);
  }
  fp.append(grid);

  const sign = el("div", "sheet-sign");
  sign.append(el("span", "sheet-sign-label", "Buyer's seal"));
  const impression = svg("svg", { viewBox: "0 0 100 100", class: "impression" });
  const defs = svg("defs");
  const filter = svg("filter", { id: `bleed-${key}`, x: "-25%", y: "-25%", width: "150%", height: "150%" });
  const disp = svg("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: 0, xChannelSelector: "R", yChannelSelector: "G", result: "ink" });
  const blur = svg("feGaussianBlur", { in: "ink", stdDeviation: 0, result: "soft" });
  const merge = svg("feMerge");
  merge.append(svg("feMergeNode", { in: "fringe" }), svg("feMergeNode", { in: "ink" }));
  filter.append(
    svg("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2, seed: copy ? 3 : 7, result: "noise" }),
    disp,
    blur,
    svg("feFlood", { "flood-color": `rgb(${rgbOf("--fold").join(",")})`, "flood-opacity": 0.4, result: "tint" }),
    svg("feComposite", { in: "tint", in2: "soft", operator: "in", result: "fringe" }),
    merge,
  );
  defs.append(filter);
  const mark = sealMark();
  mark.setAttribute("filter", `url(#bleed-${key})`);
  impression.append(defs, mark);
  const crack: SVGElement[] = [];
  if (copy) {
    for (const d of ["M50 3 L46 21 L55 33 L44 50 L53 63 L47 80 L51 97", "M44 50 L29 57 L11 53", "M55 33 L71 29 L88 21", "M53 63 L69 70 L84 82"]) {
      const p = svg("path", { d, class: "crack" });
      crack.push(p);
      impression.append(p);
    }
  }
  const stamp = sealIcon("stamp");
  sign.append(impression, stamp);

  const tint = el("div", "sheet-tint");
  sheet.append(head, rows, fp, sign, tint);
  wrap.append(sheet);
  return { wrap, sheet, tint, impression, disp, blur, stamp, crack, digits };
}

export function mountHero(root: HTMLElement, reduced: boolean): { field: Field | null; el: HTMLElement } {
  const hero = el("section", "hero");
  hero.id = "top";
  hero.setAttribute("aria-labelledby", "hero-title");

  const canvas = el("canvas", "hero-field");
  canvas.setAttribute("aria-hidden", "true");
  const veil = el("div", "hero-veil");
  veil.setAttribute("aria-hidden", "true");

  // nav: a glass seal, a glass pill of links with the demo call inside
  const nav = el("nav", "nav");
  nav.setAttribute("aria-label", "Main");
  const brand = el("a", "brand");
  brand.href = "#top";
  brand.setAttribute("aria-label", "JitsuinFi, top of page");
  const brandSeal = el("span", "brand-seal glass");
  brandSeal.append(sealIcon("brand-mark"));
  brand.append(brandSeal, el("span", "brand-name", "JitsuinFi"));
  const pill = el("div", "nav-pill glass");
  const link = (text: string, href: string, cls = "nav-link") => {
    const a = el("a", cls, text);
    a.href = href;
    if (href.startsWith("http")) a.rel = "noreferrer";
    return a;
  };
  pill.append(link("How it works", "#story"), link("Read the spec", SPEC_URL, "nav-link nav-spec"), link("Open the demo", "/app.html", "nav-cta"));
  nav.append(brand, pill);

  // the stage, where the story plays
  const stage = el("div", "stage");
  stage.setAttribute("role", "img");
  stage.setAttribute(
    "aria-label",
    `A test invoice, ${HERO_INVOICE.id}, is sealed by its buyer and sinks into the shielded pool, leaving only its fingerprint N on the surface. A copy of the same invoice is sealed again; the seal cracks and financing is refused.`,
  );
  const shake = el("div", "stage-shake");
  const A = makeSheet("a", false);
  const B = makeSheet("b", true);
  const ring = el("div", "ring");
  const ringSvg = svg("svg", { class: "ring-line", "aria-hidden": "true" });
  const ringPath = svg("ellipse", { cx: 0, cy: 0, rx: 10, ry: 10 });
  ringSvg.append(ringPath);
  ring.append(ringSvg);
  const glyphs = Array.from({ length: 16 }, (_, i) => {
    const g = el("span", "ring-glyph data", HERO_INVOICE.n[i * 4]);
    ring.append(g);
    return g;
  });
  shake.append(ring, A.wrap, B.wrap);
  const cap = el("p", "stage-cap", BEATS[0].cap);
  cap.setAttribute("aria-hidden", "true");
  stage.append(shake, cap);

  // copy, over the veil
  const copy = el("div", "hero-copy");
  const badge = el("p", "badge glass");
  badge.append(el("span", "badge-chip", "Testnet"), el("span", "badge-text", "Live on Zcash testnet, NU7"));
  const title = el("h1", "hero-title");
  title.id = "hero-title";
  const words: HTMLElement[] = [];
  const line = (text: string, cls: string, inlineSealAfter?: string) => {
    const l = el("span", `hero-line ${cls}`);
    text.split(" ").forEach((w, i, all) => {
      const s = el("span", "word", w);
      words.push(s);
      l.append(s);
      if (w === inlineSealAfter) {
        l.append(document.createTextNode(" "));
        const icon = el("span", "word word-seal");
        icon.append(sealIcon("inline-seal"));
        words.push(icon);
        l.append(icon);
      }
      if (i < all.length - 1) l.append(document.createTextNode(" "));
    });
    title.append(l);
  };
  line("Zcash stops double-spending.", "hero-line-1");
  line("JitsuinFi stops double-financing.", "hero-line-2", "JitsuinFi");

  const lede = el("p", "hero-lede", LEDE);
  const calls = el("div", "hero-calls");
  const demo = el("a", "seal-btn");
  demo.href = "/app.html";
  demo.append(el("span", "seal-btn-label", "Open the demo"));
  const watch = el("button", "watch glass");
  watch.type = "button";
  const play = svg("svg", { viewBox: "0 0 24 24", class: "watch-icon", "aria-hidden": "true" });
  play.append(svg("polygon", { points: "7 4 20 12 7 20 7 4" }));
  watch.append(play, el("span", "", "Watch it catch a double"));
  calls.append(demo, watch);
  const proof = el("p", "hero-proof");
  proof.append(el("span", "", "Registered on testnet"), el("span", "data", `${short(TESTNET_ENTRY.txid)} · block ${TESTNET_ENTRY.height}`));
  copy.append(badge, title, lede, calls, proof);

  // the beat rail, with a pause control
  const rail = el("div", "rail glass");
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "Story");
  const pause = el("button", "rail-pause");
  pause.type = "button";
  pause.setAttribute("aria-label", "Pause the story");
  const pauseIcon = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "icon-pause" });
  pauseIcon.append(svg("rect", { x: 6, y: 5, width: 4, height: 14 }), svg("rect", { x: 14, y: 5, width: 4, height: 14 }));
  const playIcon = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "icon-play" });
  playIcon.append(svg("polygon", { points: "7 4 20 12 7 20 7 4" }));
  pause.append(pauseIcon, playIcon);
  rail.append(pause);
  const tracks: HTMLElement[] = [];
  const beatBtns = BEATS.map((b, i) => {
    const btn = el("button", "rail-beat");
    btn.type = "button";
    btn.setAttribute("aria-label", `Play from step ${i + 1}: ${b.label}`);
    const fill = el("span", "rail-fill");
    const track = el("span", "rail-track");
    track.append(fill);
    tracks.push(fill);
    btn.append(el("span", "rail-label", b.label), track);
    rail.append(btn);
    return btn;
  });

  hero.append(canvas, veil, stage, nav, copy, rail);
  root.append(hero);

  const field = createField(canvas, { reduced });
  if (!field) hero.classList.add("no-gl");

  // ring homes: an ellipse around the stage centre (the water is seen at a slant)
  const homes: { x: number; y: number }[] = [];
  const placeRing = () => {
    const w = A.wrap.offsetWidth || 300;
    const k = hero.clientWidth < 560 ? 0.8 : 1; // phones: the whole stage at 80% so the headline stays near the fold
    const rx = Math.min(w * 0.86, (hero.clientWidth / 2 - 24) / k); // the ring stays on screen
    const ry = Math.max(w * 0.66, A.wrap.offsetHeight / 2 + 34); // clear of the sheet's head and foot
    const pad = 4;
    ringSvg.setAttribute("viewBox", `${-rx - pad} ${-ry - pad} ${2 * (rx + pad)} ${2 * (ry + pad)}`);
    ringSvg.style.left = `${-rx - pad}px`;
    ringSvg.style.top = `${-ry - pad}px`;
    ringSvg.style.width = `${2 * (rx + pad)}px`;
    ringSvg.style.height = `${2 * (ry + pad)}px`;
    ringPath.setAttribute("rx", rx.toFixed(1));
    ringPath.setAttribute("ry", ry.toFixed(1));
    // narrow screens: the stage is a block in the flow, tall enough for the ring and its caption
    if (hero.clientWidth < 1024) {
      shake.style.scale = String(k);
      stage.style.height = `${Math.round((2 * ry + 40) * k + 56)}px`;
      shake.style.top = `${Math.round((ry + 12) * k)}px`;
      cap.style.top = `${Math.round((2 * ry + 28) * k)}px`;
    } else {
      shake.style.scale = "";
      stage.style.height = "";
      shake.style.top = "";
      cap.style.top = `${Math.round(ry + 44)}px`;
    }
    homes.length = 0;
    glyphs.forEach((g, i) => {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const p = { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
      homes.push(p);
      g.style.left = `${p.x.toFixed(1)}px`;
      g.style.top = `${p.y.toFixed(1)}px`;
    });
  };
  // tear each sheet once it has a size
  const tear = () => {
    A.sheet.style.clipPath = tearPath(A.sheet.offsetWidth, A.sheet.offsetHeight, 11);
    B.sheet.style.clipPath = tearPath(B.sheet.offsetWidth, B.sheet.offsetHeight, 23);
    placeRing();
  };
  new ResizeObserver(tear).observe(stage);

  // pool coordinates of an element's centre
  const poolPoint = (e: Element) => {
    const hr = hero.getBoundingClientRect();
    const r = e.getBoundingClientRect();
    return { x: r.left - hr.left + r.width / 2, y: r.top - hr.top + r.height / 2 };
  };

  // primary call: Motion press and hover, plus a magnet (as in Reeve) on a spring
  const label = demo.querySelector(".seal-btn-label")!;
  hover(demo, () => {
    motionAnimate(label, { x: 2 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
    return () => motionAnimate(label, { x: 0 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
  });
  press(demo, (t) => {
    motionAnimate(t, { scale: 0.97 }, { duration: dur.press / 1000 });
    return () => motionAnimate(t, { scale: 1 }, { duration: dur.press / 1000 });
  });
  if (!reduced) {
    let pulled = false;
    const springy = { type: "spring" as const, stiffness: 170, damping: 22, mass: 1 };
    window.addEventListener(
      "pointermove",
      (e) => {
        const r = demo.getBoundingClientRect();
        const pad = 60;
        const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
        if (inside) {
          pulled = true;
          const clamp = (n: number) => Math.max(-8, Math.min(8, n));
          motionAnimate(demo, { x: clamp((e.clientX - (r.left + r.width / 2)) / 3), y: clamp((e.clientY - (r.top + r.height / 2)) / 3) }, springy);
        } else if (pulled) {
          pulled = false;
          motionAnimate(demo, { x: 0, y: 0 }, springy);
        }
      },
      { passive: true },
    );
  }

  // ---------- the story ----------

  const seal = rgbOf("--seal");
  const glint = rgbOf("--glint");
  const side = new Set<JSAnimation>();
  const run = (a: JSAnimation) => {
    side.add(a);
    a.then(() => side.delete(a));
    return a;
  };

  const [ringDraw] = animeSvg.createDrawable(ringPath);
  const setRingLine = (k: number) => ringDraw.setAttribute("draw", `0 ${k.toFixed(3)}`);
  const ink = (s: Sheet, k: number) => {
    s.disp.setAttribute("scale", (k * 3.5).toFixed(2));
    s.blur.setAttribute("stdDeviation", (k * 0.8).toFixed(2));
    s.impression.classList.toggle("is-inked", k > 0);
  };
  const setDigits = (s: Sheet, resolved: boolean) =>
    s.digits.forEach((d) => {
      d.textContent = resolved ? (d.dataset.n ?? "") : "·";
      d.classList.remove("is-cycling");
    });
  const setCrack = (k: number) =>
    B.crack.forEach((p) => {
      const len = (p as SVGPathElement).getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len * (1 - k)}`;
    });
  const setRing = (shown: boolean, caught: boolean) =>
    glyphs.forEach((g) => {
      g.style.translate = "0px 0px";
      g.style.scale = "1";
      g.style.opacity = shown ? "1" : "0";
      g.style.color = "";
      g.classList.toggle("is-caught", caught);
    });
  const setCap = (i: number) => {
    if (cap.textContent === BEATS[i].cap) return;
    run(
      animate(cap, {
        opacity: { to: 0 },
        filter: { to: "blur(6px)" },
        duration: dur.fade,
        ease: fn(ease.accelExit),
        onComplete: () => {
          cap.textContent = BEATS[i].cap;
          run(animate(cap, { opacity: { from: 0, to: 1 }, filter: { from: "blur(6px)", to: "blur(0px)" }, duration: dur.enter, ease: fn(ease.softLand) }));
        },
      }),
    );
  };

  /// The resting state at the start of each beat, so the rail can jump anywhere.
  const pose = (beat: number) => {
    side.forEach((a) => a.cancel());
    side.clear();
    ink(A, beat >= 1 ? 1 : 0);
    ink(B, beat >= 3 ? 1 : 0);
    setDigits(A, beat >= 1);
    setDigits(B, beat >= 3);
    setCrack(beat >= 3 ? 1 : 0);
    setRing(beat >= 2, beat >= 3);
    setRingLine(beat >= 3 ? 1 : 0);
    ringSvg.style.opacity = "1";
    A.stamp.style.opacity = "0";
    B.stamp.style.opacity = "0";
    // only the sheet the beat starts with is on the water
    A.wrap.style.opacity = beat === 1 ? "1" : "0";
    B.wrap.style.opacity = beat === 3 ? "1" : "0";
    A.tint.style.opacity = "0";
    cap.textContent = BEATS[beat].cap;
    cap.style.opacity = "1";
    cap.style.filter = "none";
  };

  const impact = (s: Sheet, big: number) => {
    const p = poolPoint(s.impression);
    field?.drop(p.x, p.y, big, 0.07);
    run(animate(shake, { x: [0, -7, 6, -4, 2, 0], y: [0, 4, -3, 2, -1, 0], duration: 320, ease: "linear" }));
    const bleed = { k: 0 };
    run(animate(bleed, { k: 1, duration: dur.bleed, ease: "linear", onUpdate: () => ink(s, bleed.k) }));
  };

  const HEX = "0123456789abcdef";
  const resolve = (s: Sheet) => {
    const r = rng(29);
    const cycles = s.digits.map(() => 3 + Math.floor(r() * 4));
    const clock = { t: 0 };
    const total = dur.enter + s.digits.length * 20;
    s.digits.forEach((d) => d.classList.add("is-cycling"));
    run(
      animate(clock, {
        t: total,
        duration: total,
        ease: "linear",
        onUpdate: () =>
          s.digits.forEach((d, i) => {
            const local = (clock.t - i * 20) / dur.enter;
            if (local <= 0) return;
            if (local >= 1) {
              d.textContent = d.dataset.n ?? "";
              d.classList.remove("is-cycling");
              return;
            }
            d.textContent = HEX[(i * 7 + Math.floor(local * cycles[i]) * 5) % 16];
          }),
        onComplete: () => setDigits(s, true),
      }),
    );
  };

  /// Sixteen digits (every fourth) lift off the sinking sheet and settle on the ring.
  const rise = () => {
    const origin = ring.getBoundingClientRect();
    glyphs.forEach((g, i) => {
      const src = A.digits[i * 4].getBoundingClientRect();
      const home = homes[i];
      const x0 = src.left - origin.left - home.x;
      const y0 = src.top - origin.top - home.y;
      const lift = -60 - (i % 5) * 14;
      const p = { t: 0 };
      g.style.translate = `${x0.toFixed(1)}px ${y0.toFixed(1)}px`;
      g.style.opacity = "1";
      run(
        animate(p, {
          t: 1,
          duration: dur.sink,
          delay: sibling(i),
          ease: fn(ease.softLand),
          onUpdate: () => {
            const t = p.t;
            const u = 1 - t;
            const x = u * u * x0 + 2 * u * t * (x0 * 0.4);
            const y = u * u * y0 + 2 * u * t * (y0 * 0.4 + lift);
            const c = seal.map((v, k) => Math.round(v + (glint[k] - v) * t));
            g.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
            g.style.scale = (1 + 0.5 * Math.sin(Math.PI * t)).toFixed(3);
            g.style.color = `rgb(${c.join(",")})`;
          },
          onComplete: () => {
            g.style.color = "";
            const q = poolPoint(g);
            field?.drop(q.x, q.y, 0.05, 0.025);
          },
        }),
      );
    });
  };

  const caught = () => {
    const c = poolPoint(B.impression);
    field?.flash(c.x, c.y, dur.proofRipple);
    const line = { k: 0 };
    run(animate(line, { k: 1, duration: dur.ripple, ease: fn(ease.softLand), onUpdate: () => setRingLine(line.k) }));
    field?.drop(c.x - 50, c.y, 0.12, 0.05);
    field?.drop(c.x + 50, c.y, 0.12, 0.05);
    glyphs.forEach((g, i) => {
      g.classList.add("is-caught");
      const p = { t: 0 };
      run(animate(p, { t: 1, duration: dur.proof, delay: i * 20, ease: fn(ease.popOver), onUpdate: () => (g.style.scale = (1 + 0.45 * Math.sin(Math.PI * Math.min(1, p.t))).toFixed(3)) }));
    });
    const k = { v: 0 };
    run(animate(k, { v: 1, duration: dur.proof, ease: fn(ease.snapSettle), onUpdate: () => setCrack(k.v) }));
  };

  const dissolve = () => {
    run(animate(ringSvg, { opacity: { from: 1, to: 0 }, duration: dur.exit + 400, ease: fn(ease.accelExit) }));
    dissolveGlyphs();
  };
  const dissolveGlyphs = () =>
    glyphs.forEach((g, i) => {
      const p = { t: 0 };
      run(
        animate(p, {
          t: 1,
          duration: dur.exit,
          delay: sibling(i),
          ease: fn(ease.accelExit),
          onUpdate: () => {
            g.style.opacity = (1 - p.t).toFixed(3);
            g.style.scale = (1 - 0.5 * p.t).toFixed(3);
          },
          onComplete: () => {
            const q = poolPoint(g);
            field?.drop(q.x, q.y, 0.04, 0.02);
          },
        }),
      );
    });

  const story = createTimeline({ autoplay: false, loop: true, onLoop: () => pose(0) });
  const floatIn = (s: Sheet, at: number, fromX: string) =>
    story.add(
      s.wrap,
      {
        x: { from: fromX, to: "0%" },
        y: { from: 50, to: 0 },
        rotate: { from: -7, to: 0 },
        scale: { from: 1.06, to: 1 },
        filter: { from: "blur(6px) brightness(1)", to: "blur(0px) brightness(1)" },
        opacity: { from: 0, to: 1 },
        duration: 900,
        ease: fn(ease.softLand),
      },
      at,
    );
  const slam = (s: Sheet, at: number) => {
    story.add(
      s.stamp,
      { scale: { from: 3.2, to: 1 }, y: { from: -40, to: 0 }, filter: { from: "blur(14px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: 420, ease: fn(ease.snapSettle) },
      at,
    );
    story.add(s.stamp, { scaleX: [1, 1.04], scaleY: [1, 0.92], duration: dur.press, ease: "linear" }, at + 420);
    story.add(s.stamp, { scale: { to: 1.25 }, scaleX: 1, scaleY: 1, y: -24, opacity: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) }, at + 487);
  };

  // beat 1: seal
  floatIn(A, 0, "0%");
  story.add(A.tint, { opacity: { from: 0, to: 0 }, duration: 1 }, 0);
  story.call(() => {
    const p = poolPoint(A.sheet);
    field?.drop(p.x, p.y, 0.06, 0.12);
  }, 320);
  slam(A, 1000);
  story.call(() => impact(A, 0.24), 1420);
  story.call(() => resolve(A), 1650);
  // beat 2: register: the sheet sinks, N rises
  story.call(() => setCap(1), BEATS[1].at);
  story.add(
    A.wrap,
    { scale: { to: 0.8 }, rotate: { to: 4 }, filter: { to: "blur(7px) brightness(0.55)" }, opacity: { to: 0 }, duration: 1400, ease: fn(ease.softInOut) },
    BEATS[1].at,
  );
  story.add(A.tint, { opacity: { from: 0, to: 0.75 }, duration: 1100, ease: fn(ease.softInOut) }, BEATS[1].at);
  story.call(rise, BEATS[1].at + 50);
  // beat 3: press twice
  story.call(() => setCap(2), BEATS[2].at);
  floatIn(B, BEATS[2].at, "-120%");
  slam(B, BEATS[2].at + 1000);
  story.call(() => impact(B, 0.26), BEATS[2].at + 1420);
  story.call(() => (setDigits(B, true), caught()), BEATS[2].at + 1490);
  // beat 4: refuse: the copy is pushed away, the ring goes under
  story.call(() => setCap(3), BEATS[3].at);
  story.add(B.wrap, { x: { to: "140%" }, rotate: { to: 14 }, opacity: { to: 0 }, duration: 700, ease: fn(ease.accelExit) }, BEATS[3].at + 300);
  story.call(dissolve, BEATS[3].at + 900);
  story.call(() => {}, LOOP_MS);
  const paintRail = () => {
    const t = story.iterationCurrentTime;
    BEATS.forEach((b, i) => {
      const end = BEATS[i + 1]?.at ?? story.iterationDuration;
      const k = Math.max(0, Math.min(1, (t - b.at) / (end - b.at)));
      tracks[i].style.scale = `${k.toFixed(3)} 1`;
      beatBtns[i].classList.toggle("is-on", t >= b.at && t < end);
    });
  };
  story.onUpdate = paintRail; // assigned after both exist: anime renders while children are added

  // controls
  let paused = false;
  const setPaused = (p: boolean) => {
    paused = p;
    if (p) {
      story.pause();
      side.forEach((a) => a.pause());
    } else {
      story.resume();
      side.forEach((a) => a.resume());
    }
    pause.setAttribute("aria-label", p ? "Play the story" : "Pause the story");
    pause.classList.toggle("is-paused", p);
  };
  pause.addEventListener("click", () => setPaused(!paused));
  const jump = (i: number) => {
    story.seek(BEATS[i].at, true);
    pose(i);
    paintRail();
    if (paused) setPaused(false);
    story.resume();
  };
  beatBtns.forEach((b, i) => b.addEventListener("click", () => jump(i)));
  watch.addEventListener("click", () => jump(2));

  // only play while the hero is on screen
  let onScreen = true;
  let started = false;
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (paused || !started) return;
    if (onScreen) story.resume();
    else story.pause();
  }).observe(hero);

  if (reduced) {
    // the end of the story, still: the copy cracked inside the red ring
    hero.classList.add("is-rested", "is-reduced");
    requestAnimationFrame(() => {
      tear();
      pose(3);
    });
    rail.hidden = true; // nothing plays, so nothing to pause or jump to
    watch.hidden = true;
    return { field, el: hero };
  }

  // ---------- entry ----------
  hero.classList.add("is-entering");
  pose(0);
  const entry = createTimeline({ autoplay: false });
  wordDelays(words.length).forEach((d, i) => {
    entry.add(
      words[i],
      { y: { from: "0.35em", to: 0 }, filter: { from: "blur(10px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: 700, ease: fn(ease.softLand) },
      200 + d,
    );
  });
  [nav, badge].forEach((t, i) => entry.add(t, { y: { from: -12, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) }, sibling(i)));
  [lede, demo, watch, proof, rail].forEach((t, i) =>
    entry.add(
      t,
      { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, ease: fn(ease.softLand) },
      900 + sibling(i),
    ),
  );
  entry.add(cap, { opacity: { from: 0, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) }, 1100);
  entry.call(() => {
    started = true;
    if (onScreen && !paused) story.play();
  }, 300);
  entry.call(() => hero.classList.replace("is-entering", "is-rested"), 1800);

  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    tear();
    entry.play();
  });

  return { field, el: hero };
}
