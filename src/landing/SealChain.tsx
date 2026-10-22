// Chapter 3, "Three seals, then the money moves" (Sign-to-Pay). The assignment letter of the
// hero's invoice carries three seal slots: supplier, buyer, financier. Each press makes a real
// Ed25519 seal with jitsuin-wasm (test keys from TES- labels), over the seals before it; each
// lifts one pin of the Sign-to-Pay lock, and the third opens it so the advance flows to the
// supplier. "Change one zat" re-checks the sealed letter against an edited invoice: the seals
// break, the lock falls shut. Nothing leaves the page.
// React since HNK-31.T4: the seals, pins, links and the gate are state; the motion and the inline
// opacities the old code set by hand stay on refs.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, svg as animeSvg } from "animejs";
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
const N = "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5";
const PAY_TO = "utest1landingfinanciera";
const BUYER_INDEX = 7;

type Role = "supplier" | "buyer" | "financier";
const ROLES: { role: Role; kanji: string; name: string }[] = [
  { role: "supplier", kanji: "売", name: "Supplier" },
  { role: "buyer", kanji: "買", name: "Buyer" },
  { role: "financier", kanji: "融", name: "Financier" },
];

const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
/** A round seal with one kanji. */
function SealSvg({ kanji, cls, refEl }: { kanji: string; cls: string; refEl?: (e: SVGSVGElement | null) => void }): ReactNode {
  return (
    <svg viewBox="0 0 100 100" className={cls} aria-hidden="true" ref={refEl}>
      <circle cx={50} cy={50} r={44} className="sc-seal-ring" />
      <circle cx={50} cy={50} r={36} className="sc-seal-fine" />
      <text x={50} y={66} textAnchor="middle" className="sc-seal-kanji">
        {kanji}
      </text>
    </svg>
  );
}
const b64hex = (b64: string, from: number, len: number) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return [...bin.slice(from, from + len)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
};


type Said = { key: string; params?: Record<string, string | number> };

