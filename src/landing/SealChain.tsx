// Chapter 3, "Three seals, then the money moves" (Sign-to-Pay). The assignment letter of the
// hero's invoice carries three seal slots: supplier, buyer, financier. Each press makes a real
// Ed25519 seal with jitsuin-wasm (test keys from TES- labels), over the seals before it; each
// lifts one latch of the Sign-to-Pay gate, and the third opens it so the advance rolls into the
// shielded pool. "Change one zat" re-checks the sealed letter against an edited invoice: the
// seals break, the gate falls shut. Nothing leaves the page.
// React since HNK-31.T4: the chain is state. HNK-33.T2: the visual is the
// seal desk, an isometric figure (figures/seal-desk.svg, built by
// scripts/figures/seal-desk.build.mjs) moved by figures/seal-desk.ts; a press on a seal in the
// figure goes through the same handler as the button.
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
/** Keys of the texts and aria labels drawn inside the seal desk. */
const FIG_KEYS = ["sc.fig.aria", "sc.fig.pool", "sc.fig.supplier", "sc.fig.buyer", "sc.fig.financier", "sc.press.supplier", "sc.press.buyer", "sc.press.financier"];
const b64hex = (b64: string, from: number, len: number) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return [...bin.slice(from, from + len)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
};


type Said = { key: string; params?: Record<string, string | number> };

