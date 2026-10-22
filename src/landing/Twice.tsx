// Chapter 4, "Pressed twice, caught once": a flow that runs itself, on the day paper. Each station
// is drawn as the thing it is (the sealed invoice, two signed entry slips, the public board, a
// lookup, the comparison of N and commitments, a bank with its shutter down, the proof) and is
// joined to the next by a wire that data flows along. When the chapter comes into view the flow
// executes with jitsuin-wasm: each station runs a real call, then shows its result; a log keeps
// the measured times; the verified double-signature proof (JTSP) lands at the end.
// React since HNK-31.T4: stations, texts, the log and the proof are state; the flowing dots, the
// shutter and the stamp move as before, on refs.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { useT } from "./use-lang";
import { labelKey, loadWasm } from "./wasm";

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
type Layout = { box: [number, number]; at: Record<Id, [number, number]>; tall: boolean };
/** Station centres on a wide 1200 × 560 canvas, left to right. */
const WIDE: Layout["at"] = {
  invoice: [110, 290],
  entryA: [370, 150],
  entryB: [370, 420],
  board: [640, 150],
  lookup: [640, 420],
  same: [905, 420],
  refuse: [1100, 240],
  proof: [1100, 445],
};
/** The same flow top to bottom on a 420 × 1290 canvas, for phones. */
const TALL: Layout["at"] = {
  invoice: [210, 100],
  entryA: [105, 360],
  entryB: [315, 360],
  board: [105, 620],
  lookup: [315, 620],
  same: [210, 900],
  refuse: [105, 1170],
  proof: [315, 1170],
};
const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: { box: [1200, 560], at: WIDE, tall: false },
  tall: { box: [420, 1290], at: TALL, tall: true },
};
const IDS = Object.keys(WIDE) as Id[];
const W = 80; // half width of a station's drawing
const WIRES: { from: Id; to: Id; reads?: boolean }[] = [
  { from: "invoice", to: "entryA" },
  { from: "invoice", to: "entryB" },
  { from: "entryA", to: "board" },
  { from: "board", to: "lookup", reads: true },
  { from: "entryB", to: "lookup" },
  { from: "lookup", to: "same" },
  { from: "same", to: "refuse" },
  { from: "same", to: "proof" },
];

const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64len = (b64: string) => Math.floor((b64.length * 3) / 4);


const wirePath = (w: (typeof WIRES)[number], L: Layout) => {
  const [ax, ay] = L.at[w.from];
  const [bx, by] = L.at[w.to];
  if (!L.tall) return w.reads ? `M${ax} ${ay + 112} L${bx} ${by - 80}` : `M${ax + W + 4} ${ay} C${ax + W + 70} ${ay}, ${bx - W - 70} ${by}, ${bx - W - 4} ${by}`;
  if (w.reads) return `M${ax + W + 2} ${ay - 8} L${bx - W - 2} ${by - 8}`;
  return `M${ax} ${ay + 112} C${ax} ${ay + 170}, ${bx} ${by - 150}, ${bx} ${by - 84}`;
};
const tallQuery = () => matchMedia("(max-width: 700px)");

type Said = { key: string; params?: Record<string, string | number> } | { text: string };
type StState = "idle" | "run" | "done" | "stop";
const DOTS = "········";
const BLANK = {
  invN: DOTS,
  slipA: DOTS,
  slipB: DOTS,
  ourRow: "",
  look: DOTS,
  n1: DOTS,
  n2: DOTS,
  c1: "····",
  c2: "····",
};
type Proof = { n: string; key: Said; a: Said; b: Said; size: Said; verdict: Said | null };
const NO_PROOF: Proof = { n: "—", key: { text: "—" }, a: { text: "—" }, b: { text: "—" }, size: { text: "—" }, verdict: null };