export function SealChain({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const [count, setCount] = useState(0);
  // the button names the next seal once the press is over, as before
  const [pressed, setPressed] = useState(0);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canTamper, setCanTamper] = useState(false);
  const [status, setStatus] = useState<Said>({ key: "sc.wait.supplier" });
  const [bytes, setBytes] = useState<(string | null)[]>([null, null, null]);
  const [pinsUp, setPinsUp] = useState([false, false, false]);
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const letter = useRef<HTMLElement>(null);
  const gate = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const imps = useRef<(SVGSVGElement | null)[]>([]);
  const stamps = useRef<(SVGSVGElement | null)[]>([]);
  const cracks = useRef<(SVGSVGElement | null)[]>([]);
  const pins = useRef<(SVGGElement | null)[]>([]);
  const linkPaths = useRef<(SVGPathElement | null)[]>([]);
  const shackle = useRef<SVGPathElement>(null);
  const flowPath = useRef<SVGPathElement>(null);
  const coins = useRef<(SVGCircleElement | null)[]>([]);
  const wallet = useRef<HTMLDivElement>(null);

  // ---------- the chain, for real ----------
  const chain = useRef({ invCode: "", letterCode: "", seals: [] as string[], keys: null as { supplier: string; master: string; financier: string } | null, broken: false });

  const setup = async () => {
    const c = chain.current;
    const w = await loadWasm();
    c.keys ??= {
      supplier: await labelKey("TES-landing-supplier"),
      master: await labelKey("TES-landing-buyer-master"),
      financier: await labelKey("TES-landing-financier-a"),
    };
    if (!c.invCode) {
      c.invCode = w.invoiceEncode(JSON.stringify(INVOICE));
      const financierPk = w.publicKey(c.keys.financier);
      const terms = await labelKey("TES-INV-0007 assignment terms");
      c.letterCode = w.assignmentEncode(c.invCode, financierPk, PAY_TO, terms);
    }
    return { w, k: c.keys };
  };

  const friendly = (st: string) => (st === "Sealed" ? "sc.sealed" : `sc.wait.${ROLES.find((r) => st.endsWith(r.name))?.role ?? "financier"}`);

  const stampDown = (i: number, seal: string) =>
    new Promise<void>((done) => {
      setBytes((b) => b.map((x, j) => (j === i ? b64hex(seal, 136, 4) : x)));
      setPinsUp((p) => p.map((x, j) => x || j === i));
      setCount(i + 1);
      if (reduced) {
        imps.current[i]!.style.opacity = "1";
        return done();
      }
      const stamp = stamps.current[i]!;
      animate(stamp, { scale: { from: 2.6, to: 1 }, y: { from: -60, to: 0 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(8px)", to: "blur(0px)" }, duration: dur.seal, ease: fn(ease.snapSettle) });
      animate(stamp, { scaleY: [1, 0.9, 1], scaleX: [1, 1.04, 1], duration: dur.press * 2, delay: dur.seal, ease: "linear" });
      animate(stamp, { opacity: { to: 0 }, y: { to: -30 }, duration: dur.exit, delay: dur.seal + dur.press * 2, ease: fn(ease.accelExit) });
      animate(imps.current[i]!, { opacity: { from: 0, to: 1 }, scale: { from: 0.86, to: 1 }, duration: dur.bleed, delay: dur.seal, ease: "linear" });
      animate(pins.current[i]!, { y: { from: 0, to: -26 }, duration: dur.seal, delay: dur.seal + 100, ease: fn(ease.snapSettle) });
      if (i > 0) {
        const [d] = animeSvg.createDrawable(linkPaths.current[i - 1]!);
        animate(d, { draw: ["0 0", "0 1"], duration: dur.enter, delay: dur.seal, ease: fn(ease.softInOut) });
      }
      setTimeout(done, dur.seal + 200);
    });

  const release = () => {
    setOpen(true);
    if (reduced) {
      wallet.current!.style.opacity = "1";
      return;
    }
    animate(shackle.current!, { y: { from: 0, to: -22 }, duration: dur.seal, ease: fn(ease.snapSettle) });
    const path = flowPath.current!;
    const len = path.getTotalLength();
    coins.current.forEach((c, i) => {
      const q = { t: 0 };
      animate(q, {
        t: 1,
        duration: dur.sink,
        delay: 300 + sibling(i),
        ease: fn(ease.softInOut),
        onUpdate: () => {
          const pt = path.getPointAtLength(len * q.t);
          c!.setAttribute("cx", pt.x.toFixed(1));
          c!.setAttribute("cy", pt.y.toFixed(1));
          c!.setAttribute("opacity", q.t < 0.98 ? "1" : "0");
        },
      });
    });
    animate(wallet.current!, { opacity: { from: 0, to: 1 }, y: { from: 10, to: 0 }, duration: dur.enter, delay: 300 + dur.sink, ease: fn(ease.softLand) });
  };

  const pressNext = async () => {
    const c = chain.current;
    if (c.broken || c.seals.length >= 3) return;
    setBusy(true);
    try {
      const { w, k } = await setup();
      const i = c.seals.length;
      const seal =
        i === 0
          ? w.supplierSealAssignment(k.supplier, c.invCode, c.letterCode)
          : i === 1
            ? w.buyerSealAssignment(k.master, BUYER_INDEX, c.invCode, c.letterCode, c.seals[0])
            : w.financierSealAssignment(k.financier, c.invCode, c.letterCode, JSON.stringify(c.seals));
      c.seals.push(seal);
      const st = w.assignmentStatus(c.invCode, c.letterCode, JSON.stringify(c.seals));
      await stampDown(i, seal);
      setStatus({ key: friendly(st) });
      if (st === "Sealed") release();
      setCanTamper(true);
    } catch (e) {
      setStatus({ key: "sc.refused", params: { msg: (e as Error).message } });
    } finally {
      setBusy(false);
      setPressed(c.seals.length);
    }
  };

  const breakSeals = async () => {
    const c = chain.current;
    if (!c.seals.length || c.broken) return;
    const { w } = await setup();
    const edited = w.invoiceEncode(JSON.stringify({ ...INVOICE, amount_zat: INVOICE.amount_zat + 1 }));
    let msg = "";
    try {
      w.assignmentStatus(edited, c.letterCode, JSON.stringify(c.seals));
      msg = "still valid";
    } catch (e) {
      msg = (e as Error).message;
    }
    c.broken = true;
    setBroken(true);
    setOpen(false);
    wallet.current!.style.opacity = "0"; // no advance on a letter whose seals broke
    setStatus({ key: "sc.broken", params: { msg } });
    setCanTamper(false);
    const n = c.seals.length;
    cracks.current.forEach((cr, i) => {
      if (i >= n || reduced) return;
      const [d] = animeSvg.createDrawable(cr!.querySelectorAll("path"));
      animate(d, { draw: ["0 0", "0 1"], duration: dur.proof, delay: i * 80, ease: fn(ease.snapSettle) });
    });
    setPinsUp([false, false, false]);
    pins.current.forEach((pin, i) => {
      if (!reduced && i < n) animate(pin!, { y: { to: 0 }, duration: dur.exit, delay: 200 + i * 67, ease: fn(ease.accelExit) });
    });
    if (!reduced) animate(shackle.current!, { y: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) });
  };

  const startOver = () => {
    const c = chain.current;
    c.seals.length = 0;
    c.broken = false;
    setBroken(false);
    setOpen(false);
    setCount(0);
    setPressed(0);
    setBytes([null, null, null]);
    imps.current.forEach((imp) => void (imp!.style.opacity = "0"));
    cracks.current.forEach((cr) => cr!.querySelectorAll("path").forEach((pth) => pth.removeAttribute("draw")));
    setPinsUp([false, false, false]);
    pins.current.forEach((pin) => void (pin!.style.transform = ""));
    shackle.current!.style.transform = "";
    wallet.current!.style.opacity = "0";
    setStatus({ key: "sc.wait.supplier" });
    setCanTamper(false);
  };

  // wasm and keys warm up as the chapter comes near; the scene enters when it is in view
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          void setup();
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
            animate(letter.current!, { y: { from: 24, to: 0 }, rotate: { from: 2, to: 0.6 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
            animate([gate.current!, controls.current!], { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: 400, ease: fn(ease.softLand) });
          },
          { amount: 0.25 },
        );
    return () => {
      io.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = ROLES[pressed];
  const row = (k: string, v: ReactNode, data = true, cls = "") => [
    <dt key={`k${k}`}>{t(k)}</dt>,
    <dd key={`v${k}`} className={[data ? "data" : "", cls].filter(Boolean).join(" ") || undefined}>
      {v}
    </dd>,
  ];

  return (
    <section className={`chapter sc-chapter${waiting ? " is-waiting" : ""}${broken ? " is-broken" : ""}`} id="seal-chain" aria-labelledby="sc-title" ref={sec}>
      <div className="chapter-cap">
        <p className="chapter-kanji" ref={(e) => void (heads.current[0] = e)}>
          {t("sc.kanji")}
        </p>
        <h2 className="chapter-title" id="sc-title" ref={(e) => void (heads.current[1] = e)}>
          {t("sc.title")}
        </h2>
        <p className="chapter-lede" ref={(e) => void (heads.current[2] = e)}>
          {t("sc.lede")}
        </p>
        <p className="chapter-note" ref={(e) => void (heads.current[3] = e)}>
          {t("sc.note")}
        </p>
      </div>
      <div className="sc-visual">
        {/* the letter */}
        <article className="sc-letter" aria-label={t("sc.aria")} ref={letter}>
          <div className="sc-head">
            <span className="sc-title">{t("sc.letter")}</span>
            <span className="sc-kanji">譲渡通知</span>
          </div>
          <dl className="sc-rows">
            {row("doc.invoice", INVOICE.invoice_id)}
            {row("doc.fingerprint", short(N))}
            {row("doc.amount", broken ? "0.00040001 ZEC" : "0.0004 ZEC", false, broken ? "is-edited" : "")}
            {row("doc.due", t("sc.dueVal"), false)}
            {row("doc.payTo", PAY_TO)}
          </dl>
          <div className="sc-slots">
            <svg className="sc-links" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
              {[0, 1].map((i) => (
                <path key={i} d={`M${50 + i * 100 + 22} 10 L${150 + i * 100 - 22} 10`} className={`sc-link${count > i + 1 ? " is-on" : ""}`} ref={(e) => void (linkPaths.current[i] = e)} />
              ))}
            </svg>
            {ROLES.map((r, i) => (
              <div key={r.role} className={`sc-slot${count > i ? " is-sealed" : ""}`}>
                <div className="sc-slot-ring">
                  <SealSvg kanji={r.kanji} cls="sc-impression" refEl={(e) => void (imps.current[i] = e)} />
                  <svg viewBox="0 0 100 100" className="sc-crack" aria-hidden="true" ref={(e) => void (cracks.current[i] = e)}>
                    <path d="M50 6 L45 30 L56 44 L43 62 L52 78 L47 96" />
                    <path d="M43 62 L24 70" />
                    <path d="M56 44 L76 38" />
                  </svg>
                  <SealSvg kanji={r.kanji} cls="sc-stamp" refEl={(e) => void (stamps.current[i] = e)} />
                </div>
                <span className="sc-slot-name">{t(`doc.${r.role}`)}</span>
                <span className="sc-slot-bytes data">{bytes[i] === null ? t("sc.unsealed") : t("sc.seal", { b: bytes[i]! })}</span>
              </div>
            ))}
          </div>
        </article>
        {/* the Sign-to-Pay lock and the advance */}
        <div className={`sc-gate${open ? " is-open" : ""}`} ref={gate}>
          <svg viewBox="0 0 220 260" className="sc-lock" aria-hidden="true">
            <path d="M62 112 V78 a48 48 0 0 1 96 0 V112" className="sc-shackle" ref={shackle} />
            <rect x={34} y={108} width={152} height={128} rx={14} className="sc-body" />
            {[0, 1, 2].map((i) => {
              const x = 74 + i * 36;
              return (
                <g key={i} className={`sc-pin${pinsUp[i] ? " is-up" : ""}`} ref={(e) => void (pins.current[i] = e)}>
                  <rect x={x - 7} y={150} width={14} height={42} rx={7} className="sc-pin-bar" />
                  <circle cx={x} cy={214} r={7} className="sc-pin-dot" />
                  <text x={x} y={140} textAnchor="middle" className="sc-pin-kanji">
                    {ROLES[i].kanji}
                  </text>
                </g>
              );
            })}
          </svg>
          <svg viewBox="0 0 220 120" className="sc-flow" aria-hidden="true">
            <path d="M110 0 C110 50, 30 40, 30 100" className="sc-flow-path" ref={flowPath} />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle key={i} r={6} className="sc-coin" cx={-20} cy={-20} ref={(e) => void (coins.current[i] = e)} />
            ))}
          </svg>
          <div className="sc-wallet" ref={wallet}>
            <span className="sc-wallet-name">{t("doc.supplier")}</span>
            <span className="sc-wallet-amt data">{t("sc.advance")}</span>
          </div>
          <p className="sc-status" role="status" aria-live="polite">
            {t(status.key, status.params)}
          </p>
        </div>
        <div className="sc-controls" ref={controls}>
          <button className="seal-btn sc-press" type="button" disabled={busy || count >= 3 || broken} onClick={() => void pressNext()}>
            <span className="seal-btn-label">{t(next ? `sc.press.${next.role}` : "sc.complete")}</span>
          </button>
          <button className="ink-link sc-tamper" type="button" disabled={!canTamper} onClick={() => void breakSeals()}>
            {t("sc.tamper")}
          </button>
          <button className="ink-link sc-reset" type="button" onClick={startOver}>
            {t("sc.reset")}
          </button>
        </div>
      </div>
    </section>
  );
}
