// Chapter 3, "Three seals, then the money moves" (Sign-to-Pay). The assignment letter of the
// hero's invoice carries three seal slots: supplier, buyer, financier. Each press makes a real
// Ed25519 seal with jitsuin-wasm (test keys from TES- labels), over the seals before it; each
// lifts one pin of the Sign-to-Pay lock, and the third opens it so the advance flows to the
// supplier. "Change one zat" re-checks the sealed letter against an edited invoice: the seals
// break, the lock falls shut. Nothing leaves the page.
import { animate, svg as animeSvg } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
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
const ROLES: { role: Role; kanji: string; name: string; who: string }[] = [
  { role: "supplier", kanji: "売", name: "Supplier", who: "the supplier" },
  { role: "buyer", kanji: "買", name: "Buyer", who: "the buyer" },
  { role: "financier", kanji: "融", name: "Financier", who: "the financier" },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
/** A round seal with one kanji. */
function sealSvg(kanji: string, cls: string): SVGElement {
  const s = svg("svg", { viewBox: "0 0 100 100", class: cls, "aria-hidden": "true" });
  s.append(svg("circle", { cx: 50, cy: 50, r: 44, class: "sc-seal-ring" }), svg("circle", { cx: 50, cy: 50, r: 36, class: "sc-seal-fine" }));
  const t = svg("text", { x: 50, y: 66, "text-anchor": "middle", class: "sc-seal-kanji" });
  t.textContent = kanji;
  s.append(t);
  return s;
}
const b64hex = (b64: string, from: number, len: number) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return [...bin.slice(from, from + len)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
};

export function mountSealChain(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter sc-chapter");
  sec.id = "seal-chain";
  sec.setAttribute("aria-labelledby", "sc-title");

  const cap = el("div", "chapter-cap");
  const kanji = el("p", "chapter-kanji", "連署 · Chapter 3");
  const h2 = el("h2", "chapter-title", "Three seals, then the money moves.");
  h2.id = "sc-title";
  const p = el("p", "chapter-lede", "The assignment letter hands the invoice to the financier. The supplier seals it, then the buyer, then the financier, each over the seals before. Only a whole chain releases the advance: Sign-to-Pay.");
  const note = el("p", "chapter-note", "Each press makes a real Ed25519 seal in your browser with test keys. Nothing is sent.");
  cap.append(kanji, h2, p, note);

  const vis = el("div", "sc-visual");

  // the letter
  const letter = el("article", "sc-letter");
  letter.setAttribute("aria-label", "Assignment letter");
  const head = el("div", "sc-head");
  head.append(el("span", "sc-title", "Notice of assignment"), el("span", "sc-kanji", "譲渡通知"));
  const rows = el("dl", "sc-rows");
  const row = (k: string, v: string, data = true) => rows.append(el("dt", "", k), el("dd", data ? "data" : "", v));
  row("Invoice", INVOICE.invoice_id);
  row("Fingerprint N", short(N));
  row("Amount", "0.0004 ZEC", false);
  const amountDd = rows.lastElementChild as HTMLElement;
  row("Due", "18 Dec 2026", false);
  row("Pay to", PAY_TO);
  const slotsWrap = el("div", "sc-slots");
  const links = svg("svg", { class: "sc-links", viewBox: "0 0 300 20", preserveAspectRatio: "none", "aria-hidden": "true" });
  const linkPaths = [0, 1].map((i) => {
    const path = svg("path", { d: `M${50 + i * 100 + 22} 10 L${150 + i * 100 - 22} 10`, class: "sc-link" }) as SVGPathElement;
    links.append(path);
    return path;
  });
  slotsWrap.append(links);
  const slots = ROLES.map((r) => {
    const s = el("div", "sc-slot");
    const ring = el("div", "sc-slot-ring");
    const imp = sealSvg(r.kanji, "sc-impression");
    const stamp = sealSvg(r.kanji, "sc-stamp");
    const crack = svg("svg", { viewBox: "0 0 100 100", class: "sc-crack", "aria-hidden": "true" });
    crack.append(svg("path", { d: "M50 6 L45 30 L56 44 L43 62 L52 78 L47 96" }), svg("path", { d: "M43 62 L24 70" }), svg("path", { d: "M56 44 L76 38" }));
    ring.append(imp, crack, stamp);
    const lab = el("span", "sc-slot-name", r.name);
    const bytes = el("span", "sc-slot-bytes data", "unsealed");
    s.append(ring, lab, bytes);
    slotsWrap.append(s);
    return { s, imp, stamp, crack, bytes };
  });
  letter.append(head, rows, slotsWrap);

  // the Sign-to-Pay lock and the advance
  const gate = el("div", "sc-gate");
  const lockSvg = svg("svg", { viewBox: "0 0 220 260", class: "sc-lock", "aria-hidden": "true" });
  const shackle = svg("path", { d: "M62 112 V78 a48 48 0 0 1 96 0 V112", class: "sc-shackle" });
  const body = svg("rect", { x: 34, y: 108, width: 152, height: 128, rx: 14, class: "sc-body" });
  lockSvg.append(shackle, body);
  const pins = [0, 1, 2].map((i) => {
    const g = svg("g", { class: "sc-pin" });
    const x = 74 + i * 36;
    g.append(svg("rect", { x: x - 7, y: 150, width: 14, height: 42, rx: 7, class: "sc-pin-bar" }), svg("circle", { cx: x, cy: 214, r: 7, class: "sc-pin-dot" }));
    const lab = svg("text", { x, y: 140, "text-anchor": "middle", class: "sc-pin-kanji" });
    lab.textContent = ROLES[i].kanji;
    g.append(lab);
    lockSvg.append(g);
    return g;
  });
  const flow = svg("svg", { viewBox: "0 0 220 120", class: "sc-flow", "aria-hidden": "true" });
  const flowPath = svg("path", { d: "M110 0 C110 50, 30 40, 30 100", class: "sc-flow-path" }) as SVGPathElement;
  flow.append(flowPath);
  const coins = [0, 1, 2, 3, 4].map(() => {
    const c = svg("circle", { r: 6, class: "sc-coin", cx: -20, cy: -20 });
    flow.append(c);
    return c;
  });
  const wallet = el("div", "sc-wallet");
  wallet.append(el("span", "sc-wallet-name", "Supplier"), el("span", "sc-wallet-amt data", "+ 0.0004 ZEC advance"));
  const status = el("p", "sc-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Waiting for the supplier’s seal.";
  gate.append(lockSvg, flow, wallet, status);

  const controls = el("div", "sc-controls");
  const pressBtn = el("button", "seal-btn sc-press");
  pressBtn.type = "button";
  pressBtn.append(el("span", "seal-btn-label", "Press the supplier’s seal"));
  const tamper = el("button", "ink-link sc-tamper", "Change one zat on the sealed letter");
  tamper.type = "button";
  tamper.disabled = true;
  const reset = el("button", "ink-link sc-reset", "Start over");
  reset.type = "button";
  controls.append(pressBtn, tamper, reset);

  vis.append(letter, gate, controls);
  sec.append(cap, vis);
  root.append(sec);

  // ---------- the chain, for real ----------
  let invCode = "";
  let letterCode = "";
  const seals: string[] = [];
  let keys: { supplier: string; master: string; financier: string } | null = null;
  let broken = false;

  const setup = async () => {
    const w = await loadWasm();
    keys ??= {
      supplier: await labelKey("TES-landing-supplier"),
      master: await labelKey("TES-landing-buyer-master"),
      financier: await labelKey("TES-landing-financier-a"),
    };
    if (!invCode) {
      invCode = w.invoiceEncode(JSON.stringify(INVOICE));
      const financierPk = w.publicKey(keys.financier);
      const terms = await labelKey("TES-INV-0007 assignment terms");
      letterCode = w.assignmentEncode(invCode, financierPk, PAY_TO, terms);
    }
    return { w, k: keys };
  };

  const friendly = (st: string) =>
    st === "Sealed" ? "Sealed by all three. The advance is released." : `Waiting for ${ROLES.find((r) => st.endsWith(r.name))?.who ?? "the next"}’s seal.`;

  const pressNext = async () => {
    if (broken || seals.length >= 3) return;
    pressBtn.disabled = true;
    try {
      const { w, k } = await setup();
      const i = seals.length;
      const seal =
        i === 0
          ? w.supplierSealAssignment(k.supplier, invCode, letterCode)
          : i === 1
            ? w.buyerSealAssignment(k.master, BUYER_INDEX, invCode, letterCode, seals[0])
            : w.financierSealAssignment(k.financier, invCode, letterCode, JSON.stringify(seals));
      seals.push(seal);
      const st = w.assignmentStatus(invCode, letterCode, JSON.stringify(seals));
      await stampDown(i, seal);
      status.textContent = friendly(st);
      if (st === "Sealed") release();
      tamper.disabled = false;
    } catch (e) {
      status.textContent = `Refused: ${(e as Error).message}`;
    } finally {
      pressBtn.disabled = seals.length >= 3 || broken;
      const next = ROLES[seals.length];
      (pressBtn.firstElementChild as HTMLElement).textContent = next ? `Press ${next.who}’s seal` : "Chain complete";
    }
  };

  const stampDown = (i: number, seal: string) =>
    new Promise<void>((done) => {
      const sl = slots[i];
      sl.bytes.textContent = `seal ${b64hex(seal, 136, 4)}…`;
      sl.s.classList.add("is-sealed");
      if (reduced) {
        sl.imp.style.opacity = "1";
        pins[i].classList.add("is-up");
        if (i > 0) linkPaths[i - 1].classList.add("is-on");
        return done();
      }
      animate(sl.stamp, { scale: { from: 2.6, to: 1 }, y: { from: -60, to: 0 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(8px)", to: "blur(0px)" }, duration: dur.seal, ease: fn(ease.snapSettle) });
      animate(sl.stamp, { scaleY: [1, 0.9, 1], scaleX: [1, 1.04, 1], duration: dur.press * 2, delay: dur.seal, ease: "linear" });
      animate(sl.stamp, { opacity: { to: 0 }, y: { to: -30 }, duration: dur.exit, delay: dur.seal + dur.press * 2, ease: fn(ease.accelExit) });
      animate(sl.imp, { opacity: { from: 0, to: 1 }, scale: { from: 0.86, to: 1 }, duration: dur.bleed, delay: dur.seal, ease: "linear" });
      pins[i].classList.add("is-up");
      animate(pins[i], { y: { from: 0, to: -26 }, duration: dur.seal, delay: dur.seal + 100, ease: fn(ease.snapSettle) });
      if (i > 0) {
        const [d] = animeSvg.createDrawable(linkPaths[i - 1]);
        linkPaths[i - 1].classList.add("is-on");
        animate(d, { draw: ["0 0", "0 1"], duration: dur.enter, delay: dur.seal, ease: fn(ease.softInOut) });
      }
      setTimeout(done, dur.seal + 200);
    });

  const release = () => {
    gate.classList.add("is-open");
    if (reduced) {
      wallet.style.opacity = "1";
      return;
    }
    animate(shackle, { y: { from: 0, to: -22 }, duration: dur.seal, ease: fn(ease.snapSettle) });
    const len = flowPath.getTotalLength();
    coins.forEach((c, i) => {
      const q = { t: 0 };
      animate(q, {
        t: 1,
        duration: dur.sink,
        delay: 300 + sibling(i),
        ease: fn(ease.softInOut),
        onUpdate: () => {
          const pt = flowPath.getPointAtLength(len * q.t);
          c.setAttribute("cx", pt.x.toFixed(1));
          c.setAttribute("cy", pt.y.toFixed(1));
          c.setAttribute("opacity", q.t < 0.98 ? "1" : "0");
        },
      });
    });
    animate(wallet, { opacity: { from: 0, to: 1 }, y: { from: 10, to: 0 }, duration: dur.enter, delay: 300 + dur.sink, ease: fn(ease.softLand) });
  };

  const breakSeals = async () => {
    if (!seals.length || broken) return;
    const { w } = await setup();
    const edited = w.invoiceEncode(JSON.stringify({ ...INVOICE, amount_zat: INVOICE.amount_zat + 1 }));
    let msg = "";
    try {
      w.assignmentStatus(edited, letterCode, JSON.stringify(seals));
      msg = "still valid";
    } catch (e) {
      msg = (e as Error).message;
    }
    broken = true;
    amountDd.textContent = "0.00040001 ZEC";
    amountDd.classList.add("is-edited");
    sec.classList.add("is-broken");
    gate.classList.remove("is-open");
    wallet.style.opacity = "0"; // no advance on a letter whose seals broke
    status.textContent = `One zat changed, the seals no longer match: ${msg}. Financing refused.`;
    pressBtn.disabled = true;
    tamper.disabled = true;
    slots.forEach((sl, i) => {
      if (i >= seals.length) return;
      if (reduced) return;
      const [d] = animeSvg.createDrawable(sl.crack.querySelectorAll("path"));
      animate(d, { draw: ["0 0", "0 1"], duration: dur.proof, delay: i * 80, ease: fn(ease.snapSettle) });
    });
    pins.forEach((pin, i) => {
      pin.classList.remove("is-up");
      if (!reduced && i < seals.length) animate(pin, { y: { to: 0 }, duration: dur.exit, delay: 200 + i * 67, ease: fn(ease.accelExit) });
    });
    if (!reduced) animate(shackle, { y: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) });
  };

  const startOver = () => {
    seals.length = 0;
    broken = false;
    sec.classList.remove("is-broken");
    gate.classList.remove("is-open");
    amountDd.textContent = "0.0004 ZEC";
    amountDd.classList.remove("is-edited");
    slots.forEach((sl) => {
      sl.s.classList.remove("is-sealed");
      sl.imp.style.opacity = "0";
      sl.bytes.textContent = "unsealed";
      sl.crack.querySelectorAll("path").forEach((pth) => pth.removeAttribute("draw"));
    });
    linkPaths.forEach((l) => l.classList.remove("is-on"));
    pins.forEach((pin) => ((pin as SVGElement).style.transform = "", pin.classList.remove("is-up")));
    (shackle as SVGElement).style.transform = "";
    wallet.style.opacity = "0";
    status.textContent = "Waiting for the supplier’s seal.";
    pressBtn.disabled = false;
    tamper.disabled = true;
    (pressBtn.firstElementChild as HTMLElement).textContent = "Press the supplier’s seal";
  };

  pressBtn.addEventListener("click", pressNext);
  tamper.addEventListener("click", breakSeals);
  reset.addEventListener("click", startOver);

  // wasm and keys warm up as the chapter comes near; the scene enters when it is in view
  const io = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        void setup();
        io.disconnect();
      }
    },
    { rootMargin: "600px 0px" },
  );
  io.observe(sec);
  if (!reduced) {
    sec.classList.add("is-waiting");
    inView(
      sec,
      () => {
        sec.classList.remove("is-waiting");
        [kanji, h2, p, note].forEach((t, i) =>
          animate(t, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
        );
        animate(letter, { y: { from: 24, to: 0 }, rotate: { from: 2, to: 0.6 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
        animate([gate, controls], { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: 400, ease: fn(ease.softLand) });
      },
      { amount: 0.25 },
    );
  }
  return sec;
}
