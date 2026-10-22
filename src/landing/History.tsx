// Chapter 5, "Paid, and remembered" (履歴): the buyer's history as a paper ribbon, April to December.
// Each invoice the buyer was given is a seal at its due date; a red thread joins the seals (each
// history certificate commits to the one before), and a line ties each seal to its entry on the
// public board. Everything is real jitsuin-wasm in the browser: eight certificates, the register
// entries that carry their tags, the buyer's repayments and the financier's settlements, then
// verifyHistory as a new financier would run it. "Pay" settles TES-INV-0007 by ZIP-321; "Hide the
// late invoice" leaves certificate 4 out, and the check refuses the history.
// React since HNK-31.T4. The ribbon was redrawn whole on every change; here its nodes stay, so each
// repaint cancels the running animations and clears what they left inline, as fresh nodes would.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { animate, stagger, svg as animeSvg, type JSAnimation } from "animejs";
import { inView } from "motion";
import { getLang } from "./i18n";
import { dur, ease } from "./motion";
import { useT } from "./use-lang";
import { labelKey, loadWasm, type Wasm } from "./wasm";

const fn = (f: (t: number) => number) => () => f;
const day = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const TODAY = day("2026-10-19");
const GRACE = 7;
const PAY_TO = "utest1landingfinanciera";
/// The buyer's invoices (scripts/landing-keys.mjs): index i of the TES- master is TES-INV-000i;
/// 0..6 are paid, 7 is the landing invoice, still open.
const BOOK = [
  { amount: 25000, due: "2026-04-15", paid: "2026-04-14" },
  { amount: 32000, due: "2026-05-15", paid: "2026-05-15" },
  { amount: 18000, due: "2026-06-12", paid: "2026-06-10" },
  { amount: 40000, due: "2026-07-15", paid: "2026-07-15" },
  { amount: 27500, due: "2026-08-14", paid: "2026-08-17" },
  { amount: 36000, due: "2026-09-15", paid: "2026-09-15" },
  { amount: 30000, due: "2026-10-15", paid: "2026-10-13" },
  { amount: 40000, due: "2026-12-18", paid: null },
] as const;
const HERO = 7;
const LATE = 4;
const MONTHS = ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"];

type Outcome = "PaidOnTime" | "PaidLate" | "Default" | "Open";
type Report = { on_time: number; late: number; defaults: number; open: number; lines: { index: number; nullifier: string; outcome: Outcome }[] };

/** Ribbon space: u runs along time (60..1140), v across it (the board is at negative v). */
const U0 = day("2026-04-01");
const U1 = day("2026-12-31");
const uOf = (d: number) => 60 + ((d - U0) / (U1 - U0)) * 1080;
type Layout = { box: [number, number]; at: (u: number, v: number) => [number, number]; tall: boolean };
const WIDE: Layout = { box: [1200, 400], at: (u, v) => [u, 214 + v], tall: false };
const TALL: Layout = { box: [420, 980], at: (u, v) => [214 + v, 30 + (u - 20) * 0.82], tall: true };
const BV = -140;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Apr" or "4月14日"; with `month`, "Apr" or "4月". */
const dateFmt = (d: number, month = false) => {
  const at = new Date(d * 86400000);
  const m = at.getUTCMonth();
  const dd = at.getUTCDate();
  if (getLang() === "zh") return month ? `${m + 1}月` : `${m + 1}月${dd}日`;
  return month ? MON[m] : `${dd} ${MON[m]}`;
};

type Book = { w: Wasm; certs: string[]; ns: string[]; board: unknown[]; identity: string; finPk: string; master: string; hero: { inv: string; letter: string; finSk: string } };

