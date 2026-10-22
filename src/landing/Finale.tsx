// Chapter 6, "It already happened" (結び): the close. One invoice, TES-INV-0003, lived its whole life
// on Zcash testnet (TEST-HNK-19, 2026-10-17): registered, advanced, repaid, settled, then offered to
// a second financier and caught. Its five real transactions lie on the page as sealed envelopes.
// Outsiders see what an explorer sees, a shielded transaction; the switch to the viewing key opens
// each envelope and shows what the parties read in its memo. Then the tagline and the way in.
// React since HNK-31.T4; the motion stays anime.js on refs.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, stagger } from "animejs";
import { inView } from "motion";
import { SPEC_URL } from "./hero";
import { dur, ease } from "./motion";
import { useT } from "./use-lang";

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
      },
      { amount: 0.4 },
    );
    return () => {
      stopRow();
      stopClose();
    };
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
        <footer className="fn-foot">
          <span className="fn-brand">JitsuinFi</span>
          <span>{t("fn.foot")}</span>
        </footer>
      </div>
    </section>
  );
}
