// Chapter 6, "It already happened" (結び): the close. One invoice, TES-INV-0003, lived its whole life
// on Zcash testnet (TEST-HNK-19, 2026-10-17): registered, advanced, repaid, settled, then offered to
// a second financier and caught. Its five real transactions lie on the page as sealed envelopes.
// Outsiders see what an explorer sees, a shielded transaction; the switch to the viewing key opens
// each envelope and shows what the parties read in its memo. Then the tagline and the way in.
// React since HNK-31.T4; the motion stays anime.js on refs.
// HNK-33.T6: beside the way in stands the registry office, an isometric figure
// (figures/registry-office.svg, built by scripts/figures/registry-office.build.mjs) moved by
// figures/registry-office.ts: TES-INV-0003 is sealed by 売 買 融 at the counter, only its N (read
// with jitsuin-wasm from the real register memo) reaches the public board at block 4 509 299, the
// advance sinks into the shielded pool, and the door to the console opens.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, stagger } from "animejs";
import { inView } from "motion";
import { SPEC_URL } from "./Hero";
import { dur, ease } from "./motion";
import { getLang } from "./i18n";
import { useT } from "./use-lang";
import { loadWasm } from "./wasm";
import { mountRegistryOffice, type RegistryOffice } from "./figures/registry-office";
import officeSvg from "./figures/registry-office.svg?raw";

const fn = (f: (t: number) => number) => () => f;