async function build(): Promise<Book> {
  const w = await loadWasm();
  const supplier = await labelKey("TES-landing-supplier");
  const master = await labelKey("TES-landing-buyer-master");
  const finSk = await labelKey("TES-landing-financier-a");
  const finPk = w.publicKey(finSk);
  const supplierPk = w.publicKey(supplier);
  const certs: string[] = [];
  const ns: string[] = [];
  const board: unknown[] = [];
  let hero = { inv: "", letter: "", finSk };
  const post = (memo: string, k: number) => board.push({ txid: (k % 16).toString(16).repeat(64), height: 4_500_000 + k, tx_index: 0, output_index: 0, memo });
  for (let i = 0; i < BOOK.length; i++) {
    const b = BOOK[i];
    const id = `TES-INV-000${i}`;
    const due = day(b.due);
    const inv = w.invoiceEncode(
      JSON.stringify({
        invoice_id: id,
        supplier_pk: supplierPk,
        buyer_pk: JSON.parse(w.buyerKeys(master, i)).invoice_pk,
        amount_zat: b.amount,
        issue_date: i === HERO ? TODAY : due - 60,
        due_date: due,
        terms_hash: await labelKey(`${id} terms: 60 days net`),
      }),
    );
    ns.push(w.invoiceNullifier(inv));
    const cert = w.buyerHistoryCert(master, i, inv, finPk, certs[i - 1] ?? "");
    certs.push(cert);
    post(JSON.parse(w.supplierRegisterHistoryEntry(supplier, inv, finPk, await labelKey(`TES-landing-salt-h${i}`), cert)).memo, 2 * i);
    const letter = w.assignmentEncode(inv, finPk, PAY_TO, await labelKey(`${id} assignment terms`));
    if (b.paid) {
      const pay = JSON.parse(w.buyerRepayment(master, i, inv, letter, day(b.paid)));
      post(JSON.parse(w.financierSettle(finSk, inv, letter, pay.memo)).memo, 2 * i + 1);
    } else hero = { inv, letter, finSk };
  }
  const identity = JSON.parse(w.buyerKeys(master, 0)).identity_pk;
  // the master stays here: the repayment of the open invoice needs the buyer's key
  return { w, certs, ns, board, identity, finPk, master, hero };
}

type Check = { report: Report | null; error: string; settledAs: Map<number, Outcome>; stats: { c: number; e: number; ms: string } };

/** verifyHistory as a new financier runs it; the stamps keep what the board settled when refused. */
function check(b: Book, hidden: boolean, prev: Map<number, Outcome>): Check {
  const certs = hidden ? b.certs.filter((_, i) => i !== LATE) : b.certs;
  const t0 = performance.now();
  let report: Report | null = null;
  let error = "";
  let settledAs = prev;
  try {
    report = JSON.parse(b.w.verifyHistory(JSON.stringify(certs), b.identity, JSON.stringify([b.finPk]), JSON.stringify(b.board), TODAY, GRACE));
    settledAs = new Map(report!.lines.map((l) => [l.index, l.outcome]));
  } catch (e) {
    error = (e as Error).message ?? String(e);
  }
  return { report, error, settledAs, stats: { c: certs.length, e: b.board.length, ms: (performance.now() - t0).toFixed(1) } };
}

type MarkRefs = { g: SVGGElement | null; imp: SVGGElement | null; stamp: SVGGElement | null; anchor: SVGPathElement | null };
const tallQuery = () => matchMedia("(max-width: 700px)");

