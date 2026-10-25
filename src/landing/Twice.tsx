// Chapter 4, "Pressed twice, caught once": a flow that runs itself with jitsuin-wasm. Each step is
// a real call (the sealed invoice, two signed entry slips, the public board, B's lookup, comparing
// N and the commitments, B refusing, the double-signature proof JTSP verified offline); a log keeps
// the measured times and each step's result, and the verified proof lands at the end.
// React since HNK-31.T4: the log, the texts and the proof are state.
// HNK-33.T4: the visual is the second financier's counter, an isometric figure
// (figures/second-counter.svg, built by scripts/figures/second-counter.build.mjs) moved by
// figures/second-counter.ts: as each real call finishes, the counter shows it (the offer arrives,
// B's reader looks N up, the board row under A's commitment lights, the 重 lamp, the shutter, Exhibit A).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { getLang } from "./i18n";
import { useT } from "./use-lang";
import { labelKey, loadWasm } from "./wasm";
import { useFigure } from "./use-figure";

const INVOICE = {
  invoice_id: "TES-INV-0007",
  supplier_pk: "ed7ed2ff196e991257fa507e384dfea6fac4c66725e4b2dfc35861291421af8b",
  buyer_pk: "31124f793c6ba885185323f324eda73befe068565037e6c31c5c36935b63abb8",
  amount_zat: 40000,
  issue_date: 20745,
  due_date: 20805,
  terms_hash: "4b5958693a4f019b7de30dda6ee98ffc9d8412dfa2a7648d4095aba299950b77",
};

type Id = "invoice" | "entryA" | "entryB" | "board" | "lookup" | "same" | "refuse" | "proof";
/** The flow's steps, in order: the log lists them all from the start, so it never changes height. */
const STEPS: Id[] = ["invoice", "entryA", "entryB", "board", "lookup", "same", "refuse", "proof"];

const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
/** The figure's short form, as chapters 2 and 3 draw N. */
const tiny = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const b64len = (b64: string) => Math.floor((b64.length * 3) / 4);
/** Keys of the texts and aria labels drawn inside the counter. */
const FIG_KEYS = [
  "tw.fig.aria", "fp.fig.board", "tw.fig.status", "tw.fig.registered", "tw.fig.financierA", "tw.fig.commitment", "tw.fig.financier",
  "tw.fig.offers", "tw.fig.lookup", "tw.fig.seen", "tw.fig.exhibit", "tw.fig.double", "tw.fig.offline", "doc.amount", "doc.due", "doc.terms",
];

type Said = { key: string; params?: Record<string, string | number> } | { text: string };
type Proof = { n: string; key: Said; a: Said; b: Said; size: Said; verdict: Said | null };
const NO_PROOF: Proof = { n: "—", key: { text: "—" }, a: { text: "—" }, b: { text: "—" }, size: { text: "—" }, verdict: null };

