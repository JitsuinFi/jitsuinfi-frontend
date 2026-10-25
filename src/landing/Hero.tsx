// Chapter 1, the hero (MASTER Amendment 3): "Kota Piutang", a cel-shaded receivables town told in
// six episodes. The camera tours the diorama while the economy of one invoice plays out: born,
// sealed by the buyer, posted to the board as one fingerprint, financed once, refused when a copy
// tries a second financier, and paid on the due date. Then it begins again.
// React since HNK-31.T4: the hero's markup is JSX; the three.js town (city.ts) and the director
// that plays the episodes stay imperative, on refs, in one effect.
import { SPEC_URL } from "../lib/hosts";
import { Mark, Wordmark } from "../app/Mark";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, createTimer, stagger, type JSAnimation, type Timer } from "animejs";
import { animate as motionAnimate, hover, press } from "motion";
import { PLACES, createCity, type City, type View } from "./city";
import { getLang, setLang, type Lang } from "./i18n";
import { dur, ease, sibling, wordDelays } from "./motion";
import { useT } from "./use-lang";

/// Real values: `node scripts/landing-keys.mjs src/wasm` (jitsuin-wasm, test keys from TES- labels; the buyer key is index 7 of a TES- master).
export const HERO_INVOICE = {
  id: "TES-INV-0007",
  amount: "0.0004 ZEC",
  n: "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5",
};

