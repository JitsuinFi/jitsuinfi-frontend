// Chapter 2, "One fingerprint": the visitor edits the hero's test invoice and its fingerprint N is
// computed again in the browser by jitsuin-wasm (BLAKE2b-256 over the canonical invoice bytes,
// personal string "JitsuinNullifier"). One zat more and N changes almost everywhere; put it back
// and N is the same again, already on the board. Nothing leaves the page.
// React since HNK-31.T4: the sheet, the texts and the board row are components and state.
// HNK-33.T3: the visual is the registry press, an isometric figure (figures/registry-press.svg,
// built by scripts/figures/registry-press.build.mjs) moved by figures/registry-press.ts: a pull on
// its lever feeds the invoice, hashes it and prints the real N on the public board.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { getLang } from "./i18n";
import { useT } from "./use-lang";
import { loadWasm } from "./wasm";
import type { PressPhase } from "./figures/registry-press";
import { useFigure } from "./use-figure";

/// The hero invoice (scripts/landing-keys.mjs): test keys from TES- labels; the buyer key is index 7 of a TES- master.
const BASE = {
  invoice_id: "TES-INV-0007",
  supplier_pk: "ed7ed2ff196e991257fa507e384dfea6fac4c66725e4b2dfc35861291421af8b",
  buyer_pk: "31124f793c6ba885185323f324eda73befe068565037e6c31c5c36935b63abb8",
  amount_zat: 40000,
  issue_date: 20745,
  due_date: 20805,
  terms_hash: "4b5958693a4f019b7de30dda6ee98ffc9d8412dfa2a7648d4095aba299950b77",
};
/// N of BASE: it is on the public board (hero, board row 7).
const ON_BOARD = "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5";

const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const days = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86_400_000);
const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const zat = (n: number) => n.toLocaleString("en-US");
/** Keys of the texts and aria labels drawn inside the registry press. */
const FIG_KEYS = ["fp.fig.aria", "fp.fig.feed", "fp.fig.press", "fp.fig.vault", "fp.fig.board", "fp.fig.lever", "doc.amount", "doc.due", "doc.terms"];

type Said = { key: string; params?: Record<string, string | number> };

