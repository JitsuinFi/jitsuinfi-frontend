// Chapter 1, the hero (MASTER Amendment 3): "Kota Piutang", a cel-shaded receivables town told in
// six episodes. The camera tours the diorama while the economy of one invoice plays out: born,
// sealed by the buyer, posted to the board as one fingerprint, financed once, refused when a copy
// tries a second financier, and paid on the due date. Then it begins again.
import { animate, createTimer, type JSAnimation, type Timer } from "animejs";
import { animate as motionAnimate, hover, press } from "motion";
import { PLACES, createCity, type City, type View } from "./city";
import { dur, ease, sibling, wordDelays } from "./motion";

/// Real values: `node scripts/hero-n.mjs src/wasm` (jitsuin-wasm, test keys derived from TES- labels).
export const HERO_INVOICE = {
  id: "TES-INV-0007",
  amount: "0.0004 ZEC",
  n: "8ee58d12d3b4170056ae09509f2339a742fcee9073af1f8cfe01b068ebdc8354",
};

/// A real register entry on testnet (TEST-HNK-19, cycle-it, 2026-10-17).
const TESTNET_ENTRY = { txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", height: 4509299 };

export const SPEC_URL = "https://github.com/JitsuinFi/jitsuinfi-zcash/blob/main/docs/zip-shielded-receivable-registry.md";

const LEDE =
  "The private invoice fund on Zcash. Every receivable leaves one fingerprint on a public board, so it is registered once and financed once. Amounts, parties and documents stay in the shielded pool.";

interface Episode {
  kanji: string;
  title: string;
  line: string;
  ms: number;
  /** the subject (its front turns to the camera; none keeps the island's turn), the dolly, the look height */
  place: keyof typeof PLACES | null;
  zoom: number;
  y: number;
}

const EPISODES: Episode[] = [
  { kanji: "第一話", title: "The invoice is born", line: "A supplier ships the goods and invoices the buyer: 0.0004 ZEC, due in 60 days.", ms: 4400, place: "supplier", zoom: 0.94, y: 1.6 },
  { kanji: "第二話", title: "The buyer's seal", line: "The buyer presses a jitsuin on it. The invoice now has one fingerprint, N.", ms: 3800, place: "buyer", zoom: 0.88, y: 1.4 },
  { kanji: "第三話", title: "One fingerprint, one board", line: "Only N goes up on the public board. The invoice itself sinks into the shielded vault.", ms: 4600, place: "tower", zoom: 0.9, y: 4 },
  { kanji: "第四話", title: "Financed once", line: "A financier looks N up, finds it once, and advances cash to the supplier.", ms: 4400, place: "bankA", zoom: 0.8, y: 2 },
  { kanji: "第五話", title: "Financed twice?", line: "A copy flies to a second financier. Same N already on the board: the gate shuts.", ms: 4800, place: "bankB", zoom: 0.8, y: 2 },
  { kanji: "第六話", title: "Paid and remembered", line: "On the due date the buyer pays. Both sign, and the buyer's record grows.", ms: 5000, place: null, zoom: 1.04, y: 1.8 },
];

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
function sealIcon(cls: string): SVGElement {
  const s = svg("svg", { viewBox: "0 0 100 100", class: cls, "aria-hidden": "true" });
  const g = svg("g", { class: "seal-mark" });
  g.append(svg("circle", { cx: 50, cy: 50, r: 45, class: "seal-ring" }), svg("circle", { cx: 50, cy: 50, r: 37.5, class: "seal-ring-fine" }));
  const a = svg("text", { x: 50, y: 47, class: "seal-kanji", "text-anchor": "middle" });
  a.textContent = "実";
  const b = svg("text", { x: 50, y: 76, class: "seal-kanji", "text-anchor": "middle" });
  b.textContent = "印";
  g.append(a, b);
  s.append(g);
  return s;
}

export function mountHero(root: HTMLElement, reduced: boolean): { city: City | null; el: HTMLElement } {
  const hero = el("section", "hero");
  hero.id = "top";
  hero.setAttribute("aria-labelledby", "hero-title");
  const veil = el("div", "hero-veil");
  veil.setAttribute("aria-hidden", "true");

  // nav
  const nav = el("nav", "nav");
  nav.setAttribute("aria-label", "Main");
  const brand = el("a", "brand");
  brand.href = "#top";
  brand.setAttribute("aria-label", "JitsuinFi, top of page");
  const brandSeal = el("span", "brand-seal");
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

  // copy
  const copy = el("div", "hero-copy");
  const badge = el("p", "badge glass");
  badge.append(el("span", "badge-chip", "Testnet"), el("span", "badge-text", "Live on Zcash testnet, NU7"));
  const title = el("h1", "hero-title");
  title.id = "hero-title";
  const words: HTMLElement[] = [];
  const line = (text: string, cls: string, sealAfter?: string) => {
    const l = el("span", `hero-line ${cls}`);
    text.split(" ").forEach((w, i, all) => {
      const s = el("span", "word", w);
      words.push(s);
      l.append(s);
      if (w === sealAfter) {
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
  // three beats: the asset (RWA), the money (private), the guarantee (the seal, once)
  line("Real invoices.", "hero-line-1");
  line("Private capital.", "hero-line-1");
  line("Financed once.", "hero-line-2", "Financed");
  const lede = el("p", "hero-lede", LEDE);
  const calls = el("div", "hero-calls");
  const demo = el("a", "seal-btn");
  demo.href = "/app.html";
  demo.append(el("span", "seal-btn-label", "Open the demo"));
  const watch = el("button", "watch glass");
  watch.type = "button";
  const watchIcon = svg("svg", { viewBox: "0 0 24 24", class: "watch-icon", "aria-hidden": "true" });
  watchIcon.append(svg("polygon", { points: "7 4 20 12 7 20 7 4" }));
  watch.append(watchIcon, el("span", "", "Watch it catch a double"));
  calls.append(demo, watch);
  const proof = el("p", "hero-proof");
  proof.append(el("span", "", "Registered on testnet"), el("span", "data", `${short(TESTNET_ENTRY.txid)} · block ${TESTNET_ENTRY.height}`));
  copy.append(badge, title, lede, calls, proof);

  // the episode subtitle, anime style
  const epi = el("div", "episode");
  epi.setAttribute("aria-live", "off");
  const epiKanji = el("span", "episode-kanji", EPISODES[0].kanji);
  const epiTitle = el("p", "episode-title", EPISODES[0].title);
  const epiLine = el("p", "episode-line", EPISODES[0].line);
  epi.append(epiKanji, epiTitle, epiLine);

  // rail
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
  const epBtns = EPISODES.map((e, i) => {
    const b = el("button", "rail-beat");
    b.type = "button";
    b.setAttribute("aria-label", `Play episode ${i + 1}: ${e.title}`);
    const track = el("span", "rail-track");
    const fill = el("span", "rail-fill");
    track.append(fill);
    tracks.push(fill);
    b.append(el("span", "rail-label", String(i + 1)), track);
    rail.append(b);
    return b;
  });

  const flash = el("div", "impact-flash");
  flash.setAttribute("aria-hidden", "true");
  hero.append(veil, flash, nav, copy, epi, rail);
  root.append(hero);
  hero.setAttribute("aria-describedby", "hero-story");
  const desc = el("p", "sr-only", "An illustrated town plays the life of one invoice: the supplier ships goods, the buyer seals the invoice, only its fingerprint N is posted to a public board while the invoice sinks into a shielded vault, a financier advances cash, a copy sent to a second financier is refused because the same N is already on the board, and the buyer pays on the due date.");
  desc.id = "hero-story";
  hero.append(desc);

  const city = createCity(hero, { reduced, n: HERO_INVOICE.n });
  if (!city) hero.classList.add("no-gl");

  // primary call: Motion press and hover, plus a magnet on a spring
  const label = demo.querySelector(".seal-btn-label")!;
  hover(demo, () => {
    motionAnimate(label, { x: 2 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
    return () => motionAnimate(label, { x: 0 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
  });
  press(demo, (t) => {
    motionAnimate(t, { scale: 0.97 }, { duration: dur.press / 1000 });
    return () => motionAnimate(t, { scale: 1 }, { duration: dur.press / 1000 });
  });

  // pointer parallax (spring-smoothed in the render loop)
  const par = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };
  if (!reduced) {
    let pulled = false;
    const springy = { type: "spring" as const, stiffness: 170, damping: 22, mass: 1 };
    window.addEventListener(
      "pointermove",
      (e) => {
        par.tx = (e.clientX / innerWidth - 0.5) * 2;
        par.ty = -(e.clientY / innerHeight - 0.5) * 2;
        const r = demo.getBoundingClientRect();
        const pad = 60;
        const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
        const clamp = (n: number) => Math.max(-8, Math.min(8, n));
        if (inside) {
          pulled = true;
          motionAnimate(demo, { x: clamp((e.clientX - (r.left + r.width / 2)) / 3), y: clamp((e.clientY - (r.top + r.height / 2)) / 3) }, springy);
        } else if (pulled) {
          pulled = false;
          motionAnimate(demo, { x: 0, y: 0 }, springy);
        }
      },
      { passive: true },
    );
  }

  // ---------- the director ----------
  const side = new Set<JSAnimation>();
  const run = (a: JSAnimation) => {
    side.add(a);
    a.then(() => side.delete(a));
    return a;
  };
  const tween = (ms: number, delay: number, e: (t: number) => number, onUpdate: (k: number) => void, onComplete?: () => void) => {
    const p = { k: 0 };
    return run(animate(p, { k: 1, duration: ms, delay, ease: fn(e), onUpdate: () => onUpdate(p.k), onComplete: () => onComplete?.() }));
  };

  // camera: the island turns the subject toward a fixed 3/4 camera, which dollies in
  const viewOf = (e: Episode): View => {
    if (!e.place) return { rot: 0, zoom: e.zoom, look: [0, e.y, 0] };
    const p = PLACES[e.place];
    // two views on the grid: from the south (workshop, shop, tower, vault face it) and from the
    // north (the banks face it); the look leans toward the subject
    const rot = p.face === 0 ? 0 : Math.PI;
    // lean in depth only, so the town never slides left into the copy
    const lean = p.face === 0 ? 0.28 : 0.46;
    return { rot, zoom: e.zoom, look: [0, e.y, p.at.z * lean] };
  };
  const view: View = { rot: 0, zoom: 1, look: [0, 1.5, 0] };
  const fly = (to: View, ms = 1600) => {
    const from: View = { rot: view.rot, zoom: view.zoom, look: [...view.look] };
    // the shortest way round
    let d = to.rot - from.rot;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    tween(ms, 0, ease.softInOut, (k) => {
      view.rot = from.rot + d * k;
      view.zoom = from.zoom + (to.zoom - from.zoom) * k;
      for (let i = 0; i < 3; i++) view.look[i] = from.look[i] + (to.look[i] - from.look[i]) * k;
    });
  };
  // the town stands back on narrow screens
  const distance = () => (hero.clientWidth < 760 ? 138 : hero.clientWidth < 1024 ? 100 : 88);

  /// The resting state at the start of each episode, so the rail can jump anywhere.
  const pose = (ep: number) => {
    side.forEach((a) => a.cancel());
    side.clear();
    if (!city) return;
    city.truck(ep >= 1 ? city.shopStop : 0); // home at the start, at the shop from episode 2 on
    city.plane("shop", -1);
    city.plane("vault", -1);
    city.copyPlane(-1);
    city.sheet(ep === 1 || ep === 2, ep >= 2 ? 1 : 0);
    city.stamp(0);
    city.burst(0);
    city.fingerprint(-1);
    city.board(ep >= 3 ? "lit" : "off");
    city.vaultDoor(0);
    city.beam("A", 0);
    city.beam("B", 0);
    city.shutterB(0);
    for (const k of ["registered", "refused", "settled"] as const) city.verdict(k, 0);
    city.stream("advance", -1);
    city.stream("pay", -1);
    city.calendar(60);
    for (const w of ["supplier", "buyer", "bankA", "bankB"] as const) city.react(w, 0);
    city.shake(0);
  };

  // impact: the camera jolts and the frame flashes paper white for a beat (anime impact frame)
  const impact = (k: number) => {
    if (!city) return;
    tween(420, 0, ease.linear, (t) => city.shake(k * (1 - t)));
    tween(180, 0, ease.linear, (t) => (flash.style.opacity = (0.55 * k * (1 - t)).toFixed(3)));
  };

  const enter: ((c: City) => void)[] = [
    // 1 born: the truck drives to the shop; the invoice flies after it and lands as a sheet
    (c) => {
      tween(3400, 300, ease.softInOut, (t) => c.truck(t * c.shopStop)); // pulls away, cruises, brakes
      tween(600, 500, ease.softLand, (t) => c.react("supplier", t));
      tween(2600, 900, ease.softInOut, (t) => c.plane("shop", t), () => (c.plane("shop", -1), c.sheet(true, 0)));
    },
    // 2 seal: the jitsuin comes down, squashes, lifts; impact lines; the ink bleeds
    (c) => {
      tween(dur.seal + 80, 700, ease.snapSettle, (t) => c.stamp(t), () => {
        impact(1);
        tween(dur.press, 0, ease.linear, (t) => c.stamp(1, Math.sin(Math.PI * t)));
        tween(dur.ripple / 3, 0, ease.softLand, (t) => c.burst(t), () => c.burst(0));
        tween(dur.bleed, 0, ease.linear, (t) => c.sheet(true, t));
        tween(dur.exit, dur.press + 160, ease.accelExit, (t) => c.stamp(1 - t));
        tween(700, 300, ease.softLand, (t) => c.react("buyer", t));
      });
    },
    // 3 board: N rises to the board and takes its row; the invoice folds and flies into the vault
    (c) => {
      tween(1800, 300, ease.softLand, (t) => c.fingerprint(t), () => {
        c.fingerprint(-1);
        c.board("lit");
        tween(dur.proof, 0, ease.popOver, (t) => c.verdict("registered", t));
        tween(dur.exit, 1500, ease.accelExit, (t) => c.verdict("registered", 1 - t));
      });
      tween(dur.seal, 1700, ease.snapSettle, (t) => c.vaultDoor(t));
      tween(1600, 1900, ease.softInOut, (t) => (c.sheet(false, 1), c.plane("vault", t)), () => {
        c.plane("vault", -1);
        tween(dur.exit, 0, ease.accelExit, (t) => c.vaultDoor(1 - t));
      });
    },
    // 4 financed once: bank A looks N up on the board, then the advance flows to the supplier
    (c) => {
      tween(700, 400, ease.softLand, (t) => c.beam("A", t));
      tween(dur.exit, 1900, ease.accelExit, (t) => c.beam("A", 1 - t));
      tween(1900, 2100, ease.softInOut, (t) => c.stream("advance", t), () => {
        c.stream("advance", -1);
        tween(700, 0, ease.softLand, (t) => c.react("supplier", t));
      });
    },
    // 5 twice: a copy flies to bank B; the lookup finds N already on the board: red, shutter, refused
    (c) => {
      tween(2100, 200, ease.softInOut, (t) => c.copyPlane(t));
      tween(500, 2300, ease.softLand, (t) => c.beam("B", t), () => {
        c.beam("B", 1, true);
        c.board("caught");
        impact(0.6);
        tween(dur.seal, 0, ease.snapSettle, (t) => c.shutterB(t));
        tween(dur.proof, 200, ease.popOver, (t) => c.verdict("refused", t));
        tween(900, 160, ease.accelExit, (t) => c.copyPlane(1, t), () => c.copyPlane(-1));
        tween(900, 300, ease.linear, (t) => c.react("bankB", t));
        tween(dur.exit, 900, ease.accelExit, (t) => c.beam("B", 1 - t, true));
      });
    },
    // 6 paid: the 60 days run out, the buyer pays bank A, the row settles; the truck drives home
    (c) => {
      tween(4400, 300, ease.softInOut, (t) => c.truck(c.shopStop + t * (1 - c.shopStop)));
      tween(1800, 200, ease.linear, (t) => c.calendar(60 * (1 - t)));
      tween(2000, 2000, ease.softInOut, (t) => c.stream("pay", t), () => {
        c.stream("pay", -1);
        c.board("settled");
        tween(dur.proof, 0, ease.popOver, (t) => c.verdict("settled", t));
        tween(700, 0, ease.softLand, (t) => c.react("buyer", t));
      });
    },
  ];

  let current = 0;
  let beatTimer: Timer | null = null;
  let paused = false;
  const setEpisodeText = (i: number, animated: boolean) => {
    const e = EPISODES[i];
    const swap = () => {
      epiKanji.textContent = e.kanji;
      epiTitle.textContent = e.title;
      epiLine.textContent = e.line;
    };
    if (!animated) return swap();
    run(
      animate([epiKanji, epiTitle, epiLine], {
        opacity: { to: 0 },
        y: { to: -8 },
        duration: dur.fade,
        ease: fn(ease.accelExit),
        onComplete: () => {
          swap();
          [epiKanji, epiTitle, epiLine].forEach((n, k) =>
            run(animate(n, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, filter: { from: "blur(6px)", to: "blur(0px)" }, duration: dur.enter + 100, delay: sibling(k), ease: fn(ease.softLand) })),
          );
        },
      }),
    );
  };
  const paintRail = () => {
    const t = beatTimer ? beatTimer.currentTime / EPISODES[current].ms : 0;
    tracks.forEach((f, i) => (f.style.scale = `${i < current ? 1 : i === current ? Math.min(1, t).toFixed(3) : 0} 1`));
    epBtns.forEach((b, i) => b.classList.toggle("is-on", i === current));
  };
  const play = (i: number, animated = true) => {
    current = i;
    beatTimer?.cancel();
    pose(i);
    setEpisodeText(i, animated);
    fly(viewOf(EPISODES[i]), i === 0 && !animated ? 1 : 1600);
    if (city) enter[i](city);
    beatTimer = createTimer({ duration: EPISODES[i].ms, onUpdate: paintRail, onComplete: () => play((i + 1) % EPISODES.length) });
    if (paused) setPaused(true);
  };
  const setPaused = (p: boolean) => {
    paused = p;
    if (p) {
      beatTimer?.pause();
      side.forEach((a) => a.pause());
    } else {
      beatTimer?.resume();
      side.forEach((a) => a.resume());
    }
    pause.setAttribute("aria-label", p ? "Play the story" : "Pause the story");
    pause.classList.toggle("is-paused", p);
  };
  pause.addEventListener("click", () => setPaused(!paused));
  epBtns.forEach((b, i) => b.addEventListener("click", () => (paused && setPaused(false), play(i))));
  watch.addEventListener("click", () => (paused && setPaused(false), play(4)));

  // render loop: only while the hero is on screen and the tab is visible
  let onScreen = true;
  let raf = 0;
  const loop = (now: number) => {
    raf = 0;
    if (!city || !onScreen || document.hidden) return;
    const dt = 1 / 60;
    for (const k of ["x", "y"] as const) {
      const tk = k === "x" ? par.tx : par.ty;
      const vk = k === "x" ? "vx" : "vy";
      par[vk] += (100 * (tk - par[k]) - 18 * par[vk]) * dt;
      par[k] += par[vk] * dt;
    }
    city.camera(view, reduced ? { x: 0, y: 0 } : { x: par.x, y: par.y }, distance());
    city.frame(now);
    raf = requestAnimationFrame(loop);
  };
  const wakeLoop = () => {
    if (!raf && city) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen) {
      wakeLoop();
      if (!paused) beatTimer?.resume();
    } else beatTimer?.pause();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => !document.hidden && wakeLoop());
  new ResizeObserver(() => city?.resize()).observe(hero);

  if (reduced) {
    // one still: the whole town after the story, the lantern lit
    hero.classList.add("is-rested", "is-reduced");
    rail.hidden = true;
    watch.hidden = true;
    pose(5);
    city?.board("settled");
    setEpisodeText(5, false);
    Object.assign(view, viewOf(EPISODES[5]));
    requestAnimationFrame((now) => {
      city?.camera(view, { x: 0, y: 0 }, distance());
      city?.frame(now);
    });
    return { city, el: hero };
  }

  // ---------- entry ----------
  hero.classList.add("is-entering");
  const entryAt = 200;
  // the entry is not part of the story, so episode jumps never cancel it
  wordDelays(words.length).forEach((d, i) =>
    animate(words[i], {
      y: { from: "0.35em", to: 0 },
      filter: { from: "blur(10px)", to: "blur(0px)" },
      opacity: { from: 0, to: 1 },
      duration: 700,
      delay: entryAt + d,
      ease: fn(ease.softLand),
    }),
  );
  [nav, badge].forEach((t, i) => animate(t, { y: { from: -12, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: sibling(i), ease: fn(ease.softLand) }));
  [lede, demo, watch, proof, epi, rail].forEach((t, i) =>
    animate(t, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 900 + sibling(i), ease: fn(ease.softLand) }),
  );
  createTimer({ duration: 1900, onComplete: () => hero.classList.replace("is-entering", "is-rested") });

  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    wakeLoop();
    play(0, false);
  });

  return { city, el: hero };
}
