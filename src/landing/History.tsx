// Chapter 5, "Paid, and remembered" (履歴): the buyer's history, checked by a new lender. Each
// invoice the buyer was given gets a history certificate that commits to the one before, and a
// register entry on the public board that carries its tag; the buyer repays, the financier settles
// on the board. Everything is real jitsuin-wasm in the browser: five certificates (TES-INV-0000 to
// 0004, #4 paid three days late), their register entries, the repayments and the settlements, then
// verifyHistory as a new lender runs it, certificate by certificate and over the whole chain.
// "Hide the late invoice" leaves certificate 4 out: its entry is still on the board, so the check
// refuses the history.
// React since HNK-31.T4. HNK-33.T5: the visual is the buyer's history cabinet, an isometric figure
// (figures/history-cabinet.svg, built by scripts/figures/history-cabinet.build.mjs) moved by
// figures/history-cabinet.ts: as each real call finishes, the cabinet shows it (the board rows are
// inked, each drawer opens and its certificate is read against the board, 済 or 遅 lands, the link
// to the certificate before lights, the flaps turn to the tally).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { getLang } from "./i18n";
import { useT } from "./use-lang";
import { labelKey, loadWasm, type Wasm } from "./wasm";
import { useFigure } from "./use-figure";

const fn = (f: (t: number) => number) => () => f;
const day = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const TODAY = day("2026-10-19");
const GRACE = 7;
const PAY_TO = "utest1landingfinanciera";
/// The buyer's invoices (scripts/landing-keys.mjs): index i of the TES- master is TES-INV-000i;
/// the history the lender sees is the first five, all paid, #4 three days late.
const BOOK = [
  { amount: 25000, due: "2026-04-15", paid: "2026-04-14" },
  { amount: 32000, due: "2026-05-15", paid: "2026-05-15" },
  { amount: 18000, due: "2026-06-12", paid: "2026-06-10" },
  { amount: 40000, due: "2026-07-15", paid: "2026-07-15" },
  { amount: 27500, due: "2026-08-14", paid: "2026-08-17" },
] as const;
const LATE = 4;

type Outcome = "PaidOnTime" | "PaidLate" | "Default" | "Open";
type Report = { on_time: number; late: number; defaults: number; open: number; lines: { index: number; nullifier: string; outcome: Outcome }[] };
type Keys = { supplier: string; master: string; finSk: string; finPk: string; supplierPk: string; identity: string };
type Entry = { txid: string; height: number; tx_index: number; output_index: number; memo: string };
/** One certificate's line in the log: N, the check's time and what it found. */
type Line = { n: string; ms?: number; out?: Outcome | "Hidden" };
type Said = { key: string; params?: Record<string, string | number> };
type Verdict = { report: Report | null; error: string; stats: { c: number; e: number; ms: string } };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Apr" or "4月14日". */
const dateFmt = (iso: string) => {
  const at = new Date(day(iso) * 86400000);
  const m = at.getUTCMonth();
  const dd = at.getUTCDate();
  return getLang() === "zh" ? `${m + 1}月${dd}日` : `${dd} ${MON[m]}`;
};
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
/** The figure's short form, as chapters 2 to 4 draw N. */
const tiny = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const lateDays = (i: number) => day(BOOK[i].paid) - day(BOOK[i].due);
/** Keys of the texts and aria labels drawn inside the cabinet. */
const FIG_KEYS = [
  "hs.fig.aria", "fp.fig.board", "hs.fig.block", "hs.fig.tag", "hs.fig.history", "hs.fig.onTime", "hs.fig.late", "hs.fig.defaulted",
  "hs.fig.buyer", "hs.fig.certs", "hs.fig.check", "hs.fig.anchored", "hs.fig.missing", "hs.fig.with", "hs.due", "hs.paidOn", "hs.late",
];