/// A real register entry on testnet (TEST-HNK-19, cycle-it, 2026-10-17).
const TESTNET_ENTRY = { txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", height: 4509299 };

/// The spec (src/lib/hosts.ts), for Finale and the app's footer.
export { SPEC_URL };

/// The headline in three beats, per language: the asset (RWA), the money (private), the guarantee
/// (the seal, once). "◉" is where the seal sits; Chinese sets its words with no spaces.
const HEADLINE: Record<Lang, { words: string[][]; gap: string }> = {
  en: { words: [["Real", "invoices."], ["Private", "capital."], ["Financed", "◉", "once."]], gap: " " },
  zh: { words: [["真实发票。"], ["私密资本。"], ["只融资", "◉", "一次。"]], gap: "" },
};

interface Episode {
  ms: number;
  /** the subject (its front turns to the camera; none keeps the island's turn), the dolly, the look height */
  place: keyof typeof PLACES | null;
  zoom: number;
  y: number;
}

const EPISODES: Episode[] = [
  { ms: 4400, place: "supplier", zoom: 0.94, y: 1.6 },
  { ms: 3800, place: "buyer", zoom: 0.88, y: 1.4 },
  { ms: 4600, place: "tower", zoom: 0.9, y: 4 },
  { ms: 4400, place: "bankA", zoom: 0.8, y: 2 },
  { ms: 4800, place: "bankB", zoom: 0.8, y: 2 },
  { ms: 5000, place: null, zoom: 1.04, y: 1.8 },
];

const short = (hex: string) => `${hex.slice(0, 4)}…${hex.slice(-4)}`;
/// anime.js reads a bare function as a per-target value; wrapping hands it the ease itself.
const fn = (f: (t: number) => number) => () => f;

/// The round seal: a heavy outer ring, a fine inner ring, 実印 set vertically.
function SealIcon({ cls }: { cls: string }): ReactNode {
  return (
    <svg viewBox="0 0 100 100" className={cls} aria-hidden="true">
      <g className="seal-mark">
        <circle cx={50} cy={50} r={45} className="seal-ring" />
        <circle cx={50} cy={50} r={37.5} className="seal-ring-fine" />
        <text x={50} y={47} className="seal-kanji" textAnchor="middle">
          実
        </text>
        <text x={50} y={76} className="seal-kanji" textAnchor="middle">
          印
        </text>
      </g>
    </svg>
  );
}

export function Hero({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const [ep, setEp] = useState(reduced ? 5 : 0);
  const [paused, setPausedView] = useState(false);
  const [state, setState] = useState<"entering" | "rested" | "reduced">(reduced ? "reduced" : "entering");
  const [noGl, setNoGl] = useState(false);

  const hero = useRef<HTMLElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const badge = useRef<HTMLParagraphElement>(null);
  const lede = useRef<HTMLParagraphElement>(null);
  const demo = useRef<HTMLAnchorElement>(null);
  const watch = useRef<HTMLButtonElement>(null);
  const proof = useRef<HTMLParagraphElement>(null);
  const epi = useRef<HTMLDivElement>(null);
  const epiParts = useRef<(HTMLElement | null)[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const tracks = useRef<(HTMLSpanElement | null)[]>([]);
  const beats = useRef<(HTMLButtonElement | null)[]>([]);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  // what the rail and the watch button call: set by the director
  const controls = useRef<{ toggle: () => void; play: (i: number) => void }>({ toggle: () => undefined, play: () => undefined });

  // a rebuilt headline (a language switch) settles in quickly; the first one waits for the entry
  const firstLang = useRef(true);
  useLayoutEffect(() => {
    if (firstLang.current) return void (firstLang.current = false);
    if (!reduced) animate(words.current.filter(Boolean) as HTMLElement[], { opacity: { from: 0, to: 1 }, y: { from: "0.2em", to: 0 }, duration: dur.enter, delay: stagger(40), ease: fn(ease.softLand) });
  }, [lang, reduced]);

  // ---------- the director ----------
  useEffect(() => {
    const h = hero.current!;
    const city = createCity(h, { reduced, n: HERO_INVOICE.n });
    if (!city) setNoGl(true);
    const d = demo.current!;

    // primary call: Motion press and hover, plus a magnet on a spring
    const label = d.querySelector(".seal-btn-label")!;
    hover(d, () => {
      motionAnimate(label, { x: 2 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
      return () => motionAnimate(label, { x: 0 }, { duration: dur.fade / 1000, ease: [0.53, 0.91, 0.89, 1] });
    });
    press(d, (el) => {
      motionAnimate(el, { scale: 0.97 }, { duration: dur.press / 1000 });
      return () => motionAnimate(el, { scale: 1 }, { duration: dur.press / 1000 });
    });

    // pointer parallax (spring-smoothed in the render loop)
    const par = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };
    let pulled = false;
    const springy = { type: "spring" as const, stiffness: 170, damping: 22, mass: 1 };
    const onPointer = (e: PointerEvent) => {
      par.tx = (e.clientX / innerWidth - 0.5) * 2;
      par.ty = -(e.clientY / innerHeight - 0.5) * 2;
      const r = d.getBoundingClientRect();
      const pad = 60;
      const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
      const clamp = (n: number) => Math.max(-8, Math.min(8, n));
      if (inside) {
        pulled = true;
        motionAnimate(d, { x: clamp((e.clientX - (r.left + r.width / 2)) / 3), y: clamp((e.clientY - (r.top + r.height / 2)) / 3) }, springy);
      } else if (pulled) {
        pulled = false;
        motionAnimate(d, { x: 0, y: 0 }, springy);
      }
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

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
      let dr = to.rot - from.rot;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      tween(ms, 0, ease.softInOut, (k) => {
        view.rot = from.rot + dr * k;
        view.zoom = from.zoom + (to.zoom - from.zoom) * k;
        for (let i = 0; i < 3; i++) view.look[i] = from.look[i] + (to.look[i] - from.look[i]) * k;
      });
    };
    // the town stands back on narrow screens
    const distance = () => (h.clientWidth < 760 ? 138 : h.clientWidth < 1024 ? 100 : 88);

    /// The resting state at the start of each episode, so the rail can jump anywhere.
    const pose = (i: number) => {
      side.forEach((a) => a.cancel());
      side.clear();
      if (!city) return;
      city.truck(i >= 1 ? city.shopStop : 0); // home at the start, at the shop from episode 2 on
      city.plane("shop", -1);
      city.plane("vault", -1);
      city.copyPlane(-1);
      city.sheet(i === 1 || i === 2, i >= 2 ? 1 : 0);
      city.stamp(0);
      city.burst(0);
      city.fingerprint(-1);
      city.board(i >= 3 ? "lit" : "off");
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
      tween(420, 0, ease.linear, (x) => city.shake(k * (1 - x)));
      tween(180, 0, ease.linear, (x) => (flash.current!.style.opacity = (0.55 * k * (1 - x)).toFixed(3)));
    };

    const enter: ((c: City) => void)[] = [
      // 1 born: the truck drives to the shop; the invoice flies after it and lands as a sheet
      (c) => {
        tween(3400, 300, ease.softInOut, (x) => c.truck(x * c.shopStop)); // pulls away, cruises, brakes
        tween(600, 500, ease.softLand, (x) => c.react("supplier", x));
        tween(2600, 900, ease.softInOut, (x) => c.plane("shop", x), () => (c.plane("shop", -1), c.sheet(true, 0)));
      },
      // 2 seal: the jitsuin comes down, squashes, lifts; impact lines; the ink bleeds
      (c) => {
        tween(dur.seal + 80, 700, ease.snapSettle, (x) => c.stamp(x), () => {
          impact(1);
          tween(dur.press, 0, ease.linear, (x) => c.stamp(1, Math.sin(Math.PI * x)));
          tween(dur.ripple / 3, 0, ease.softLand, (x) => c.burst(x), () => c.burst(0));
          tween(dur.bleed, 0, ease.linear, (x) => c.sheet(true, x));
          tween(dur.exit, dur.press + 160, ease.accelExit, (x) => c.stamp(1 - x));
          tween(700, 300, ease.softLand, (x) => c.react("buyer", x));
        });
      },
      // 3 board: N rises to the board and takes its row; the invoice folds and flies into the vault
      (c) => {
        tween(1800, 300, ease.softLand, (x) => c.fingerprint(x), () => {
          c.fingerprint(-1);
          c.board("lit");
          tween(dur.proof, 0, ease.popOver, (x) => c.verdict("registered", x));
          tween(dur.exit, 1500, ease.accelExit, (x) => c.verdict("registered", 1 - x));
        });
        tween(dur.seal, 1700, ease.snapSettle, (x) => c.vaultDoor(x));
        tween(1600, 1900, ease.softInOut, (x) => (c.sheet(false, 1), c.plane("vault", x)), () => {
          c.plane("vault", -1);
          tween(dur.exit, 0, ease.accelExit, (x) => c.vaultDoor(1 - x));
        });
      },
      // 4 financed once: bank A looks N up on the board, then the advance flows to the supplier
      (c) => {
        tween(700, 400, ease.softLand, (x) => c.beam("A", x));
        tween(dur.exit, 1900, ease.accelExit, (x) => c.beam("A", 1 - x));
        tween(1900, 2100, ease.softInOut, (x) => c.stream("advance", x), () => {
          c.stream("advance", -1);
          tween(700, 0, ease.softLand, (x) => c.react("supplier", x));
        });
      },
      // 5 twice: a copy flies to bank B; the lookup finds N already on the board: red, shutter, refused
      (c) => {
        tween(2100, 200, ease.softInOut, (x) => c.copyPlane(x));
        tween(500, 2300, ease.softLand, (x) => c.beam("B", x), () => {
          c.beam("B", 1, true);
          c.board("caught");
          impact(0.6);
          tween(dur.seal, 0, ease.snapSettle, (x) => c.shutterB(x));
          tween(dur.proof, 200, ease.popOver, (x) => c.verdict("refused", x));
          tween(900, 160, ease.accelExit, (x) => c.copyPlane(1, x), () => c.copyPlane(-1));
          tween(900, 300, ease.linear, (x) => c.react("bankB", x));
          tween(dur.exit, 900, ease.accelExit, (x) => c.beam("B", 1 - x, true));
        });
      },
      // 6 paid: the 60 days run out, the buyer pays bank A, the row settles; the truck drives home
      (c) => {
        tween(4400, 300, ease.softInOut, (x) => c.truck(c.shopStop + x * (1 - c.shopStop)));
        tween(1800, 200, ease.linear, (x) => c.calendar(60 * (1 - x)));
        tween(2000, 2000, ease.softInOut, (x) => c.stream("pay", x), () => {
          c.stream("pay", -1);
          c.board("settled");
          tween(dur.proof, 0, ease.popOver, (x) => c.verdict("settled", x));
          tween(700, 0, ease.softLand, (x) => c.react("buyer", x));
        });
      },
    ];

    let current = 0;
    let beatTimer: Timer | null = null;
    let isPaused = false;
    const parts = () => epiParts.current as HTMLElement[];
    const setEpisodeText = (i: number, animated: boolean) => {
      if (!animated) return setEp(i);
      run(
        animate(parts(), {
          opacity: { to: 0 },
          y: { to: -8 },
          duration: dur.fade,
          ease: fn(ease.accelExit),
          onComplete: () => {
            setEp(i);
            parts().forEach((n, k) =>
              run(animate(n, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, filter: { from: "blur(6px)", to: "blur(0px)" }, duration: dur.enter + 100, delay: sibling(k), ease: fn(ease.softLand) })),
            );
          },
        }),
      );
    };
    const paintRail = () => {
      const x = beatTimer ? beatTimer.currentTime / EPISODES[current].ms : 0;
      tracks.current.forEach((f, i) => (f!.style.scale = `${i < current ? 1 : i === current ? Math.min(1, x).toFixed(3) : 0} 1`));
      beats.current.forEach((b, i) => b!.classList.toggle("is-on", i === current));
    };
    const setPaused = (p: boolean) => {
      isPaused = p;
      if (p) {
        beatTimer?.pause();
        side.forEach((a) => a.pause());
      } else {
        beatTimer?.resume();
        side.forEach((a) => a.resume());
      }
      setPausedView(p);
    };
    const play = (i: number, animated = true) => {
      current = i;
      beatTimer?.cancel();
      pose(i);
      setEpisodeText(i, animated);
      fly(viewOf(EPISODES[i]), i === 0 && !animated ? 1 : 1600);
      if (city) enter[i](city);
      beatTimer = createTimer({ duration: EPISODES[i].ms, onUpdate: paintRail, onComplete: () => play((i + 1) % EPISODES.length) });
      if (isPaused) setPaused(true);
    };
    controls.current = {
      toggle: () => setPaused(!isPaused),
      play: (i) => (isPaused && setPaused(false), play(i)),
    };

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
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) {
        wakeLoop();
        if (!isPaused) beatTimer?.resume();
      } else beatTimer?.pause();
    });
    io.observe(h);
    const onVisible = () => !document.hidden && wakeLoop();
    document.addEventListener("visibilitychange", onVisible);
    const ro = new ResizeObserver(() => city?.resize());
    ro.observe(h);

    if (reduced) {
      // one still: the whole town after the story, the lantern lit
      pose(5);
      city?.board("settled");
      Object.assign(view, viewOf(EPISODES[5]));
      requestAnimationFrame((now) => {
        city?.camera(view, { x: 0, y: 0 }, distance());
        city?.frame(now);
      });
    } else {
      // ---------- entry ----------
      const entryAt = 200;
      const ws = words.current.filter(Boolean) as HTMLElement[];
      // the entry is not part of the story, so episode jumps never cancel it
      wordDelays(ws.length).forEach((dl, i) =>
        animate(ws[i], {
          y: { from: "0.35em", to: 0 },
          filter: { from: "blur(10px)", to: "blur(0px)" },
          opacity: { from: 0, to: 1 },
          duration: 700,
          delay: entryAt + dl,
          ease: fn(ease.softLand),
        }),
      );
      [nav.current!, badge.current!].forEach((x, i) => animate(x, { y: { from: -12, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: sibling(i), ease: fn(ease.softLand) }));
      [lede.current!, d, watch.current!, proof.current!, epi.current!, rail.current!].forEach((x, i) =>
        animate(x, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 900 + sibling(i), ease: fn(ease.softLand) }),
      );
      createTimer({ duration: 1900, onComplete: () => setState("rested") });
      (document.fonts?.ready ?? Promise.resolve()).then(() => {
        wakeLoop();
        play(0, false);
      });
    }
    return () => {
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisible);
      io.disconnect();
      ro.disconnect();
      beatTimer?.cancel();
      side.forEach((a) => a.cancel());
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { words: lines, gap } = HEADLINE[lang];
  words.current = [];
  let w = 0;
  const heroCls = `hero${state === "entering" ? " is-entering" : state === "rested" ? " is-rested" : " is-rested is-reduced"}${noGl ? " no-gl" : ""}`;
  const navLink = (key: string, href: string, cls = "nav-link") => (
    <a className={cls} href={href} rel={href.startsWith("http") ? "noreferrer" : undefined}>
      {t(key)}
    </a>
  );

  return (
    <section className={heroCls} id="top" aria-labelledby="hero-title" aria-describedby="hero-story" ref={hero}>
      <div className="hero-veil" aria-hidden="true" />
      <div className="impact-flash" aria-hidden="true" ref={flash} />
      <nav className="nav" aria-label={t("nav.main")} ref={nav}>
        <a className="brand" href="#top" aria-label={t("nav.top")}>
          <span className="brand-seal">
            <Mark className="brand-mark" />
          </span>
          <Wordmark className="brand-name" />
        </a>
        <div className="nav-pill glass">
          {navLink("nav.how", "#story")}
          {navLink("nav.spec", SPEC_URL, "nav-link nav-spec")}
          {/* the language switch: English or Simplified Chinese, each named in its own script */}
          <div className="lang-switch" role="group" aria-label={t("nav.lang")}>
            {(["en", "zh"] as Lang[]).map((l) => (
              <button key={l} className="lang-opt" type="button" lang={l === "en" ? "en" : "zh-Hans"} aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
          {/* plain links: the app is another world, its stylesheets load with a new document */}
          {/* the account door: sign in, or create an account, as supplier, buyer or fund member */}
          {navLink("nav.signin", "/account", "nav-link nav-signin")}
          {navLink("nav.demo", "/app", "nav-cta")}
        </div>
      </nav>
      {/* one column for the copy and the episode subtitle: they stack, so they can never overlap */}
      <div className="hero-left" id="page-start" tabIndex={-1}>
        <div className="hero-copy">
          <p className="badge glass" ref={badge}>
            <span className="badge-chip">{t("hero.chip")}</span>
            <span className="badge-text">{t("hero.badge")}</span>
          </p>
          <h1 className="hero-title" id="hero-title">
            {lines.map((ws, n) => (
              <span key={`${lang}${n}`} className={`hero-line ${n < 2 ? "hero-line-1" : "hero-line-2"}`}>
                {ws.map((word, i) => {
                  const at = w++;
                  return (
                    <Fragment key={i}>
                      <span className={word === "◉" ? "word word-seal" : "word"} ref={(e) => void (words.current[at] = e)}>
                        {word === "◉" ? <SealIcon cls="inline-seal" /> : word}
                      </span>
                      {gap && i < ws.length - 1 ? gap : null}
                    </Fragment>
                  );
                })}
              </span>
            ))}
          </h1>
          <p className="hero-lede" ref={lede}>
            {t("hero.lede")}
          </p>
          <div className="hero-calls">
            <a className="seal-btn" href="/app" ref={demo}>
              <span className="seal-btn-label">{t("hero.demo")}</span>
            </a>
            <button className="watch glass" type="button" hidden={reduced} ref={watch} onClick={() => controls.current.play(4)}>
              <svg viewBox="0 0 24 24" className="watch-icon" aria-hidden="true">
                <polygon points="7 4 20 12 7 20 7 4" />
              </svg>
              <span>{t("hero.watch")}</span>
            </button>
          </div>
          <p className="hero-proof" ref={proof}>
            <span>{t("hero.registered")}</span>
            <span className="data">{`${short(TESTNET_ENTRY.txid)} · ${t("hero.block")} ${TESTNET_ENTRY.height}`}</span>
          </p>
        </div>
        {/* the episode subtitle, anime style */}
        <div className="episode" aria-live="off" ref={epi}>
          <span className="episode-kanji" ref={(e) => void (epiParts.current[0] = e)}>
            {t(`ep${ep + 1}.kanji`)}
          </span>
          <p className="episode-title" ref={(e) => void (epiParts.current[1] = e)}>
            {t(`ep${ep + 1}.title`)}
          </p>
          <p className="episode-line" ref={(e) => void (epiParts.current[2] = e)}>
            {t(`ep${ep + 1}.line`)}
          </p>
        </div>
      </div>
      <div className="rail glass" role="group" aria-label={t("hero.rail")} hidden={reduced} ref={rail}>
        <button className={`rail-pause${paused ? " is-paused" : ""}`} type="button" aria-label={t(paused ? "hero.play" : "hero.pause")} onClick={() => controls.current.toggle()}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-pause">
            <rect x={6} y={5} width={4} height={14} />
            <rect x={14} y={5} width={4} height={14} />
          </svg>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-play">
            <polygon points="7 4 20 12 7 20 7 4" />
          </svg>
        </button>
        {EPISODES.map((_, i) => (
          <button key={i} className="rail-beat" type="button" aria-label={t("hero.episode", { i: i + 1, title: t(`ep${i + 1}.title`) })} ref={(e) => void (beats.current[i] = e)} onClick={() => controls.current.play(i)}>
            <span className="rail-label">{String(i + 1)}</span>
            <span className="rail-track">
              <span className="rail-fill" ref={(e) => void (tracks.current[i] = e)} />
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" id="hero-story">
        {t("hero.story")}
      </p>
    </section>
  );
}