export function History({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const [tall, setTall] = useState(() => tallQuery().matches);
  const [book, setBook] = useState<Book | null>(null);
  const [paid, setPaid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Check | null>(null);
  const [failed, setFailed] = useState("");
  const [waiting, setWaiting] = useState(!reduced);
  const [slip, setSlip] = useState<{ qr: string; uri: string } | null>(null);

  const marks = useRef<MarkRefs[]>(BOOK.map(() => ({ g: null, imp: null, stamp: null, anchor: null })));
  const threads = useRef<(SVGPathElement | null)[]>([]);
  const art = useRef<SVGSVGElement>(null);
  const slipEl = useRef<HTMLElement>(null);
  const qr = useRef<HTMLDivElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const numsEl = useRef<HTMLElement[]>([]);
  const running = useRef<JSAnimation[]>([]);
  const started = useRef(false);

  const L = tall ? TALL : WIDE;
  const P = (u: number, v: number) => L.at(u, v);
  const settledAs = result?.settledAs ?? new Map<number, Outcome>();

  const play = (a: JSAnimation) => void running.current.push(a);
  /** A repaint: what the old code did by drawing fresh nodes. */
  const fresh = () => {
    running.current.forEach((a) => a.cancel());
    running.current = [];
    for (const m of marks.current) for (const n of [m.g, m.imp, m.stamp, m.anchor]) n?.removeAttribute("style");
    for (const p of threads.current) p?.removeAttribute("style");
  };

  useEffect(() => {
    const q = tallQuery();
    const on = () => setTall(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  // a layout or language switch redrew the ribbon without motion
  useLayoutEffect(() => fresh(), [tall, lang]);

  // ---------- motion ----------
  const enter = () => {
    if (reduced) return;
    // seals press down left to right, the thread draws behind them, the stamps land last
    marks.current.forEach((m, i) => {
      const delay = 200 + i * 140;
      play(animate(m.anchor!, { opacity: { from: 0, to: 1 }, duration: dur.enter, delay, ease: fn(ease.softLand) }));
      if (m.g!.classList.contains("is-sealed")) play(animate(m.imp!, { scale: { from: 1.8, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay, ease: fn(ease.snapSettle) }));
      if (m.g!.classList.contains("is-stamped")) play(animate(m.stamp!, { scale: { from: 1.6, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: delay + 260, ease: fn(ease.snapSettle) }));
    });
    const on = threads.current.filter((p) => p!.classList.contains("is-on")) as SVGPathElement[];
    play(animate(animeSvg.createDrawable(on), { draw: ["0 0", "0 1"], duration: 260, delay: stagger(140, { start: 340 }), ease: fn(ease.softInOut) }));
    play(animate(numsEl.current, { y: { from: 18, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 100, delay: stagger(67, { start: 200 + BOOK.length * 140 }), ease: fn(ease.softLand) }));
  };

  // build as soon as the chapter nears; play when it is in view
  useEffect(() => {
    const stop = inView(
      art.current!,
      () => {
        setWaiting(false);
        if (started.current) return;
        started.current = true;
        build()
          .then((b) => {
            flushSync(() => {
              setBook(b);
              setResult(check(b, false, new Map()));
            });
            fresh();
            enter();
          })
          .catch((e) => setFailed((e as Error).message ?? String(e)));
      },
      { amount: 0.25 },
    );
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = async () => {
    if (!book || paid || hidden) return;
    setPaying(true);
    const b = book;
    // the buyer's wallet request: amount, the financier's address, the receipt in the memo
    const req = JSON.parse(b.w.buyerRepayment(b.master, HERO, b.hero.inv, b.hero.letter, TODAY));
    flushSync(() => setSlip({ qr: req.qr_svg, uri: `${req.uri.slice(0, 34)}…` }));
    if (!reduced) {
      animate(slipEl.current!, { y: { from: 24, to: 0 }, rotate: { from: -6, to: -1.5 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, ease: fn(ease.softLand) });
      await new Promise((r) => setTimeout(r, 1100));
    }
    // the financier sees the payment, countersigns, and the settlement goes on the board
    const settled = JSON.parse(b.w.financierSettle(b.hero.finSk, b.hero.inv, b.hero.letter, req.memo));
    b.board.push({ txid: "f".repeat(64), height: 4_500_020, tx_index: 0, output_index: 0, memo: settled.memo });
    flushSync(() => {
      setPaid(true);
      setPaying(false);
      setResult((r) => check(b, hidden, r?.settledAs ?? new Map()));
    });
    fresh();
    if (!reduced) {
      const m = marks.current[HERO];
      play(animate(m.imp!, { scale: { from: 2.2, to: 1 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(6px)", to: "blur(0px)" }, duration: dur.seal, ease: fn(ease.snapSettle) }));
      play(animate(animeSvg.createDrawable(threads.current[HERO - 1]!), { draw: ["0 0", "0 1"], duration: dur.enter, delay: dur.seal, ease: fn(ease.softInOut) }));
      play(animate(m.stamp!, { scale: { from: 1.8, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: dur.seal + dur.enter, ease: fn(ease.snapSettle) }));
      play(animate([numsEl.current[0].firstElementChild!, numsEl.current[3].firstElementChild!], { scale: [1, 1.18, 1], duration: dur.proof, delay: dur.seal + dur.enter, ease: fn(ease.softInOut) }));
    }
  };

  const hide = () => {
    if (!book) return;
    const next = !hidden;
    flushSync(() => {
      setHidden(next);
      setResult((r) => check(book, next, r?.settledAs ?? new Map()));
    });
    fresh();
    if (reduced) return;
    const m = marks.current[LATE];
    if (next) {
      play(animate(m.g!, { translateY: { from: 0, to: tall ? 0 : -18 }, translateX: { from: 0, to: tall ? 24 : 0 }, duration: dur.exit, ease: fn(ease.accelExit) }));
      animate(tally.current!, { x: [0, -6, 6, -3, 0], duration: dur.proof, delay: dur.micro, ease: "linear" });
    } else play(animate(m.g!, { opacity: { from: 0.2, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) }));
  };

  const reset = () => {
    if (!book) return;
    book.board = book.board.filter((e) => (e as { txid: string }).txid !== "f".repeat(64));
    flushSync(() => {
      setPaid(false);
      setHidden(false);
      setSlip(null);
      setResult((r) => check(book, false, r?.settledAs ?? new Map()));
    });
    fresh();
  };

  // the repayment slip: the ZIP-321 request the buyer's wallet pays, drawn by jitsuin-wasm
  useLayoutEffect(() => {
    if (!qr.current) return;
    if (!slip) return void qr.current.replaceChildren();
    const doc = new DOMParser().parseFromString(slip.qr, "image/svg+xml").documentElement;
    doc.removeAttribute("width");
    doc.removeAttribute("height");
    doc.setAttribute("aria-hidden", "true");
    qr.current.replaceChildren(document.importNode(doc, true));
  }, [slip]);

  const line = (u0: number, v0: number, u1: number, v1: number, cls: string, key?: string) => {
    const [x0, y0] = P(u0, v0);
    const [x1, y1] = P(u1, v1);
    return <path key={key} d={`M${x0} ${y0} L${x1} ${y1}`} className={cls} />;
  };

  // ---------- the drawing ----------
  const [bx, by] = P(L.tall ? 30 : 60, BV - 44);
  const [rx0, ry0] = P(-40, -34);
  const [rx1, ry1] = P(1240, 34);
  const [tx0, ty0] = P(uOf(TODAY), -72);
  const report = result?.report ?? null;
  const error = result?.error ?? "";
  const num = (key: string, cls: string, v: number | null, i: number) => (
    <div className={`hs-num ${cls}`} ref={(e) => void (numsEl.current[i] = e!)}>
      <dd className="hs-num-v">{v === null ? "–" : String(v)}</dd>
      <dt className="hs-num-k">{t(key)}</dt>
    </div>
  );

  return (
    <section className={`chapter hs-chapter${waiting ? " is-waiting" : ""}`} id="history" aria-labelledby="hs-title">
      {/* the ribbon, edge to edge */}
      <div className="hs-stage">
        <svg className={`hs-art${L.tall ? " is-tall" : ""}`} role="img" viewBox={`0 0 ${L.box[0]} ${L.box[1]}`} ref={art}>
          <title>{t("hs.aria")}</title>
          {/* the board, as one rule all entries hang from */}
          {line(-40, BV, 1240, BV, "hs-board-rule")}
          {/* the board's name sits above its rule, clear of the N labels that hang under it */}
          <text x={L.tall ? bx - 20 : bx} y={L.tall ? by + 24 : by} className="hs-board-name" textAnchor={L.tall ? "middle" : "start"}>
            登記簿
          </text>
          {L.tall ? null : (
            <text x={bx + 62} y={by} className="hs-board-sub">
              {t("hs.board")}
            </text>
          )}
          {/* the ribbon */}
          <rect x={Math.min(rx0, rx1)} y={Math.min(ry0, ry1)} width={Math.abs(rx1 - rx0)} height={Math.abs(ry1 - ry0)} className="hs-ribbon" />
          {line(-40, -34, 1240, -34, "hs-ribbon-edge")}
          {line(-40, 34, 1240, 34, "hs-ribbon-edge")}
          {/* months */}
          {MONTHS.map((m) => {
            const u = uOf(day(m));
            const [x, y] = P(u + (L.tall ? 0 : 6), L.tall ? 48 : 52);
            return [
              line(u, 26, u, 34, "hs-tick", `t${m}`),
              <text key={`m${m}`} x={L.tall ? x + 6 : x} y={L.tall ? y + 4 : y} className="hs-month" textAnchor="start">
                {dateFmt(day(m), true)}
              </text>,
            ];
          })}
          {/* today */}
          {line(uOf(TODAY), -72, uOf(TODAY), 34, "hs-today")}
          <text x={L.tall ? tx0 - 8 : tx0 + 8} y={L.tall ? ty0 + 18 : ty0 + 4} className="hs-today-label" textAnchor={L.tall ? "end" : "start"}>
            {t("hs.today")}
          </text>
          {/* the thread: one segment per link, sagging a little between seals */}
          {BOOK.slice(1).map((b, k) => {
            const i = k + 1;
            const ua = uOf(day(BOOK[i - 1].due));
            const ub = uOf(day(b.due));
            const [x0, y0] = P(ua, 0);
            const [x1, y1] = P(ub, 0);
            const [cx, cy] = P((ua + ub) / 2, 16);
            const cls = `hs-thread${i < HERO || paid ? " is-on" : ""}${hidden && (i === LATE || i === LATE + 1) ? " is-cut" : ""}`;
            return <path key={i} d={`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`} className={cls} ref={(e) => void (threads.current[k] = e)} />;
          })}
          {/* the seals */}
          {BOOK.map((b, i) => {
            const u = uOf(day(b.due));
            const [x, y] = P(u, 0);
            const [ax, ay] = P(u, BV - 12);
            const [dotX, dotY] = P(u, BV);
            const [dx, dy] = P(u, 64);
            const [sx, sy] = P(u, L.tall ? 128 : 112);
            const o = settledAs.get(i) ?? null;
            const paidLate = o === "PaidLate";
            const stamped = o === "PaidOnTime" || paidLate;
            const [dateText, subText] = b.paid
              ? [t("hs.paidOn", { d: dateFmt(day(b.paid)) }), paidLate ? t("hs.late", { n: day(b.paid) - day(b.due) }) : t("hs.onTime")]
              : paid
                ? [t("hs.paidOn", { d: dateFmt(TODAY) }), t("hs.onTime")]
                : [t("hs.due", { d: dateFmt(day(b.due)) }), t("hs.open")];
            const cls = `hs-mark${b.paid || paid ? " is-sealed" : ""}${stamped ? " is-stamped" : ""}${i === HERO ? " is-hero" : ""}${hidden && i === LATE ? " is-hidden" : ""}`;
            const m = marks.current[i];
            const [lx0, ly0] = P(u, -26);
            const [lx1, ly1] = P(u, BV);
            return (
              <g key={i} className={cls} ref={(e) => void (m.g = e)}>
                <path d={`M${lx0} ${ly0} L${lx1} ${ly1}`} className="hs-anchor" ref={(e) => void (m.anchor = e)} />
                <circle cx={dotX} cy={dotY} r={3.2} className="hs-anchor-dot" />
                <text x={L.tall ? ax - 8 : ax} y={L.tall ? ay + 4 : ay} className="hs-n" textAnchor={L.tall ? "end" : "middle"}>
                  {book ? book.ns[i].slice(0, 8) : "········"}
                </text>
                <circle cx={x} cy={y} r={23} className="hs-ring" />
                <g className="hs-imp" ref={(e) => void (m.imp = e)}>
                  <circle cx={x} cy={y} r={22} className="hs-imp-disc" />
                  <circle cx={x} cy={y} r={17.5} className="hs-imp-fine" />
                  <text x={x} y={y + 7.5} textAnchor="middle" className="hs-imp-kanji">
                    買
                  </text>
                </g>
                {/* under the ribbon: the date, then the verdict stamp */}
                <text x={L.tall ? dx - 20 : dx} y={L.tall ? dy - 4 : dy} textAnchor={L.tall ? "start" : "middle"} className="hs-date">
                  {dateText}
                </text>
                <text x={L.tall ? dx - 20 : dx} y={L.tall ? dy + 12 : dy + 16} textAnchor={L.tall ? "start" : "middle"} className="hs-sub">
                  {subText}
                </text>
                {/* the placed group keeps its transform; the inner one is what moves (CSS would replace it) */}
                <g transform={`translate(${L.tall ? sx + 18 : sx} ${sy}) rotate(${-8 + (i % 3) * 5})`}>
                  <g className={`hs-stamp${paidLate ? " is-late" : ""}`} ref={(e) => void (m.stamp = e)}>
                    <rect x={-15} y={-15} width={30} height={30} rx={3} className="hs-stamp-box" />
                    <text x={0} y={7} textAnchor="middle" className="hs-stamp-kanji">
                      {paidLate ? "遅" : "済"}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      {/* under it: the caption, the actions, the tally */}
      <div className="hs-below">
        <div className="chapter-cap hs-cap">
          <p className="chapter-kanji">{t("hs.kanji")}</p>
          <h2 className="chapter-title" id="hs-title">
            {t("hs.title")}
          </h2>
          <p className="chapter-lede">{t("hs.lede")}</p>
          <p className="chapter-note">{t("hs.note")}</p>
        </div>
        <div className="hs-act">
          <button className="seal-btn hs-pay" type="button" disabled={paid || hidden || !book || paying} onClick={() => void pay()}>
            <span className="seal-btn-label">{t(paid ? "hs.paid" : "hs.pay")}</span>
          </button>
          <div className="hs-links">
            <button className="ink-link hs-hide" type="button" disabled={!book} onClick={hide}>
              {t(hidden ? "hs.unhide" : "hs.hide")}
            </button>
            <button className="ink-link hs-reset" type="button" onClick={reset}>
              {t("hs.reset")}
            </button>
          </div>
          <figure className={`hs-slip${slip ? " is-shown" : ""}`} ref={slipEl}>
            <div className="hs-qr" ref={qr} />
            <figcaption className="hs-slip-cap">
              <span className="hs-slip-title">{t("hs.slip")}</span>
              <span className="hs-slip-to">{t("hs.slipTo")}</span>
              <span className="hs-slip-uri data">{slip?.uri ?? ""}</span>
            </figcaption>
          </figure>
        </div>
        <div className={`hs-tally${error ? " is-caught" : ""}`} role="status" aria-live="polite" ref={tally}>
          <dl className="hs-nums">
            {num("hs.t.onTime", "is-ok", report?.on_time ?? null, 0)}
            {num("hs.t.late", "is-late", report?.late ?? null, 1)}
            {num("hs.t.default", "is-default", report?.defaults ?? null, 2)}
            {num("hs.t.open", "is-open", report?.open ?? null, 3)}
          </dl>
          <p className="hs-verdict">{failed ? t("hs.caught", { msg: failed }) : error ? t("hs.caught", { msg: error }) : report ? t("hs.ok", { n: report.lines.length }) : t("hs.working")}</p>
          <p className="hs-stats data">{result ? t("hs.stats", result.stats) : ""}</p>
        </div>
      </div>
    </section>
  );
}