export function SealChain({ reduced }: { reduced: boolean }): ReactNode {
  const t = useT();
  const lang = getLang();
  const [count, setCount] = useState(0);
  // the button names the next seal once the press is over, as before
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canTamper, setCanTamper] = useState(false);
  const [status, setStatus] = useState<Said>({ key: "sc.wait.supplier" });
  const [bytes, setBytes] = useState<(string | null)[]>([null, null, null]);
  const [waiting, setWaiting] = useState(!reduced);

  const sec = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLElement | null)[]>([]);
  const deskHost = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  // the figure: its chunks load as the chapter comes near, then it is inserted and moved by its controller
  const { fig: desk, ready } = useFigure(
    sec,
    deskHost,
    reduced,
    () => Promise.all([import("./figures/seal-desk.svg?raw"), import("./figures/seal-desk")]),
    (svg, m) => m.mountSealDesk(svg, { reduced, onPress: (i) => onPress.current(i) }),
    () => labels(),
  );

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

  // the seal's value shows in the caption list; the desk presses the hanko onto the letter
  const stampDown = async (i: number, seal: string) => {
    setBytes((b) => b.map((x, j) => (j === i ? b64hex(seal, 136, 4) : x)));
    setCount(i + 1);
    await desk.current?.stamp(i);
  };

  // the gate opens and the advance rolls into the shielded pool
  const release = () => {
    setOpen(true);
    desk.current?.open();
  };

  const pressNext = async () => {
    const c = chain.current;
    if (busyRef.current || c.broken || c.seals.length >= 3) return;
    busyRef.current = true;
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
      busyRef.current = false;
      setBusy(false);
    }
  };

  // a press on a seal in the figure: only the next one in the order seals; another one shakes
  const pressAt = (i: number) => {
    takeOver();
    const c = chain.current;
    if (busyRef.current || c.broken || c.seals.length >= 3 || i < c.seals.length) return;
    if (i !== c.seals.length) {
      desk.current?.shake(i);
      setStatus({ key: `sc.wait.${ROLES[c.seals.length].role}` });
      return;
    }
    void pressNext();
  };
  const onPress = useRef(pressAt);
  onPress.current = pressAt;

  const breakSeals = async () => {
    takeOver();
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
    setOpen(false); // no advance on a letter whose seals broke
    setStatus({ key: "sc.broken", params: { msg } });
    setCanTamper(false);
    desk.current?.breakSeals();
  };

  // The chain plays by itself and loops while the chapter is in view (user, 2026-10-25: nobody has
  // to click); each round is still three real seals from jitsuin-wasm, in order. The first press, key
  // or control from the visitor stops the loop for good and hands the desk over. Reduced motion
  // plays one round, straight to the end state.
  const user = useRef(false);
  const visible = useRef(false);
  const looping = useRef(false);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const takeOver = () => {
    user.current = true;
  };
  const resetChain = () => {
    const c = chain.current;
    c.seals.length = 0;
    c.broken = false;
    setBroken(false);
    setOpen(false);
    setCount(0);
    setBytes([null, null, null]);
    desk.current?.reset();
    setStatus({ key: "sc.wait.supplier" });
    setCanTamper(false);
  };
  const playRound = async (stop: () => boolean) => {
    await ready();
    for (let i = chain.current.seals.length; i < 3 && !chain.current.broken && !stop(); i++) {
      await pressNext();
      if (!reduced) await wait(450);
    }
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
        if (chain.current.seals.length >= 3 || chain.current.broken) {
          await wait(3200); // hold the paid state, then the next round
          if (user.current) break;
          resetChain();
          await wait(700);
        }
        await playRound(() => user.current);
      }
    } finally {
      looping.current = false;
    }
  };

  const startOver = () => {
    takeOver();
    resetChain();
    setTimeout(() => void playRound(() => false), reduced ? 0 : 600); // one round, no loop
  };

  // its small labels follow EN/中文 (set again on each mount: the figure may arrive after a switch)
  const labels = () => desk.current?.setLabels(Object.fromEntries(FIG_KEYS.map((k) => [k, t(k)])));
  useEffect(() => {
    labels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, reduced, t]);

  // wasm and keys warm up as the chapter comes near; the scene enters when it is in view
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          void setup();
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
            animate(deskHost.current!, { y: { from: 24, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
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

  const row = (k: string, v: ReactNode, data = true, cls = "") => [
    <dt key={`k${k}`}>{t(k)}</dt>,
    <dd key={`v${k}`} className={[data ? "data" : "", cls].filter(Boolean).join(" ") || undefined}>
      {v}
    </dd>,
  ];

  return (
    <section className={`chapter sc-chapter${waiting ? " is-waiting" : ""}${broken ? " is-broken" : ""}${open ? " is-open" : ""}`} id="seal-chain" aria-labelledby="sc-title" ref={sec}>
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
        {/* the seal desk: letter, hanko rack, the Sign-to-Pay gate and the shielded pool */}
        <div className="sc-desk" ref={deskHost} />
        <div className="sc-readout" ref={readout}>
          {/* the letter the seals cover */}
          <div className="sc-letter" role="group" aria-label={t("sc.aria")}>
            <p className="sc-head">
              <span className="sc-title">{t("sc.letter")}</span>
              <span className="sc-kanji">譲渡通知</span>
            </p>
            <dl className="sc-rows">
              {row("doc.invoice", INVOICE.invoice_id)}
              {row("doc.fingerprint", short(N))}
              {row("doc.amount", broken ? "0.00040001 ZEC" : "0.0004 ZEC", false, broken ? "is-edited" : "")}
              {row("doc.due", t("sc.dueVal"), false)}
              {row("doc.payTo", PAY_TO)}
            </dl>
          </div>
          {/* the chain: each seal's real value, the advance, what the chain says */}
          <div className="sc-chain">
            <ol className="sc-seals">
              {ROLES.map((r, i) => (
                <li key={r.role} className={`sc-seal-row${count > i ? " is-sealed" : ""}`}>
                  <span className="sc-seal-mark" aria-hidden="true">
                    {r.kanji}
                  </span>
                  <span className="sc-seal-name">{t(`doc.${r.role}`)}</span>
                  <span className="sc-seal-bytes data">{bytes[i] === null ? t("sc.unsealed") : t("sc.seal", { b: bytes[i]! })}</span>
                </li>
              ))}
            </ol>
            <p className="sc-advance" hidden={!open}>
              <span className="sc-advance-name">{t("doc.supplier")}</span>
              <span className="sc-advance-amt data">{t("sc.advance")}</span>
            </p>
            <p className="sc-status" role="status" aria-live="polite">
              {t(status.key, status.params)}
            </p>
          </div>
          <div className="sc-controls">
            <button className="ink-link sc-tamper" type="button" disabled={!canTamper || busy} onClick={() => void breakSeals()}>
              {t("sc.tamper")}
            </button>
            <button className="ink-link sc-reset" type="button" onClick={startOver}>
              {t("sc.reset")}
            </button>
            <p className="sc-hint">{t("sc.fig.hint")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
