// Chapter 2, "One fingerprint": the visitor edits the hero's test invoice and its fingerprint N is
// computed again in the browser by jitsuin-wasm (BLAKE2b-256 over the canonical invoice bytes,
// personal string "JitsuinNullifier"). One zat more and N changes almost everywhere; put it back
// and N is the same again, already on the board. Nothing leaves the page.
// React since HNK-31.T4: the sheet, the texts and the board row are components and state; the 64
// digits scramble by hand on their own nodes (React never rewrites them), and the illustrated
// print stays the DOM view of print.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, stagger, svg as animeSvg } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { createPrintView, type PrintView } from "./print";
import { useT } from "./use-lang";
import { loadWasm } from "./wasm";

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
const HEX = "0123456789abcdef";
const boardShort = (n: string) => `${n.slice(0, 8)}…${n.slice(-6)}`;

type Said = { key: string; params?: Record<string, string | number> };

export function Fingerprint({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const [changed, setChanged] = useState<Said>({ key: "fp.asRegistered" });
  const [shown, setShown] = useState(ON_BOARD);
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const sheet = useRef<HTMLFormElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const due = useRef<HTMLInputElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const pulse = useRef<SVGCircleElement>(null);
  const hashMark = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLDivElement>(null);
  const printBox = useRef<HTMLDivElement>(null);
  const print = useRef<PrintView | null>(null);
  const digits = useRef<(HTMLSpanElement | null)[]>([]);
  const current = useRef(ON_BOARD);
  const pending = useRef(0);

  // N drawn as an illustrated fingerprint, with callouts for the bytes that shape it
  useEffect(() => {
    const p = createPrintView();
    print.current = p;
    printBox.current!.append(p.el);
    p.set(ON_BOARD, false);
    return () => p.el.remove();
  }, []);

  // ---------- computing N ----------
  const show = (n: string, from: string) => {
    const diff = [...n].filter((ch, i) => ch !== from[i]).length;
    setShown(n);
    if (n === ON_BOARD) setChanged({ key: diff ? "fp.changedBack" : "fp.asRegistered", params: { d: diff } });
    else setChanged({ key: "fp.changed", params: { d: diff } });
    print.current!.set(n, !reduced);
    const ds = digits.current as HTMLSpanElement[];
    if (reduced) {
      ds.forEach((d, i) => (d.textContent = n[i]));
      return;
    }
    // each changed digit cycles 3-6 glyphs over 400ms, left to right, 20ms apart
    const clock = { t: 0 };
    const total = dur.enter + 64 * 20;
    ds.forEach((d, i) => d.classList.toggle("is-hot", n[i] !== from[i]));
    animate(clock, {
      t: total,
      duration: total,
      ease: "linear",
      onUpdate: () =>
        ds.forEach((d, i) => {
          if (n[i] === from[i]) return;
          const k = (clock.t - i * 20) / dur.enter;
          if (k <= 0) return;
          if (k >= 1) {
            d.textContent = n[i];
            d.classList.remove("is-hot");
            return;
          }
          d.textContent = HEX[(i * 7 + Math.floor(k * (3 + (i % 4))) * 5) % 16];
        }),
      onComplete: () => ds.forEach((d, i) => ((d.textContent = n[i]), d.classList.remove("is-hot"))),
    });
    // a pulse runs each thread into the press
    paths.current.forEach((path, i) => {
      const len = path!.getTotalLength();
      const q = { t: 0 };
      animate(q, {
        t: 1,
        duration: dur.enter + 200,
        delay: sibling(i),
        ease: fn(ease.softInOut),
        onUpdate: () => {
          if (i !== 2) return; // one visible pulse; the threads themselves light
          const pt = path!.getPointAtLength(len * q.t);
          pulse.current!.setAttribute("cx", pt.x.toFixed(1));
          pulse.current!.setAttribute("cy", pt.y.toFixed(1));
          pulse.current!.setAttribute("opacity", q.t < 0.98 ? "1" : "0");
        },
      });
      path!.classList.add("is-lit");
      setTimeout(() => path!.classList.remove("is-lit"), dur.enter + 400 + sibling(i));
    });
    animate(hashMark.current!, { scale: [1, 1.06, 1], duration: dur.seal + dur.press, delay: 300, ease: fn(ease.snapSettle) });
  };

  const recompute = async () => {
    const ticket = ++pending.current;
    const amt = Math.max(1, Math.floor(Number(amount.current!.value) || 0));
    const dueDays = due.current!.value ? days(due.current!.value) : BASE.due_date;
    try {
      const w = await loadWasm();
      if (ticket !== pending.current) return;
      const code = w.invoiceEncode(JSON.stringify({ ...BASE, amount_zat: amt, due_date: dueDays }));
      const n = w.invoiceNullifier(code);
      if (n === current.current) return;
      const from = current.current;
      current.current = n;
      show(n, from);
    } catch (e) {
      setChanged({ key: "fp.invalid", params: { msg: (e as Error).message } });
    }
  };
  const step = (by: number) => {
    const a = amount.current!;
    a.value = String(by < 0 ? Math.max(1, Number(a.value) - 1) : Number(a.value) + 1);
    void recompute();
  };
  const reset = () => {
    amount.current!.value = String(BASE.amount_zat);
    due.current!.value = iso(BASE.due_date);
    void recompute();
  };

  // the due date counts on "change" (a picked date), as before; React's onChange is every input
  useEffect(() => {
    const d = due.current!;
    const on = () => void recompute();
    d.addEventListener("change", on);
    return () => d.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- entry ----------
  // the wasm loads when the chapter comes near, the scene enters when it is in view
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          void loadWasm();
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sec.current!);
    const stop = reduced
      ? () => undefined
      : inView(
          sec.current!,
          () => {
            setWaiting(false);
            heads.current.forEach((x, i) =>
              animate(x!, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
            );
            animate(sheet.current!, { y: { from: 24, to: 0 }, rotate: { from: -2, to: -0.8 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
            const drawn = animeSvg.createDrawable(paths.current as SVGPathElement[]);
            animate(drawn, { draw: ["0 0", "0 1"], duration: dur.ripple, delay: stagger(67, { start: 300 }), ease: fn(ease.softInOut) });
            animate(hashMark.current!, { scale: { from: 0.6, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: 700, ease: fn(ease.snapSettle) });
            // the print draws itself in
            setTimeout(() => print.current!.set(current.current, true), 900); // the N on the sheet now, which may already be edited
            animate(out.current!, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, duration: dur.enter, delay: 900, ease: fn(ease.softLand) });
          },
          { amount: 0.3 },
        );
    return () => {
      io.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fixed = (k: string, v: string) => (
    <div className="fp-row">
      <span className="fp-key">{t(k)}</span>
      <span className="fp-val data">{v}</span>
    </div>
  );

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
      {/* the visual: the invoice sheet, the press, the fingerprint */}
      <div className="fp-visual">
        <form className="fp-sheet" aria-label={t("fp.sheet")} onSubmit={(e) => e.preventDefault()} ref={sheet}>
          <div className="fp-sheet-head">
            <span className="fp-sheet-title">{t("doc.invoice")}</span>
            <span className="fp-sheet-no data">{BASE.invoice_id}</span>
          </div>
          <div className="fp-rows">
            {fixed("doc.supplier", short(BASE.supplier_pk))}
            {fixed("doc.buyer", short(BASE.buyer_pk))}
            {/* editable: amount (zat) with one-zat steps, and the due date */}
            <div className="fp-row fp-edit">
              <label className="fp-key" htmlFor="fp-amount">
                {t("doc.amountZat")}
              </label>
              <span className="fp-val fp-amount">
                <button className="fp-step" type="button" aria-label={t("fp.less")} onClick={() => step(-1)}>
                  −1
                </button>
                <input className="fp-input data" id="fp-amount" type="number" min="1" step="1" inputMode="numeric" defaultValue={String(BASE.amount_zat)} ref={amount} onInput={() => void recompute()} />
                <button className="fp-step" type="button" aria-label={t("fp.more")} onClick={() => step(1)}>
                  +1
                </button>
              </span>
            </div>
            <div className="fp-row fp-edit">
              <label className="fp-key" htmlFor="fp-due">
                {t("doc.due")}
              </label>
              <span className="fp-val">
                <input className="fp-input fp-date data" id="fp-due" type="date" defaultValue={iso(BASE.due_date)} ref={due} />
              </span>
            </div>
            {fixed("doc.terms", short(BASE.terms_hash))}
          </div>
          <button className="fp-reset ink-link" type="button" onClick={reset}>
            {t("fp.reset")}
          </button>
        </form>
        {/* the press: threads from the fields into the hash, then out to N */}
        <div className="fp-press" aria-hidden="true">
          <svg className="fp-threads" viewBox="0 0 200 300" preserveAspectRatio="none">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const y = 40 + i * 44;
              return <path key={i} d={`M0 ${y} C 90 ${y}, 90 150, 200 150`} className="fp-thread" ref={(e) => void (paths.current[i] = e)} />;
            })}
            <circle r={4.5} className="fp-pulse" cx={-10} cy={-10} opacity={0} ref={pulse} />
          </svg>
          <div className="fp-hash" ref={hashMark}>
            <span className="fp-hash-name">BLAKE2b-256</span>
            <span className="fp-hash-key data">“JitsuinNullifier”</span>
          </div>
        </div>
        <div className="fp-out" ref={out}>
          <p className="fp-out-label">{t("doc.fingerprint")}</p>
          <div className="fp-print-box" ref={printBox} />
          <div className="fp-grid data" role="status" aria-live="polite">
            {[0, 1, 2, 3].map((r) => (
              <span className="fp-line" key={r}>
                {Array.from({ length: 16 }, (_, c) => (
                  <span className="fp-digit" key={c} ref={(e) => void (digits.current[r * 16 + c] = e)}>
                    {ON_BOARD[r * 16 + c]}
                  </span>
                ))}
              </span>
            ))}
            <span className="sr-only">{`N ${shown}`}</span>
          </div>
          <p className="fp-changed">{t(changed.key, changed.params)}</p>
          <div className={`fp-board${shown !== ON_BOARD ? " is-new" : ""}`}>
            <span className="fp-board-tag">登記簿</span>
            <span className="fp-board-n data">{boardShort(shown)}</span>
            <span className="fp-board-st">{t(shown === ON_BOARD ? "fp.onBoard" : "fp.newN")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