/// The testnet cycle of TES-INV-0003 as recorded in TEST-HNK-19 (I-HNK-19.1) and VID-06. Heights
/// only where they were recorded; fee 10000 zat on the four cycle transactions.
const TXS = [
  { id: "a", kanji: "登", txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", block: 4509299, fee: true },
  { id: "advance", kanji: "融", txid: "501e40dafff4d2b7bcedf1adb9535522dc8977b6c6c8f8d3da55e00574335ccb", block: null, fee: true },
  { id: "repay", kanji: "返", txid: "d59014b726554404fc5729c8699d0d029fab7a3900485241d632c50bf4aadaf0", block: null, fee: true },
  { id: "settled", kanji: "済", txid: "dcba74c63a701057d0e6e5f2cee4391b509d393c792801449c772c9552b7cad3", block: null, fee: true },
  { id: "b", kanji: "拒", txid: "05d5aa7a02a33c14d460922468745fb4d6d814daa83989eed22b21c0540c79eb", block: 4509521, fee: false },
] as const;

const short = (txid: string) => `${txid.slice(0, 10)}…${txid.slice(-8)}`;

/// The register entry of TES-INV-0003 (TXS[0], txid 33b8f3b0…, block 4 509 299): its memo as the
/// board's viewing key reads it (base64url, trailing zero padding dropped), from the published
/// snapshot jitsuinfi-zcash examples/testnet/board-snapshot.json. The office reads N from it.
const REGISTER_MEMO =
  "_0pUUzEBVu3E9e1LT81NtxrFWiCbxNd03OJtQyhxMxlBIiJQhFCzWSZfPUJho_qRc5n4sE8K81ma-Qdpd23rto_yIEsdMQIDDJUFfw1ozfS5UEPAwg9TsFtWjovtW9b-9jADi_Ob4PGwY71JaFV1trdIA9J50RKc2cmdt8myMzCPNCowWLAMDw";
const INVOICE_ID = "TES-INV-0003";
/** The block as the office's board prints it. */
const BLOCK = TXS[0].block.toLocaleString("en-US").replace(/,/g, " ");
/** The figure's short form, as chapters 2 to 4 draw N. */
const tiny = (h: string) => `N ${h.slice(0, 4)}…${h.slice(-4)}`;
/** N straight from the memo's bytes (after the 6-byte header), if jitsuin-wasm cannot load. */
function memoN(memo: string): string {
  const bin = atob(memo.replace(/-/g, "+").replace(/_/g, "/"));
  return [...bin.slice(6, 38)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}
const SEALS = [
  { k: "売", who: "sc.fig.supplier" },
  { k: "買", who: "sc.fig.buyer" },
  { k: "融", who: "sc.fig.financier" },
] as const;
/** Keys of the texts and aria labels drawn inside the office. */
const FIG_KEYS = ["fn.fig.aria", "fn.fig.board", "fn.fig.testnet", "fn.fig.block", "fn.fig.only", "fn.fig.office", "fn.fig.console", "fn.fig.open", "fn.fig.pool"];
type Said = { key: string; params?: Record<string, string | number>; who?: string };

type EnvRefs = { flap: SVGGElement | null; letter: SVGGElement | null; seal: SVGGElement | null };

/**
 * An envelope: back, the letter inside, the front pocket, the flap with its seal. An open flap lies
 * behind the letter, a closed one over the pocket: the keyed children move, so the flap node (and
 * the transform anime.js left on it) stays the same.
 */
function Envelope({ kanji, behind, refs }: { kanji: string; behind: boolean; refs: EnvRefs }): ReactNode {
  const back = <rect key="back" x={10} y={50} width={200} height={112} rx={4} className="fn-env-back" />;
  const letter = (
    <g key="letter" className="fn-letter" ref={(e) => void (refs.letter = e)}>
      <rect x={26} y={58} width={168} height={100} rx={2} className="fn-letter-paper" />
      <path d="M42 76 H140 M42 90 H160 M42 104 H122 M42 118 H150" className="fn-letter-rule" />
      <text x={172} y={84} textAnchor="middle" className="fn-letter-kanji">
        {kanji}
      </text>
    </g>
  );
  // the pocket covers all but the notch the flap closes over, so their edges are one line
  const front = <path key="front" d="M10 50 L110 116 L210 50 V162 H10 Z" className="fn-env-front" />;
  const folds = <path key="folds" d="M10 162 L92 104 M210 162 L128 104" className="fn-env-fold" />;
  // the flap turns on its top edge; the outer group keeps the position, the inner one moves
  const flapAt = (
    <g key="flapAt" transform="translate(0 50)">
      <g className="fn-flap" ref={(e) => void (refs.flap = e)}>
        <path d="M10 0 L110 66 L210 0 Z" className="fn-flap-face" />
        <g className="fn-seal" ref={(e) => void (refs.seal = e)}>
          <circle cx={110} cy={62} r={17} className="fn-seal-disc" />
          <circle cx={110} cy={62} r={13} className="fn-seal-fine" />
          <text x={110} y={69} textAnchor="middle" className="fn-seal-kanji">
            {kanji}
          </text>
        </g>
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 220 170" className="fn-env" aria-hidden="true">
      {behind ? [back, flapAt, letter, front, folds] : [back, letter, front, folds, flapAt]}
    </svg>
  );
}

export function Finale({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [behind, setBehind] = useState(false);
  const [waiting, setWaiting] = useState(!reduced);
  const [ids, setIds] = useState<Record<number, string>>({});
  const envs = useRef<EnvRefs[]>(TXS.map(() => ({ flap: null, letter: null, seal: null })));
  const lis = useRef<(HTMLLIElement | null)[]>([]);
  const row = useRef<HTMLOListElement>(null);
  const close = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const calls = useRef<HTMLDivElement>(null);
  const lang = getLang();

  // ---------- the registry office ----------
  // It plays by itself and loops while the close is in view (as chapters 2 to 4): one round is the
  // whole walk of TES-INV-0003. The visitor's first press on the office, key or control stops the
  // loop for good; a press then plays one round (Start over always restarts it). Reduced motion
  // shows the end state.
  const figHost = useRef<HTMLDivElement>(null);
  const figRead = useRef<HTMLDivElement>(null);
  const fig = useRef<RegistryOffice | null>(null);
  const READY: Said = { key: "fn.fig.st.ready", params: { id: INVOICE_ID } };
  const [figSaid, setFigSaid] = useState<Said>(READY);
  const user = useRef(false);
  const visible = useRef(false);
  const looping = useRef(false);
  const roundDone = useRef(false);
  const userRound = useRef(false);
  const round = useRef(0);
  const nHex = useRef<string | null>(null);
  const later = useRef(0);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Waits ms, then on while the close is off screen (unless the visitor has it). */
  const hold = async (ms: number) => {
    await wait(ms);
    while (!visible.current && !user.current) await wait(400);
  };
  const takeOver = () => {
    user.current = true;
  };
  /** TES-INV-0003's N, read from its register memo with jitsuin-wasm. */
  const readN = async () => {
    if (nHex.current) return nHex.current;
    let n: string;
    try {
      const w = await loadWasm();
      n = (JSON.parse(w.boardMemoDescribe(REGISTER_MEMO)) as { nullifier: string }).nullifier;
    } catch {
      n = memoN(REGISTER_MEMO);
    }
    return (nHex.current = n);
  };
  const resetFig = () => {
    round.current++;
    fig.current?.reset();
    setFigSaid(READY);
    roundDone.current = false;
  };
  const playRound = async (stop: () => boolean) => {
    const id = ++round.current;
    const gone = () => id !== round.current || stop() || !fig.current;
    const say = (x: Said) => void (!gone() && setFigSaid(x));
    const pause = async (ms: number) => {
      if (!reduced) await hold(ms);
    };
    const n = tiny(await readN());
    await pause(500);
    for (let i = 0; i < 3 && !gone(); i++) {
      say({ key: "fn.fig.st.seal", params: { k: SEALS[i].k }, who: SEALS[i].who });
      await fig.current?.seal(i);
    }
    await pause(200);
    say({ key: "fn.fig.st.sealed" });
    await pause(100);
    if (gone()) return;
    say({ key: "fn.fig.st.n", params: { n } });
    await fig.current?.fingerprint(n);
    await pause(50);
    if (gone()) return;
    const posting = fig.current?.post(n, BLOCK);
    if (!reduced) await wait(800);
    say({ key: "fn.fig.st.board", params: { h: BLOCK } });
    await posting;
    await pause(400);
    if (gone()) return;
    say({ key: "fn.fig.st.pool" });
    await fig.current?.advance();
    if (gone()) return;
    say({ key: "fn.fig.st.open" });
    await fig.current?.open();
    await pause(250);
    if (!gone()) roundDone.current = true;
  };
  const loop = async () => {
    if (looping.current) return;
    looping.current = true;
    try {
      if (reduced) {
        await playRound(() => user.current);
        return;
      }
      while (!user.current) {
        if (!visible.current) {
          await wait(400);
          continue;
        }
        if (roundDone.current) {
          await hold(3000); // hold the open door, then the next round
          if (user.current) break;
          resetFig();
          await wait(600);
          if (user.current) break;
        }
        await playRound(() => user.current);
      }
    } finally {
      looping.current = false;
    }
  };
  /** The visitor's round: back to rest, then one round, no loop. */
  const startOver = () => {
    takeOver();
    resetFig();
    clearTimeout(later.current);
    userRound.current = true;
    later.current = window.setTimeout(() => {
      void playRound(() => false).finally(() => void (userRound.current = false));
    }, reduced ? 0 : 400);
  };
  // a press on the office: takes over; plays one round unless the visitor's own round is playing
  const press = () => {
    if (user.current && userRound.current) return;
    startOver();
  };
  const onPress = useRef(press);
  onPress.current = press;

  // the figure: inserted once, moved by its controller
  useEffect(() => {
    const host = figHost.current!;
    host.innerHTML = officeSvg;
    const f = mountRegistryOffice(host.querySelector("svg")!, { reduced, onPress: () => onPress.current() });
    fig.current = f;
    return () => {
      clearTimeout(later.current);
      round.current++;
      f.destroy();
      fig.current = null;
      host.replaceChildren();
    };
  }, [reduced]);

  // its small labels follow EN/中文
  useEffect(() => {
    fig.current?.setLabels(Object.fromEntries(FIG_KEYS.map((k) => [k, t(k)])));
  }, [lang, reduced, t]);

  // ---------- the switch ----------
  const toggle = (o: boolean) => {
    if (o === open) return;
    setOpen(o);
    if (reduced) return setBehind(o);
    if (o) setTimeout(() => setBehind(true), (dur.enter + 100) / 2 + 4 * 67);
    else setBehind(false);
    const flaps = envs.current.map((e) => e.flap!);
    const letters = envs.current.map((e) => e.letter!);
    if (o) {
      animate(flaps, { scaleY: { from: 1, to: -1 }, duration: dur.enter + 100, delay: stagger(67), ease: fn(ease.softInOut) });
      animate(letters, { translateY: { from: 0, to: -34 }, duration: dur.enter + 200, delay: stagger(67, { start: 220 }), ease: fn(ease.softLand) });
    } else {
      animate(letters, { translateY: { from: -34, to: 0 }, duration: dur.exit, delay: stagger(40), ease: fn(ease.accelExit) });
      animate(flaps, { scaleY: { from: -1, to: 1 }, duration: dur.enter, delay: stagger(40, { start: 200 }), ease: fn(ease.softInOut) });
    }
  };

  // ---------- entry: the envelopes are posted one by one ----------
  useEffect(() => {
    const stopRow = inView(
      row.current!,
      () => {
        if (reduced) return;
        setWaiting(false);
        // each envelope lands with its own small tilt
        lis.current.forEach((li, i) =>
          animate(li!, { translateY: { from: -36, to: 0 }, rotate: { from: [-5, 3, -2, 4, -3][i], to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: i * 110, ease: fn(ease.softLand) }),
        );
        animate(envs.current.map((e) => e.seal!), { scale: { from: 1.7, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: stagger(110, { start: 380 }), ease: fn(ease.snapSettle) });
      },
      { amount: 0.3 },
    );
    const stopClose = inView(
      close.current!,
      () => {
        if (reduced) return;
        animate([...line.current!.children, calls.current!], { translateY: { from: 22, to: 0 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(8px)", to: "blur(0px)" }, duration: dur.enter + 200, delay: stagger(120), ease: fn(ease.softLand) });
        animate(figHost.current!, { y: { from: 24, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
        animate(figRead.current!, { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: 400, ease: fn(ease.softLand) });
        setTimeout(() => void loop(), dur.enter + 700);
      },
      { amount: 0.25 },
    );
    // the wasm warms up as the close comes near; with reduced motion the office shows its end state
    const near = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        void readN();
        near.disconnect();
        if (reduced) void loop();
      },
      { rootMargin: "600px 0px" },
    );
    near.observe(close.current!);
    // the loop pauses while the close is off screen
    const seen = new IntersectionObserver(([e]) => void (visible.current = e.isIntersecting), { threshold: 0.15 });
    seen.observe(close.current!);
    return () => {
      stopRow();
      stopClose();
      near.disconnect();
      seen.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const copy = async (i: number, txid: string, button: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(txid);
      setIds((m) => ({ ...m, [i]: t("fn.copied") }));
    } catch {
      // no clipboard: select the full id so it can be copied by hand
      setIds((m) => ({ ...m, [i]: txid }));
      requestAnimationFrame(() => getSelection()?.selectAllChildren(button));
      return;
    }
    setTimeout(() => setIds((m) => ({ ...m, [i]: short(txid) })), 1400);
  };

  return (
    <section className={`chapter fn-chapter${open ? " is-open" : ""}${waiting ? " is-waiting" : ""}`} id="on-testnet" aria-labelledby="fn-title">
      <header className="fn-head">
        <p className="chapter-kanji">{t("fn.kanji")}</p>
        <h2 className="chapter-title" id="fn-title">
          {t("fn.title")}
        </h2>
        <p className="chapter-lede">{t("fn.lede")}</p>
      </header>
      {/* who is looking: an outsider, or a party holding the viewing key */}
      <div className="fn-lens" role="group" aria-label={t("fn.lens")}>
        <button className="fn-lens-opt" type="button" aria-pressed={!open} onClick={() => toggle(false)}>
          {t("fn.outsider")}
        </button>
        <button className="fn-lens-opt" type="button" aria-pressed={open} onClick={() => toggle(true)}>
          {t("fn.withKey")}
        </button>
      </div>
      <ol className="fn-row" ref={row}>
        {TXS.map((x, i) => {
          const facts: ReactNode[] = [<span key="s">{t("fn.shielded")}</span>];
          if (x.block) facts.push(<span key="b">{t("fn.block", { h: x.block.toLocaleString("en-US") })}</span>);
          if (x.fee) facts.push(<span key="f">{t("fn.fee")}</span>);
          return (
            <li className="fn-tx" key={x.id} ref={(e) => void (lis.current[i] = e)}>
              <Envelope kanji={x.kanji} behind={behind} refs={envs.current[i]} />
              <p className="fn-step">
                <span className="fn-step-n data">{String(i + 1).padStart(2, "0")}</span>
                <span className="fn-step-name">{t(`fn.${x.id}.name`)}</span>
              </p>
              {/* the outside: what any explorer shows */}
              <div className="fn-face fn-outside">
                <button className="fn-txid data" type="button" aria-label={t("fn.copy")} title={x.txid} onClick={(e) => void copy(i, x.txid, e.currentTarget)}>
                  {ids[i] ?? short(x.txid)}
                </button>
                <p className="fn-facts">
                  {facts.map((f, j) => (
                    <Fragment key={j}>
                      {j ? " · " : null}
                      {f}
                    </Fragment>
                  ))}
                </p>
              </div>
              {/* the inside: what the parties read in the memo */}
              <div className="fn-face fn-inside">
                <p className="fn-memo">{t(`fn.${x.id}.memo`)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="fn-caption">{t("fn.caption")}</p>
      {/* the close: the line, the way in */}
      <div className="fn-close" ref={close}>
        {/* the line and the way in (the 35%) */}
        <div className="fn-close-cap">
          <p className="fn-line" ref={line}>
            <span className="fn-line-a">{t("fn.line1")}</span>
            <span className="fn-line-b">{t("fn.line2")}</span>
          </p>
          <div className="fn-calls" ref={calls}>
            {/* a plain link: the app is another world, its stylesheets load with a new document */}
            <a className="seal-btn" href="/app">
              <span className="seal-btn-label">{t("hero.demo")}</span>
            </a>
            <a className="ink-link fn-spec" href={SPEC_URL} rel="noreferrer">
              {t("nav.spec")}
            </a>
          </div>
        </div>
        {/* the registry office: the counter, the public board, the shielded pool, the door to the console */}
        <div className="fn-visual">
          <div className="fn-figure" ref={figHost} />
          <div className="fn-fig-read" ref={figRead}>
            <p className="fn-fig-status" role="status" aria-live="polite">
              {t(figSaid.key, { ...figSaid.params, ...(figSaid.who ? { who: t(figSaid.who) } : {}) })}
            </p>
            <div className="fn-fig-controls">
              <button className="ink-link fn-fig-reset" type="button" onClick={startOver}>
                {t("sc.reset")}
              </button>
              <p className="fn-fig-hint">{t("fn.fig.hint")}</p>
            </div>
          </div>
        </div>
        <footer className="fn-foot">
          <span className="fn-brand">JitsuinFi</span>
          <span>{t("fn.foot")}</span>
        </footer>
      </div>
    </section>
  );
}