export function Fingerprint({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const [changed, setChanged] = useState<Said>({ key: "fp.asRegistered" });
  const [shown, setShown] = useState(ON_BOARD);
  const [phase, setPhase] = useState<{ p: Exclude<PressPhase, "done">; n: string } | null>(null);
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const figHost = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const due = useRef<HTMLInputElement>(null);
  const current = useRef(ON_BOARD);
  const pending = useRef(0);
  const pressing = useRef("");
  const busy = useRef(false);

  // the figure: its chunks load as the chapter comes near, then it is inserted and moved by its controller
  const { fig, ready } = useFigure(
    sec,
    figHost,
    reduced,
    () => Promise.all([import("./figures/registry-press.svg?raw"), import("./figures/registry-press")]),
    (svg, m) =>
      m.mountRegistryPress(svg, {
        reduced,
        onPress: () => onPress.current(),
        onPhase: (p) => setPhase(p === "done" ? null : { p, n: pressing.current }),
      }),
    () => {
      labels();
      fields(); // the paper shows the sheet's amount and due date
    },
  );

  // ---------- computing N ----------
  const show = (n: string, from: string) => {
    const diff = [...n].filter((ch, i) => ch !== from[i]).length;
    setShown(n);
    if (n === ON_BOARD) setChanged({ key: diff ? "fp.changedBack" : "fp.asRegistered", params: { d: diff } });
    else setChanged({ key: "fp.changed", params: { d: diff } });
  };

  /** The invoice as the sheet has it now; the press's paper shows the same amount and due date. */
  const fields = () => {
    const amt = Math.max(1, Math.floor(Number(amount.current!.value) || 0));
    const dueDays = due.current!.value ? days(due.current!.value) : BASE.due_date;
    fig.current?.editAmount(zat(amt), amt !== BASE.amount_zat);
    fig.current?.editDue(iso(dueDays), dueDays !== BASE.due_date);
    return { ...BASE, amount_zat: amt, due_date: dueDays };
  };

  /** N of the sheet's invoice, from jitsuin-wasm; null when a newer edit came in or it is not valid. */
  const recompute = async (): Promise<string | null> => {
    const ticket = ++pending.current;
    const inv = fields();
    try {
      const w = await loadWasm();
      if (ticket !== pending.current) return null;
      const n = w.invoiceNullifier(w.invoiceEncode(JSON.stringify(inv)));
      if (n !== current.current) {
        const from = current.current;
        current.current = n;
        show(n, from);
      }
      return n;
    } catch (e) {
      setChanged({ key: "fp.invalid", params: { msg: (e as Error).message } });
      return null;
    }
  };
  const step = (by: number) => {
    const a = amount.current!;
    a.value = String(by < 0 ? Math.max(1, Number(a.value) - 1) : Number(a.value) + 1);
    return recompute();
  };
  const backToBase = () => {
    amount.current!.value = String(BASE.amount_zat);
    due.current!.value = iso(BASE.due_date);
    return recompute();
  };

  // ---------- the press ----------
  /** The lever: the sheet's invoice goes through the press and its real N is printed on the board. */
  const pressLever = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const n = await recompute();
      if (!n) return;
      const f = await ready();
      pressing.current = short(n);
      await f.press(short(n));
    } finally {
      busy.current = false;
    }
  };

  // The press plays by itself and loops while the chapter is in view (as chapter 3): the registered
  // invoice is pressed, its N printed; one zat is added and it is pressed again, a different N
  // printed; then it starts over. Every N is the real one from jitsuin-wasm. The visitor's first
  // pull, key or control stops the loop for good and hands the press over. Reduced motion plays
  // one round, straight to the end state.
  const user = useRef(false);
  const visible = useRef(false);
  const looping = useRef(false);
  const roundDone = useRef(false);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Waits ms, then on while the chapter is off screen. */
  const hold = async (ms: number) => {
    await wait(ms);
    while (!visible.current && !user.current) await wait(400);
  };
  const takeOver = () => {
    user.current = true;
  };
  const resetAll = async () => {
    fig.current?.reset();
    roundDone.current = false;
    await backToBase();
  };
  const playRound = async (stop: () => boolean) => {
    await ready();
    await pressLever();
    if (stop()) return;
    if (!reduced) await hold(3000);
    if (stop()) return;
    await step(1); // change one zat
    if (!reduced) await hold(900);
    if (stop()) return;
    await pressLever();
    roundDone.current = true;
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
          await hold(3000); // hold the second print, then the next round
          if (user.current) break;
          await resetAll();
          await wait(700);
          if (user.current) break;
        }
        await playRound(() => user.current);
      }
    } finally {
      looping.current = false;
    }
  };

  // the visitor's hand: each control takes over first
  const pull = () => {
    takeOver();
    void pressLever();
  };
  const onPress = useRef(pull);
  onPress.current = pull;

  // its small labels follow EN/中文 (set again on each mount: the figure may arrive after a switch)
  const labels = () => fig.current?.setLabels(Object.fromEntries(FIG_KEYS.map((k) => [k, t(k)])));
  useEffect(() => {
    labels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, reduced, t]);

  // the due date counts on "change" (a picked date), as before; React's onChange is every input
  useEffect(() => {
    const d = due.current!;
    const on = () => {
      takeOver();
      void recompute();
    };
    d.addEventListener("change", on);
    return () => d.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- entry ----------
  // the wasm loads when the chapter is in view (not before: the first screen stays light), the scene enters then too
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          void loadWasm();
          io.disconnect();
        }
        if (reduced && e.isIntersecting) void loop();
      },
      { rootMargin: "0px 0px -64px 0px" }, // the wasm (271 KB) loads once the chapter is 64 px into view, never with the first screen (audit 2026-10-27)
    );
    io.observe(sec.current!);
    // the loop pauses while the chapter is off screen
    const seen = new IntersectionObserver(([e]) => void (visible.current = e.isIntersecting), { threshold: 0.15 });
    seen.observe(sec.current!);
    const stop = reduced
      ? () => undefined
      : inView(
          sec.current!,
          () => {
            setWaiting(false);
            heads.current.forEach((x, i) =>
              animate(x!, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
            );
            animate(figHost.current!, { y: { from: 24, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
            animate(readout.current!, { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: 400, ease: fn(ease.softLand) });
            setTimeout(() => void loop(), dur.enter + 700);
          },
          { amount: 0.25 },
        );
    return () => {
      io.disconnect();
      seen.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fixed = (k: string, v: string) => [
    <dt key={`k${k}`}>{t(k)}</dt>,
    <dd key={`v${k}`} className="data">
      {v}
    </dd>,
  ];
  const status = phase ? t(`fp.st.${phase.p}`, { id: BASE.invoice_id, n: phase.n }) : t(changed.key, changed.params);

  return (
    <section className={`chapter fp-chapter${waiting ? " is-waiting" : ""}`} id="story" aria-labelledby="fp-title" ref={sec}>
      {/* caption (the 35%) */}
      <div className="chapter-cap">
        <p className="chapter-kanji" ref={(e) => void (heads.current[0] = e)}>
          {t("fp.kanji")}
        </p>
        <h2 className="chapter-title" id="fp-title" ref={(e) => void (heads.current[1] = e)}>
          {t("fp.title")}
        </h2>
        <p className="chapter-lede" ref={(e) => void (heads.current[2] = e)}>
          {t("fp.lede")}
        </p>
        <p className="chapter-note" ref={(e) => void (heads.current[3] = e)}>
          {t("fp.note")}
        </p>
      </div>
      <div className="fp-visual">
        {/* the registry press: feed tray, press, the public board over the shielded vault */}
        <div className="fp-figure" ref={figHost} />
        <div className="fp-readout" ref={readout}>
          {/* the invoice the press takes: its fields, two of them editable */}
          <form className="fp-invoice" aria-label={t("fp.sheet")} onSubmit={(e) => e.preventDefault()}>
            <p className="fp-head">
              <span className="fp-title">{t("doc.invoice")}</span>
              <span className="fp-no data">{BASE.invoice_id}</span>
            </p>
            <dl className="fp-rows">
              {fixed("doc.supplier", short(BASE.supplier_pk))}
              {fixed("doc.buyer", short(BASE.buyer_pk))}
              <dt className="fp-edit">
                <label htmlFor="fp-amount">{t("doc.amountZat")}</label>
              </dt>
              <dd className="fp-amount">
                <button className="fp-step" type="button" aria-label={t("fp.less")} onClick={() => (takeOver(), void step(-1))}>
                  −1
                </button>
                <input
                  className="fp-input data"
                  id="fp-amount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  defaultValue={String(BASE.amount_zat)}
                  ref={amount}
                  onInput={() => (takeOver(), void recompute())}
                />
                <button className="fp-step" type="button" aria-label={t("fp.more")} onClick={() => (takeOver(), void step(1))}>
                  +1
                </button>
              </dd>
              <dt className="fp-edit">
                <label htmlFor="fp-due">{t("doc.due")}</label>
              </dt>
              <dd>
                <input className="fp-input fp-date data" id="fp-due" type="date" defaultValue={iso(BASE.due_date)} ref={due} />
              </dd>
              {fixed("doc.terms", short(BASE.terms_hash))}
            </dl>
            <button className="fp-reset ink-link" type="button" onClick={() => (takeOver(), void backToBase())}>
              {t("fp.reset")}
            </button>
          </form>
          {/* its fingerprint: all 64 digits (the ones that differ from the board's N marked), the board, the press */}
          <div className="fp-result">
            <p className="fp-n-label">{t("doc.fingerprint")}</p>
            <p className="fp-n data">
              {[0, 1, 2, 3].map((r) => (
                <span className="fp-n-line" key={r} aria-hidden="true">
                  {[...shown.slice(r * 16, r * 16 + 16)].map((ch, c) => (
                    <span key={c} className={ch !== ON_BOARD[r * 16 + c] ? "is-diff" : undefined}>
                      {ch}
                    </span>
                  ))}
                </span>
              ))}
              <span className="sr-only">{`N ${shown}`}</span>
            </p>
            <p className={`fp-board${shown !== ON_BOARD ? " is-new" : ""}`}>
              <span className="fp-board-tag">登記簿</span>
              <span className="fp-board-n data">{`N ${short(shown)}`}</span>
              <span className="fp-board-st">{t(shown === ON_BOARD ? "fp.onBoard" : "fp.newN")}</span>
            </p>
            <p className="fp-status" role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="fp-controls">
            <p className="fp-hint">{t("fp.fig.hint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