export function History({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const [lines, setLines] = useState<Line[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [failed, setFailed] = useState("");
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<Said>({ key: "hs.fig.idle" });
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const figHost = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const pending = useRef(false);
  const hide = useRef(false);
  const keys = useRef<Keys | null>(null);

  // the figure: its chunks load as the chapter comes near, then it is inserted and moved by its controller
  const { fig, ready } = useFigure(
    sec,
    figHost,
    reduced,
    () => Promise.all([import("./figures/history-cabinet.svg?raw"), import("./figures/history-cabinet")]),
    (svg, m) => m.mountHistoryCabinet(svg, { reduced, onPress: () => onPress.current() }),
    () => labels(),
  );

  // The history plays by itself and loops while the chapter is in view (as chapters 2 to 4): each
  // round is the real flow, every value from jitsuin-wasm. The visitor's first click on the cabinet,
  // key or control stops the loop for good; each click then runs one round. Reduced motion plays
  // one round, straight to the end state.
  const user = useRef(false);
  const visible = useRef(false);
  const looping = useRef(false);
  const roundDone = useRef(false);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Waits ms, then on while the chapter is off screen (unless the visitor has it). */
  const hold = async (ms: number) => {
    if (reduced) return;
    await wait(ms);
    while (!visible.current && !user.current) await wait(400);
  };
  const takeOver = () => {
    user.current = true;
  };

  // ---------- running ----------
  const keysOf = async (w: Wasm): Promise<Keys> => {
    if (keys.current) return keys.current;
    const supplier = await labelKey("TES-landing-supplier");
    const master = await labelKey("TES-landing-buyer-master");
    const finSk = await labelKey("TES-landing-financier-a");
    keys.current = { supplier, master, finSk, finPk: w.publicKey(finSk), supplierPk: w.publicKey(supplier), identity: JSON.parse(w.buyerKeys(master, 0)).identity_pk };
    return keys.current;
  };

  /** verifyHistory as a new lender runs it. */
  const check = (w: Wasm, k: Keys, certs: string[], board: Entry[]): Verdict => {
    const t0 = performance.now();
    let report: Report | null = null;
    let error = "";
    try {
      report = JSON.parse(w.verifyHistory(JSON.stringify(certs), k.identity, JSON.stringify([k.finPk]), JSON.stringify(board), TODAY, GRACE));
    } catch (e) {
      error = (e as Error).message ?? String(e);
    }
    return { report, error, stats: { c: certs.length, e: board.length, ms: (performance.now() - t0).toFixed(1) } };
  };

  const reset = () => {
    fig.current?.reset();
    setLines([]);
    setVerdict(null);
    setFailed("");
    roundDone.current = false;
  };

  const execute = async () => {
    if (running.current) {
      pending.current = true;
      return;
    }
    running.current = true;
    await ready();
    reset();
    const hiding = hide.current;
    setStatus({ key: "hs.working" });
    try {
      const w = await loadWasm();
      const k = await keysOf(w);
      // the buyer's history as it happened: each invoice, its certificate (over the one before), its
      // register entry on the board, the repayment and the financier's settlement
      const certs: string[] = [];
      const ns: string[] = [];
      const board: Entry[] = [];
      const post = (memo: string, h: number) => board.push({ txid: (h % 16).toString(16).repeat(64), height: 4_500_000 + h, tx_index: 0, output_index: 0, memo });
      for (let i = 0; i < BOOK.length; i++) {
        await hold(160);
        const b = BOOK[i];
        const id = `TES-INV-000${i}`;
        const due = day(b.due);
        const inv = w.invoiceEncode(
          JSON.stringify({
            invoice_id: id,
            supplier_pk: k.supplierPk,
            buyer_pk: JSON.parse(w.buyerKeys(k.master, i)).invoice_pk,
            amount_zat: b.amount,
            issue_date: due - 60,
            due_date: due,
            terms_hash: await labelKey(`${id} terms: 60 days net`),
          }),
        );
        ns.push(w.invoiceNullifier(inv));
        const cert = w.buyerHistoryCert(k.master, i, inv, k.finPk, certs[i - 1] ?? "");
        certs.push(cert);
        post(JSON.parse(w.supplierRegisterHistoryEntry(k.supplier, inv, k.finPk, await labelKey(`TES-landing-salt-h${i}`), cert)).memo, 2 * i);
        const letter = w.assignmentEncode(inv, k.finPk, PAY_TO, await labelKey(`${id} assignment terms`));
        const pay = JSON.parse(w.buyerRepayment(k.master, i, inv, letter, day(b.paid)));
        post(JSON.parse(w.financierSettle(k.finSk, inv, letter, pay.memo)).memo, 2 * i + 1);
        setLines((l) => [...l, { n: ns[i] }]);
        setStatus({ key: "hs.fig.st.post", params: { i, id, n: tiny(ns[i]) } });
        await fig.current?.post(i, tiny(ns[i]));
      }
      // the new lender's check, drawer by drawer: each certificate with the ones before it, against
      // the board as it stood once that invoice was settled
      for (let i = 0; i < BOOK.length; i++) {
        await hold(260);
        if (hiding && i === LATE) {
          setStatus({ key: "hs.fig.st.missing", params: { i, n: tiny(ns[i]) } });
          await fig.current?.missing(i, tiny(ns[i]));
          setLines((l) => l.map((x, j) => (j === i ? { ...x, out: "Hidden" } : x)));
          continue;
        }
        await fig.current?.open(i);
        setStatus({ key: "hs.fig.st.check", params: { i } });
        await fig.current?.scan(i, tiny(ns[i]));
        const v = check(w, k, certs.slice(0, i + 1), board.slice(0, 2 * i + 2));
        if (!v.report) throw new Error(v.error);
        const out = v.report.lines[i].outcome;
        setLines((l) => l.map((x, j) => (j === i ? { ...x, ms: Number(v.stats.ms), out } : x)));
        setStatus(out === "PaidLate" ? { key: "hs.fig.st.late", params: { i, n: lateDays(i) } } : { key: "hs.fig.st.onTime", params: { i } });
        await fig.current?.anchor(i, out === "PaidLate");
      }
      // the verdict over the whole history the buyer shows
      await hold(300);
      const shown = hiding ? certs.filter((_, i) => i !== LATE) : certs;
      const v = check(w, k, shown, board);
      setVerdict(v);
      if (v.report) {
        setStatus({ key: "hs.fig.st.closes", params: { last: BOOK.length - 1 } });
        await fig.current?.verdict([v.report.on_time, v.report.late, v.report.defaults]);
        setStatus({ key: "hs.fig.st.final", params: { a: v.report.on_time, b: v.report.late, c: v.report.defaults } });
        if (!reduced) animate(tally.current!, { y: { from: 12, to: 0 }, opacity: { from: 0.4, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) });
      } else {
        setStatus({ key: "hs.fig.st.refused" });
        await fig.current?.refuse();
        if (!reduced) animate(tally.current!, { x: [0, -6, 6, -3, 0], duration: dur.proof, ease: "linear" });
      }
      roundDone.current = true;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setFailed(msg);
      setStatus({ key: "hs.fig.st.stopped", params: { msg } });
    } finally {
      running.current = false;
      // a press during the round runs the next one, once this one's end has shown for a moment
      if (pending.current) {
        pending.current = false;
        void (roundDone.current && !reduced ? wait(1500) : Promise.resolve()).then(() => execute());
      }
    }
  };

  const loop = async () => {
    if (looping.current) return;
    looping.current = true;
    try {
      if (reduced) {
        await execute();
        return;
      }
      while (!user.current) {
        if (!visible.current) {
          await wait(400);
          continue;
        }
        if (roundDone.current) {
          await hold(3200); // hold the end state, then the next round
          if (user.current) break;
          reset();
          await wait(700);
          if (user.current) break;
        }
        await execute();
      }
    } finally {
      looping.current = false;
    }
  };

  // the visitor's hand: the cabinet or a control takes over, then runs one round
  const runOnce = () => {
    takeOver();
    void execute();
  };
  const onPress = useRef(runOnce);
  onPress.current = runOnce;
  const toggleHide = () => {
    hide.current = !hide.current;
    setHidden(hide.current);
    runOnce();
  };
  const startOver = () => {
    hide.current = false;
    setHidden(false);
    runOnce();
  };

  // its small labels (and the dates on the certificates) follow EN/中文 (set again on each mount: the
  // figure may arrive after a switch)
  const labels = () => fig.current?.setLabels(Object.fromEntries(FIG_KEYS.map((k) => [k, t(k)])), dateFmt);
  useEffect(() => {
    labels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, reduced, t]);

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

  const report = verdict?.report ?? null;
  const error = failed || verdict?.error || "";
  const outText = (i: number, o: Line["out"]) =>
    o === "Hidden" ? t("hs.fig.notShown") : o === "PaidLate" ? t("hs.late", { n: lateDays(i) }) : o === "PaidOnTime" ? t("hs.onTime") : o ? o : "";
  const num = (key: string, cls: string, v: number | null) => (
    <div className={`hs-num ${cls}`}>
      <dd className="hs-num-v">{v === null ? "–" : String(v)}</dd>
      <dt className="hs-num-k">{t(key)}</dt>
    </div>
  );

  return (
    <section className={`chapter hs-chapter${waiting ? " is-waiting" : ""}`} id="history" aria-labelledby="hs-title" ref={sec}>
      {/* caption (the 35%) */}
      <div className="chapter-cap">
        <p className="chapter-kanji" ref={(e) => void (heads.current[0] = e)}>
          {t("hs.kanji")}
        </p>
        <h2 className="chapter-title" id="hs-title" ref={(e) => void (heads.current[1] = e)}>
          {t("hs.title")}
        </h2>
        <p className="chapter-lede" ref={(e) => void (heads.current[2] = e)}>
          {t("hs.lede")}
        </p>
        <p className="chapter-note" ref={(e) => void (heads.current[3] = e)}>
          {t("hs.note")}
        </p>
      </div>
      <div className="hs-visual">
        {/* the buyer's history cabinet: five drawers, the lender's reader, the public board, the tally */}
        <div className="hs-figure" ref={figHost} />
        <div className="hs-readout" ref={readout}>
          {/* each certificate: its N, the check's measured time, what the board says */}
          <div className="hs-log-wrap">
            <p className="hs-run-status" role="status" aria-live="polite">
              {t(status.key, status.params)}
            </p>
            <ol className="hs-log">
              {BOOK.map((_, i) => {
                const l = lines[i];
                return (
                  <li key={i} className={`hs-log-line${l?.out ? " is-done" : ""}${l?.out === "Hidden" || l?.out === "PaidLate" ? " is-late" : ""}`}>
                    <span className="hs-log-st">{`#${i} · TES-INV-000${i}`}</span>
                    <span className="hs-log-ms data">{l?.ms === undefined ? "—" : `${l.ms.toFixed(1)} ms`}</span>
                    <span className="hs-log-n data">{l ? `N ${short(l.n)}` : "N —"}</span>
                    <span className="hs-log-out">{outText(i, l?.out)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          {/* the lender's tally: verifyHistory over the whole chain the buyer shows */}
          <div className={`hs-tally${error ? " is-caught" : ""}`} ref={tally}>
            <dl className="hs-nums">
              {num("hs.t.onTime", "is-ok", report?.on_time ?? null)}
              {num("hs.t.late", "is-late", report?.late ?? null)}
              {num("hs.t.default", "is-default", report?.defaults ?? null)}
            </dl>
            <p className="hs-verdict">{error ? t("hs.caught", { msg: error }) : report ? t("hs.ok", { n: report.lines.length }) : t("hs.working")}</p>
            <p className="hs-stats data">{verdict ? t("hs.stats", verdict.stats) : ""}</p>
          </div>
          <div className="hs-controls">
            <button className="ink-link hs-hide" type="button" onClick={toggleHide}>
              {t(hidden ? "hs.unhide" : "hs.hide")}
            </button>
            <button className="ink-link hs-reset" type="button" onClick={startOver}>
              {t("hs.reset")}
            </button>
            <p className="hs-hint">{t("hs.fig.hint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