export function Twice({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const say = (s: Said | null) => (s === null ? "" : "text" in s ? s.text : t(s.key, s.params));
  const [tall, setTall] = useState(() => tallQuery().matches);
  const [st, setSt] = useState<Record<Id, StState>>(() => Object.fromEntries(IDS.map((id) => [id, "idle"])) as Record<Id, StState>);
  const [outs, setOuts] = useState<Partial<Record<Id, Said>>>({});
  const [txt, setTxt] = useState(BLANK);
  const [live, setLive] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState({ registered: false, caught: false, proven: false });
  const [log, setLog] = useState<{ id: Id; ms: number }[]>([]);
  const [proof, setProof] = useState<Proof>(NO_PROOF);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Said>({ key: "tw.idle" });
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const art = useRef<SVGSVGElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const draws = useRef<Partial<Record<Id, SVGGElement | null>>>({});
  const paths = useRef<Record<string, SVGPathElement | null>>({});
  const dots = useRef<Record<string, (SVGCircleElement | null)[]>>({});
  const shutter = useRef<SVGRectElement>(null);
  const stampG = useRef<SVGGElement>(null);
  const proofEl = useRef<HTMLElement>(null);
  const running = useRef(false);
  const ran = useRef(false);

  const L = LAYOUTS[tall ? "tall" : "wide"];
  const wkey = (w: { from: Id; to: Id }) => `${w.from}-${w.to}`;

  useEffect(() => {
    const q = tallQuery();
    const on = () => setTall(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  // ---------- running ----------
  const keys = async () => ({
    supplier: await labelKey("TES-landing-supplier"),
    master: await labelKey("TES-landing-buyer-master"),
    finA: await labelKey("TES-landing-financier-a"),
    finB: await labelKey("TES-landing-financier-b"),
    saltA: await labelKey("TES-landing-salt-a"),
    saltB: await labelKey("TES-landing-salt-b"),
  });

  const flow = (from: Id, to: Id) =>
    new Promise<void>((done) => {
      const k = wkey({ from, to });
      setLive((s) => new Set(s).add(k));
      if (reduced) return done();
      const path = paths.current[k]!;
      const len = path.getTotalLength();
      const ds = dots.current[k];
      let left = ds.length;
      ds.forEach((c, i) => {
        const q = { t: 0 };
        animate(q, {
          t: 1,
          duration: dur.enter + 250,
          delay: sibling(i),
          ease: fn(ease.softInOut),
          onUpdate: () => {
            const pt = path.getPointAtLength(len * q.t);
            c!.setAttribute("cx", pt.x.toFixed(1));
            c!.setAttribute("cy", pt.y.toFixed(1));
            c!.setAttribute("opacity", q.t < 0.97 ? "1" : "0");
          },
          onComplete: () => --left === 0 && done(),
        });
      });
    });

  const mark = (id: Id, state: StState) => {
    setSt((s) => ({ ...s, [id]: state }));
    if ((state === "done" || state === "stop") && !reduced) animate(draws.current[id]!, { scale: [1, 1.05, 1], duration: dur.seal + dur.press, ease: fn(ease.snapSettle) });
  };
  /** One station: running, the real call (timed), its result, done. */
  const run = async <T,>(id: Id, work: () => T, show: (r: T) => void, stop = false): Promise<T> => {
    mark(id, "run");
    if (!reduced) await sleep(300);
    const t0 = performance.now();
    const r = work();
    const ms = performance.now() - t0;
    show(r);
    mark(id, stop ? "stop" : "done");
    setLog((l) => [...l, { id, ms }]);
    return r;
  };
  const out = (id: Id, s: Said) => setOuts((o) => ({ ...o, [id]: s }));
  const text = (patch: Partial<typeof BLANK>) => setTxt((x) => ({ ...x, ...patch }));

  const reset = () => {
    setSt(Object.fromEntries(IDS.map((id) => [id, "idle"])) as Record<Id, StState>);
    setOuts({});
    setLive(new Set());
    setLog([]);
    setTxt(BLANK);
    setFlags({ registered: false, caught: false, proven: false });
    shutter.current!.setAttribute("height", "0");
    stampG.current!.setAttribute("opacity", "0");
    setShown(false);
    setProof(NO_PROOF);
  };

  const execute = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    reset();
    setStatus({ key: "tw.running" });
    try {
      const w = await loadWasm();
      const k = await keys();
      let n8 = "";
      const inv = await run("invoice", () => w.invoiceEncode(JSON.stringify(INVOICE)), (c) => {
        const n = w.invoiceNullifier(c);
        n8 = n.slice(0, 8);
        text({ invN: n8 });
        out("invoice", { text: short(n) });
      });
      await Promise.all([flow("invoice", "entryA"), flow("invoice", "entryB")]);
      type Entry = { memo: string; commitment: string };
      const a = await run("entryA", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finA), k.saltA)) as Entry, (r) => {
        text({ slipA: n8 });
        out("entryA", { text: `→ ${short(r.commitment)}` });
      });
      const b = await run("entryB", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finB), k.saltB)) as Entry, (r) => {
        text({ slipB: n8 });
        out("entryB", { text: `→ ${short(r.commitment)}` });
      });
      await flow("entryA", "board");
      type Seen = { nullifier: string; financier_commitment: string };
      const onBoard = await run("board", () => JSON.parse(w.boardMemoDescribe(a.memo)) as Seen, (d) => {
        text({ ourRow: `${d.nullifier.slice(0, 8)}…` });
        setFlags((f) => ({ ...f, registered: true }));
        out("board", { key: "tw.registered" });
      });
      await Promise.all([flow("board", "lookup"), flow("entryB", "lookup")]);
      const seen = await run("lookup", () => JSON.parse(w.boardMemoDescribe(b.memo)) as Seen, (d) => {
        text({ look: `${d.nullifier.slice(0, 8)}…` });
        out("lookup", { key: d.nullifier === onBoard.nullifier ? "tw.found" : "tw.notFound" });
      });
      await flow("lookup", "same");
      const caught = await run("same", () => seen.nullifier === onBoard.nullifier && seen.financier_commitment !== onBoard.financier_commitment, () => {
        text({ n1: onBoard.nullifier.slice(0, 8), n2: seen.nullifier.slice(0, 8), c1: onBoard.financier_commitment.slice(0, 6), c2: seen.financier_commitment.slice(0, 6) });
        setFlags((f) => ({ ...f, caught: true }));
        out("same", { key: "tw.again" });
      });
      if (!caught) throw new Error("the two entries do not collide");
      await Promise.all([flow("same", "refuse"), flow("same", "proof")]);
      await run(
        "refuse",
        () => true,
        () => {
          out("refuse", { key: "tw.refused" });
          if (reduced) {
            shutter.current!.setAttribute("height", "52");
            stampG.current!.setAttribute("opacity", "1");
            return;
          }
          const sh = { h: 0 };
          animate(sh, { h: 52, duration: dur.seal, ease: fn(ease.snapSettle), onUpdate: () => shutter.current!.setAttribute("height", sh.h.toFixed(1)) });
          animate(stampG.current!, { opacity: { from: 0, to: 1 }, scale: { from: 1.7, to: 1 }, duration: dur.proof, delay: 200, ease: fn(ease.popOver) });
        },
        true,
      );
      const sig = w.buyerSignInvoice(k.master, 7, inv);
      const pf = await run("proof", () => w.doubleSignProof(inv, sig, a.memo, b.memo), (x) => out("proof", { text: `JTSP · ${b64len(x)} B ✓` }));
      const r = JSON.parse(w.verifyProof(pf));
      setProof({
        n: short(r.nullifier),
        key: { key: "tw.p.supplier", params: { k: short(r.supplier_pk) } },
        a: { key: "tw.p.commit", params: { k: short(r.first_commitment) } },
        b: { key: "tw.p.commit", params: { k: short(r.second_commitment) } },
        size: { key: "tw.p.sizeVal", params: { n: b64len(pf) } },
        verdict: { key: "tw.p.verdict" },
      });
      setShown(true);
      setFlags((f) => ({ ...f, proven: true }));
      if (!reduced) animate(proofEl.current!, { y: { from: 50, to: 0 }, rotate: { from: 6, to: -1.2 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 300, ease: fn(ease.softLand) });
      setStatus({ key: "tw.done" });
    } catch (e) {
      setStatus({ key: "tw.stopped", params: { msg: (e as Error).message } });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  // warm the wasm as the chapter nears; run the flow the first time it is in view
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
    const stop = inView(
      art.current!,
      () => {
        if (!reduced) {
          setWaiting(false);
          heads.current.forEach((x, i) =>
            animate(x!, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
          );
          animate(art.current!, { opacity: { from: 0, to: 1 }, y: { from: 20, to: 0 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
        }
        if (!ran.current) {
          ran.current = true;
          setTimeout(() => void execute(), reduced ? 0 : 700);
        }
      },
      { amount: 0.2 },
    );
    return () => {
      io.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- the stations ----------
  const mono = (x: number, y: number, s: string, cls = "tw-mono-s") => (
    <text x={x} y={y} className={cls}>
      {s}
    </text>
  );
  const slip = (who: "A" | "B", n: string) => (
    <>
      <path d="M-70 -40 H70 V40 H-70 V10 a10 10 0 0 0 0 -20 Z" className="tw-paper" />
      {mono(-52, -16, "N")}
      <path d="M-52 24 c8 -14 14 10 22 -2 s10 -12 16 0 s8 6 14 -4" className="tw-sign" />
      {mono(-38, -16, n)}
      <text x={-52} y={4} className="tw-slip-to">
        {t("tw.toFin", { x: who })}
      </text>
      <text x={52} y={-14} textAnchor="middle" className="tw-slip-mark">
        {who}
      </text>
    </>
  );
  const drawings: Record<Id, ReactNode> = {
    // the sealed invoice: a sheet, ruled lines, the buyer's seal, its N
    invoice: (
      <>
        <rect x={-46} y={-66} width={92} height={118} className="tw-paper" />
        <path d="M-34 -50 H8 M-34 -38 H26 M-34 -26 H18 M-34 -14 H30" className="tw-rule" />
        <circle cx={18} cy={24} r={15} className="tw-seal" />
        <circle cx={18} cy={24} r={11} className="tw-seal-fine" />
        <text x={18} y={29} textAnchor="middle" className="tw-seal-kanji">
          印
        </text>
        {mono(-34, 4, "N")}
        {mono(-22, 4, txt.invN)}
      </>
    ),
    // an entry slip: a ticket with a notched edge, N, who it is for, the supplier's signature
    entryA: slip("A", txt.slipA),
    entryB: slip("B", txt.slipB),
    // the public board: a panel of fingerprints, our row empty until A's entry lands
    board: (
      <>
        <rect x={-72} y={-70} width={144} height={120} className="tw-board" />
        <text x={-60} y={-50} className="tw-board-title">
          登記簿
        </text>
        {["2eca708e…", "43a49aba…", "f1f00264…"].map((r, i) => [
          <rect key={`r${i}`} x={-60} y={-38 + i * 19} width={120} height={15} className="tw-row" />,
          <text key={`t${i}`} x={-52} y={-27 + i * 19} className="tw-mono-xs">
            {r}
          </text>,
        ])}
        <rect x={-60} y={20} width={120} height={18} className="tw-row is-ours" />
        {mono(-52, 33, txt.ourRow, "tw-mono-s is-ours")}
      </>
    ),
    // the lookup: a row of the board under a magnifying glass
    lookup: (
      <>
        <rect x={-66} y={-12} width={112} height={24} className="tw-row is-look" />
        {mono(-54, 4, txt.look)}
        <circle cx={34} cy={-10} r={24} className="tw-lens" />
        <path d="M52 8 L68 26" className="tw-lens-handle" />
      </>
    ),
    // the comparison: N against N (equal), commitment against commitment (different)
    same: (
      <>
        <path d="M-74 -40 H74 M-74 0 H74 M-74 40 H74" className="tw-rule" />
        <text x={-74} y={-28} className="tw-cmp-key">
          {t("tw.k.n")}
        </text>
        <text x={-74} y={12} className="tw-cmp-key">
          {t("tw.k.c")}
        </text>
        <text x={0} y={-9} textAnchor="middle" className="tw-eq">
          =
        </text>
        <text x={0} y={31} textAnchor="middle" className="tw-neq">
          ≠
        </text>
        <text x={-10} y={-10} textAnchor="end" className="tw-mono-s">
          {txt.n1}
        </text>
        {mono(10, -10, txt.n2)}
        <text x={-10} y={30} textAnchor="end" className="tw-mono-s">
          {txt.c1}
        </text>
        {mono(10, 30, txt.c2)}
      </>
    ),
    // the refusal: a bank with its shutter, and the stamp that lands on it
    refuse: (
      <>
        <path d="M-62 -36 L0 -66 L62 -36 Z" className="tw-roof" />
        <rect x={-56} y={-36} width={112} height={82} className="tw-wall" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={-48 + i * 22} y={-28} width={8} height={66} className="tw-col" />
        ))}
        <rect x={-28} y={-14} width={56} height={52} className="tw-doorway" />
        <rect x={-28} y={-14} width={56} height={0} className="tw-shutter" ref={shutter} />
        <rect x={-64} y={46} width={128} height={8} className="tw-step" />
        <g transform="translate(0 4) rotate(-10)">
          <g className="tw-stamp" opacity={0} ref={stampG}>
            <rect x={-52} y={-20} width={104} height={40} className="tw-stamp-box" />
            <text x={0} y={-1} textAnchor="middle" className="tw-stamp-jp">
              拒否
            </text>
            <text x={0} y={14} textAnchor="middle" className="tw-stamp-en">
              REFUSED
            </text>
          </g>
        </g>
      </>
    ),
    // the proof: a document with a check
    proof: (
      <>
        <rect x={-44} y={-64} width={88} height={114} className="tw-paper" />
        <path d="M-32 -48 H22 M-32 -36 H30 M-32 -24 H14 M-32 -12 H26 M-32 0 H20" className="tw-rule" />
        <circle cx={16} cy={26} r={15} className="tw-ok" />
        <path d="M8 26 L14 32 L25 19" className="tw-ok-tick" />
      </>
    ),
  };

  const flagCls = `${flags.registered ? " is-registered" : ""}${flags.caught ? " is-caught" : ""}${flags.proven ? " is-proven" : ""}`;
  const prow = (k: string, v: string) => [<dt key={`k${k}`}>{t(k)}</dt>, <dd key={`v${k}`} className="data">{v}</dd>];

  return (
    <section className={`chapter tw-chapter${waiting ? " is-waiting" : ""}${flagCls}`} id="pressed-twice" aria-labelledby="tw-title" ref={sec}>
      {/* a wide frame: the title over the flow, the log and the proof under it */}
      <header className="tw-head">
        <div className="tw-head-title">
          <p className="chapter-kanji" ref={(e) => void (heads.current[0] = e)}>
            {t("tw.kanji")}
          </p>
          <h2 className="chapter-title" id="tw-title" ref={(e) => void (heads.current[1] = e)}>
            {t("tw.title")}
          </h2>
        </div>
        <div className="tw-head-text">
          <p className="chapter-lede" ref={(e) => void (heads.current[2] = e)}>
            {t("tw.lede")}
          </p>
          <p className="chapter-note" ref={(e) => void (heads.current[3] = e)}>
            {t("tw.note")}
          </p>
        </div>
      </header>
      {/* the flow: wide on a desk, tall on a phone; the stations move, the wires are redrawn */}
      <div className="tw-stage">
        <svg className="tw-flowart" role="img" viewBox={`0 0 ${L.box[0]} ${L.box[1]}`} ref={art}>
          <title>{t("tw.lede")}</title>
          {/* wires, under the stations */}
          <g>
            {WIRES.map((w) => {
              const k = wkey(w);
              return [
                <path key={k} className={`tw-wire${w.reads ? " is-read" : ""}${live.has(k) ? " is-live" : ""}`} d={wirePath(w, L)} ref={(e) => void (paths.current[k] = e)} />,
                ...[0, 1, 2].map((i) => (
                  <circle key={`${k}${i}`} r={4.5} className="tw-flowdot" cx={-20} cy={-20} opacity={0} ref={(e) => void ((dots.current[k] ??= [])[i] = e)} />
                )),
              ];
            })}
          </g>
          {IDS.map((id) => (
            <g key={id} className={`tw-st tw-st-${id}${st[id] === "idle" ? "" : ` is-${st[id]}`}`} transform={`translate(${L.at[id][0]} ${L.at[id][1]})`}>
              <rect x={-W - 14} y={-78} width={2 * W + 28} height={132} rx={22} className="tw-halo" />
              <g className="tw-draw" ref={(e) => void (draws.current[id] = e)}>
                {drawings[id]}
              </g>
              <text x={0} y={78} textAnchor="middle" className="tw-st-label">
                {t(`tw.st.${id}`)}
              </text>
              <text x={0} y={100} textAnchor="middle" className="tw-st-out">
                {say(outs[id] ?? null)}
              </text>
              <g className="tw-check" transform={`translate(${W + 4} -64)`}>
                <circle r={12} className="tw-check-dot" />
                <path d="M-5 0 L-1 4 L6 -4" className="tw-check-tick" />
              </g>
            </g>
          ))}
        </svg>
      </div>
      {/* under the flow: the log and the proof */}
      <div className="tw-below">
        <div className="tw-log-wrap">
          <div className="tw-log-head">
            <button className="seal-btn tw-exec" type="button" disabled={busy} onClick={() => void execute()}>
              <span className="seal-btn-label">{t("tw.run")}</span>
            </button>
            <span className="tw-run-status" role="status" aria-live="polite">
              {say(status)}
            </span>
          </div>
          <ol className="tw-log">
            {log.map((l, i) => (
              <li
                key={i}
                className="tw-log-line"
                ref={(e) => {
                  if (e && !reduced && !e.dataset.in) {
                    e.dataset.in = "1";
                    animate(e, { opacity: { from: 0, to: 1 }, x: { from: -8, to: 0 }, duration: dur.enter, ease: fn(ease.softLand) });
                  }
                }}
              >
                <span className="tw-log-st">{t(`tw.st.${l.id}`)}</span>
                <span className="tw-log-text">{t(`tw.log.${l.id}`)}</span>
                <span className="tw-log-ms data">{`${l.ms.toFixed(1)} ms`}</span>
              </li>
            ))}
          </ol>
        </div>
        <article className={`tw-proof${shown ? " is-shown" : ""}`} ref={proofEl}>
          <div className="tw-proof-head">
            <span className="tw-proof-title">{t("tw.proof")}</span>
            <span className="tw-proof-kanji">二重署名証明</span>
          </div>
          <dl className="tw-proof-rows">
            {prow("tw.p.n", proof.n)}
            {prow("tw.p.by", say(proof.key))}
            {prow("tw.p.a", say(proof.a))}
            {prow("tw.p.b", say(proof.b))}
            {prow("tw.p.size", say(proof.size))}
          </dl>
          <p className="tw-verdict">{say(proof.verdict)}</p>
        </article>
      </div>
    </section>
  );
}