export function Twice({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const say = (s: Said | null) => (s === null ? "" : "text" in s ? s.text : t(s.key, s.params));
  const [log, setLog] = useState<Partial<Record<Id, { ms: number; out: Said }>>>({});
  const [proof, setProof] = useState<Proof>(NO_PROOF);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Said>({ key: "tw.idle" });
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const figHost = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const proofEl = useRef<HTMLElement>(null);
  const running = useRef(false);

  // the figure: its chunks load as the chapter comes near, then it is inserted and moved by its controller
  const { fig, ready } = useFigure(
    sec,
    figHost,
    reduced,
    () => Promise.all([import("./figures/second-counter.svg?raw"), import("./figures/second-counter")]),
    (svg, m) => m.mountSecondCounter(svg, { reduced, onPress: () => onPress.current() }),
    () => labels(),
  );

  // The flow plays by itself and loops while the chapter is in view (as chapters 2 and 3): each
  // round is the real flow, every value from jitsuin-wasm. The visitor's first click on the counter,
  // key or control stops the loop for good; each click then runs one round. Reduced motion plays
  // one round, straight to the end state.
  const user = useRef(false);
  const visible = useRef(false);
  const looping = useRef(false);
  const roundDone = useRef(false);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Waits ms, then on while the chapter is off screen (unless the visitor has it). */
  const hold = async (ms: number) => {
    await wait(ms);
    while (!visible.current && !user.current) await wait(400);
  };
  const takeOver = () => {
    user.current = true;
  };

  // ---------- running ----------
  const keys = async () => ({
    supplier: await labelKey("TES-landing-supplier"),
    master: await labelKey("TES-landing-buyer-master"),
    finA: await labelKey("TES-landing-financier-a"),
    finB: await labelKey("TES-landing-financier-b"),
    saltA: await labelKey("TES-landing-salt-a"),
    saltB: await labelKey("TES-landing-salt-b"),
  });

  /** One step: the real call (timed); its result goes in the log. */
  const run = async <T,>(id: Id, work: () => T, out: (r: T) => Said): Promise<T> => {
    if (!reduced) await hold(300);
    const t0 = performance.now();
    const r = work();
    const ms = performance.now() - t0;
    setLog((l) => ({ ...l, [id]: { ms, out: out(r) } }));
    return r;
  };

  const reset = () => {
    setLog({});
    fig.current?.reset();
    setShown(false);
    setProof(NO_PROOF);
    roundDone.current = false;
  };

  const execute = async () => {
    if (running.current) return;
    running.current = true;
    await ready();
    reset();
    setStatus({ key: "tw.running" });
    try {
      const w = await loadWasm();
      const k = await keys();
      const inv = await run("invoice", () => w.invoiceEncode(JSON.stringify(INVOICE)), (c) => ({ text: short(w.invoiceNullifier(c)) }));
      setStatus({ key: "tw.fig.st.arrive", params: { id: INVOICE.invoice_id } });
      await fig.current?.arrive();
      type Entry = { memo: string; commitment: string };
      const a = await run("entryA", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finA), k.saltA)) as Entry, (r) => ({ text: `→ ${short(r.commitment)}` }));
      const b = await run("entryB", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finB), k.saltB)) as Entry, (r) => ({ text: `→ ${short(r.commitment)}` }));
      type Seen = { nullifier: string; financier_commitment: string };
      const onBoard = await run("board", () => JSON.parse(w.boardMemoDescribe(a.memo)) as Seen, () => ({ key: "tw.registered" }));
      setStatus({ key: "tw.fig.st.post", params: { n: tiny(onBoard.nullifier), c: tiny(onBoard.financier_commitment) } });
      await fig.current?.post(tiny(onBoard.nullifier), tiny(onBoard.financier_commitment));
      const seen = await run("lookup", () => JSON.parse(w.boardMemoDescribe(b.memo)) as Seen, (d) => ({ key: d.nullifier === onBoard.nullifier ? "tw.found" : "tw.notFound" }));
      setStatus({ key: "tw.fig.st.lookup", params: { n: tiny(seen.nullifier) } });
      await fig.current?.lookup(tiny(seen.nullifier));
      const caught = await run("same", () => seen.nullifier === onBoard.nullifier && seen.financier_commitment !== onBoard.financier_commitment, () => ({ key: "tw.again" }));
      if (!caught) throw new Error("the two entries do not collide");
      setStatus({ key: "tw.fig.st.found", params: { c: tiny(onBoard.financier_commitment) } });
      await fig.current?.found();
      await fig.current?.lamp();
      await run("refuse", () => true, () => ({ key: "tw.refused" }));
      setStatus({ key: "tw.fig.st.refuse" });
      await fig.current?.shutter();
      const sig = w.buyerSignInvoice(k.master, 7, inv);
      const pf = await run("proof", () => w.doubleSignProof(inv, sig, a.memo, b.memo), (x) => ({ text: `JTSP · ${b64len(x)} B ✓` }));
      const r = JSON.parse(w.verifyProof(pf));
      setStatus({ key: "tw.fig.st.exhibit" });
      await fig.current?.exhibit(tiny(r.nullifier));
      setProof({
        n: short(r.nullifier),
        key: { key: "tw.p.supplier", params: { k: short(r.supplier_pk) } },
        a: { key: "tw.p.commit", params: { k: short(r.first_commitment) } },
        b: { key: "tw.p.commit", params: { k: short(r.second_commitment) } },
        size: { key: "tw.p.sizeVal", params: { n: b64len(pf) } },
        verdict: { key: "tw.p.verdict" },
      });
      setShown(true);
      if (!reduced) animate(proofEl.current!, { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, ease: fn(ease.softLand) });
      setStatus({ key: "tw.done" });
      roundDone.current = true;
    } catch (e) {
      setStatus({ key: "tw.stopped", params: { msg: (e as Error).message } });
    } finally {
      running.current = false;
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
          await hold(3000); // hold the end state, then the next round
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

  // the visitor's hand: the counter or the button takes over, then runs one round
  const runOnce = () => {
    takeOver();
    void execute();
  };
  const onPress = useRef(runOnce);
  onPress.current = runOnce;

  // its small labels follow EN/中文 (set again on each mount: the figure may arrive after a switch)
  const labels = () => fig.current?.setLabels(Object.fromEntries(FIG_KEYS.map((k) => [k, t(k)])));
  useEffect(() => {
    labels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, reduced, t]);

  // ---------- entry ----------
  // the wasm loads when the chapter comes near, the scene enters when it is in view
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          void loadWasm();
          io.disconnect();
        }
        if (reduced && e.isIntersecting) void loop();
      },
      { rootMargin: "600px 0px" },
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

  const prow = (k: string, v: string) => [<dt key={`k${k}`}>{t(k)}</dt>, <dd key={`v${k}`} className="data">{v}</dd>];

  return (
    <section className={`chapter tw-chapter${waiting ? " is-waiting" : ""}`} id="pressed-twice" aria-labelledby="tw-title" ref={sec}>
      {/* caption (the 35%) */}
      <div className="chapter-cap">
        <p className="chapter-kanji" ref={(e) => void (heads.current[0] = e)}>
          {t("tw.kanji")}
        </p>
        <h2 className="chapter-title" id="tw-title" ref={(e) => void (heads.current[1] = e)}>
          {t("tw.title")}
        </h2>
        <p className="chapter-lede" ref={(e) => void (heads.current[2] = e)}>
          {t("tw.lede")}
        </p>
        <p className="chapter-note" ref={(e) => void (heads.current[3] = e)}>
          {t("tw.note")}
        </p>
      </div>
      <div className="tw-visual">
        {/* the second financier's counter: intake, board reader, the public board, B's counter, the printer */}
        <div className="tw-figure" ref={figHost} />
        <div className="tw-readout" ref={readout}>
          {/* each real call: what it did, its result, its measured time */}
          <div className="tw-log-wrap">
            <p className="tw-run-status" role="status" aria-live="polite">
              {say(status)}
            </p>
            <ol className="tw-log">
              {STEPS.map((id) => {
                const l = log[id];
                return (
                  <li key={id} className={`tw-log-line${l ? " is-done" : ""}`}>
                    <span className="tw-log-st">{t(`tw.st.${id}`)}</span>
                    <span className="tw-log-ms data">{l ? `${l.ms.toFixed(1)} ms` : "—"}</span>
                    <span className="tw-log-text">{t(`tw.log.${id}`)}</span>
                    <span className="tw-log-out data">{l ? say(l.out) : ""}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          {/* the proof the printer hands out as Exhibit A, verified offline */}
          <article className={`tw-proof${shown ? " is-shown" : ""}`} ref={proofEl}>
            <p className="tw-proof-head">
              <span className="tw-proof-title">{t("tw.proof")}</span>
              <span className="tw-proof-kanji">二重署名証明</span>
            </p>
            <dl className="tw-proof-rows">
              {prow("tw.p.n", proof.n)}
              {prow("tw.p.by", say(proof.key))}
              {prow("tw.p.a", say(proof.a))}
              {prow("tw.p.b", say(proof.b))}
              {prow("tw.p.size", say(proof.size))}
            </dl>
            <p className="tw-verdict">{say(proof.verdict)}</p>
          </article>
          <div className="tw-controls">
            <button className="ink-link tw-exec" type="button" onClick={runOnce}>
              {t("tw.run")}
            </button>
            <p className="tw-hint">{t("tw.fig.hint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
