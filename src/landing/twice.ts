// Chapter 4, "Pressed twice, caught once", as a pipeline that runs itself (in the manner of an
// automation canvas: nodes, connectors, data flowing along them). When the chapter comes into
// view the workflow executes: the sealed invoice triggers two register entries signed by the
// same supplier key (for financier A and financier B); A's goes on the public board; B looks N
// up, finds it under another commitment, refuses, and builds a double-signature proof (JTSP)
// that is verified offline. Each node runs a real jitsuin-wasm call, shows its output and its
// time. "Execute workflow" runs it again.
import { animate } from "animejs";
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

type NodeId = "trigger" | "signA" | "board" | "signB" | "lookup" | "same" | "refuse" | "proof";
interface NodeDef {
  id: NodeId;
  kanji: string;
  label: string;
  x: number;
  y: number;
  tone?: "seal";
}
/** The canvas is 1200 × 500; node centres. */
const NODES: NodeDef[] = [
  { id: "trigger", kanji: "印", label: "Invoice sealed", x: 90, y: 245 },
  { id: "signA", kanji: "署", label: "Sign entry · A", x: 340, y: 120 },
  { id: "board", kanji: "簿", label: "Public board", x: 600, y: 120 },
  { id: "signB", kanji: "署", label: "Sign entry · B", x: 340, y: 370 },
  { id: "lookup", kanji: "照", label: "B looks N up", x: 600, y: 370 },
  { id: "same", kanji: "同", label: "Same N?", x: 840, y: 370 },
  { id: "refuse", kanji: "拒", label: "Refuse", x: 1090, y: 250, tone: "seal" },
  { id: "proof", kanji: "証", label: "Proof, offline", x: 1090, y: 430 },
];
const EDGES: { from: NodeId; to: NodeId; label?: string; reads?: boolean }[] = [
  { from: "trigger", to: "signA" },
  { from: "trigger", to: "signB" },
  { from: "signA", to: "board" },
  { from: "board", to: "lookup", reads: true },
  { from: "signB", to: "lookup" },
  { from: "lookup", to: "same" },
  { from: "same", to: "refuse", label: "yes" },
  { from: "same", to: "proof", label: "keep both" },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg(tag: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
const b64len = (b64: string) => Math.floor((b64.length * 3) / 4);

export function mountTwice(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter tw-chapter");
  sec.id = "pressed-twice";
  sec.setAttribute("aria-labelledby", "tw-title");

  // a night chapter, laid out like a film frame: the title over a wide canvas
  const cap = el("header", "tw-head");
  const capL = el("div", "tw-head-title");
  const capR = el("div", "tw-head-text");
  const kanji = el("p", "chapter-kanji", "二重 · Chapter 4");
  const h2 = el("h2", "chapter-title", "Pressed twice, caught once.");
  h2.id = "tw-title";
  const p = el("p", "chapter-lede", "A supplier who signs one invoice for two financiers leaves two signatures on one N. The second financier finds N on the board, refuses, and keeps both entries: a proof anyone can check, offline.");
  const note = el("p", "chapter-note", "This workflow runs in your browser with jitsuin-wasm and test keys, every node a real call. Nothing is sent.");
  capL.append(kanji, h2);
  capR.append(p, note);
  cap.append(capL, capR);

  // ---------- the canvas ----------
  const stage = el("div", "tw-stage");
  const canvas = el("div", "tw-canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Workflow: invoice sealed, two register entries signed, the board, financier B's lookup, same N, refuse, proof verified offline");
  const wires = svg("svg", { class: "tw-wires", viewBox: "0 0 1200 500", "aria-hidden": "true" });
  // the dotted grid of an automation canvas
  const defs = svg("defs");
  const pat = svg("pattern", { id: "tw-dots", width: 24, height: 24, patternUnits: "userSpaceOnUse" });
  pat.append(svg("circle", { cx: 2, cy: 2, r: 1.2, class: "tw-dot" }));
  defs.append(pat);
  wires.append(defs, svg("rect", { x: 0, y: 0, width: 1200, height: 500, fill: "url(#tw-dots)" }));
  const pos = Object.fromEntries(NODES.map((n) => [n.id, n])) as unknown as Record<NodeId, NodeDef>;
  const HALF = 44;
  const edgeEls = EDGES.map((e) => {
    const a = pos[e.from];
    const b = pos[e.to];
    const vertical = Math.abs(a.x - b.x) < 10;
    const d = vertical
      ? `M${a.x} ${a.y + HALF + 56} L${b.x} ${b.y - HALF}` // below the node's label and output
      : `M${a.x + HALF} ${a.y} C${a.x + HALF + 90} ${a.y}, ${b.x - HALF - 90} ${b.y}, ${b.x - HALF} ${b.y}`;
    const path = svg("path", { d, class: `tw-wire${e.reads ? " is-read" : ""}` }) as SVGPathElement;
    wires.append(path);
    let lab: SVGElement | null = null;
    if (e.label) {
      lab = svg("text", { x: (a.x + b.x) / 2 + 30, y: (a.y + b.y) / 2 - 8, class: "tw-wire-label", "text-anchor": "middle" }, e.label);
      wires.append(lab);
    }
    const dots = [0, 1, 2].map(() => {
      const c = svg("circle", { r: 5, class: "tw-flow", cx: -20, cy: -20, opacity: 0 });
      wires.append(c);
      return c;
    });
    return { e, path, dots, lab };
  });
  canvas.append(wires);

  // nodes: a tile with a kanji, a label, a status, an output pill
  const nodeEls = Object.fromEntries(
    NODES.map((n) => {
      const g = el("div", `tw-node${n.tone ? " is-" + n.tone : ""}`);
      g.style.left = `${(n.x / 1200) * 100}%`;
      g.style.top = `${(n.y / 500) * 100}%`;
      const tile = el("div", "tw-tile");
      tile.append(el("span", "tw-tile-kanji", n.kanji));
      const badge = el("span", "tw-badge");
      badge.setAttribute("aria-hidden", "true");
      tile.append(badge);
      const label = el("span", "tw-node-label", n.label);
      const out = el("span", "tw-node-out data", "");
      g.append(tile, label, out);
      canvas.append(g);
      return [n.id, { g, out, badge }];
    }),
  ) as unknown as Record<NodeId, { g: HTMLElement; out: HTMLElement; badge: HTMLElement }>;
  stage.append(canvas);

  // ---------- under the canvas: the execution log and the proof ----------
  const below = el("div", "tw-below");
  const logWrap = el("div", "tw-log-wrap");
  const logHead = el("div", "tw-log-head");
  const execBtn = el("button", "seal-btn tw-exec");
  execBtn.type = "button";
  execBtn.append(el("span", "seal-btn-label", "Execute workflow"));
  const status = el("span", "tw-run-status", "Runs when it comes into view.");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  logHead.append(execBtn, status);
  const log = el("ol", "tw-log");
  logWrap.append(logHead, log);

  const proof = el("article", "tw-proof");
  proof.setAttribute("aria-label", "Double-signature proof");
  const ph = el("div", "tw-proof-head");
  ph.append(el("span", "tw-proof-title", "Double-signature proof"), el("span", "tw-proof-kanji", "二重署名証明"));
  const pr = el("dl", "tw-proof-rows");
  const prow = (k: string) => {
    const dd = el("dd", "data", "—");
    pr.append(el("dt", "", k), dd);
    return dd;
  };
  const pN = prow("Fingerprint N");
  const pKey = prow("Signed by");
  const pA = prow("Entry 1 · financier");
  const pB = prow("Entry 2 · financier");
  const pSize = prow("Proof");
  const pVerdict = el("p", "tw-verdict", "");
  proof.append(ph, pr, pVerdict);
  below.append(logWrap, proof);

  sec.append(cap, stage, below);
  root.append(sec);

  // ---------- running the workflow ----------
  const keys = async () => ({
    supplier: await labelKey("TES-landing-supplier"),
    master: await labelKey("TES-landing-buyer-master"),
    finA: await labelKey("TES-landing-financier-a"),
    finB: await labelKey("TES-landing-financier-b"),
    saltA: await labelKey("TES-landing-salt-a"),
    saltB: await labelKey("TES-landing-salt-b"),
  });

  const flow = (from: NodeId, to: NodeId) =>
    new Promise<void>((done) => {
      const w = edgeEls.find((x) => x.e.from === from && x.e.to === to)!;
      w.path.classList.add("is-live");
      if (reduced) return done();
      const len = w.path.getTotalLength();
      let left = w.dots.length;
      w.dots.forEach((c, i) => {
        const q = { t: 0 };
        animate(q, {
          t: 1,
          duration: dur.enter + 200,
          delay: sibling(i),
          ease: fn(ease.softInOut),
          onUpdate: () => {
            const pt = w.path.getPointAtLength(len * q.t);
            c.setAttribute("cx", pt.x.toFixed(1));
            c.setAttribute("cy", pt.y.toFixed(1));
            c.setAttribute("opacity", q.t < 0.97 ? "1" : "0");
          },
          onComplete: () => --left === 0 && done(),
        });
      });
    });

  const setNode = (id: NodeId, state: "idle" | "run" | "done" | "stop", out = "") => {
    const n = nodeEls[id];
    n.g.classList.remove("is-run", "is-done", "is-stop");
    if (state !== "idle") n.g.classList.add(`is-${state}`);
    n.out.textContent = out;
    if (state === "done" || state === "stop") {
      if (!reduced) animate(n.g.querySelector(".tw-tile")!, { scale: [1, 1.08, 1], duration: dur.seal + dur.press, ease: fn(ease.snapSettle) });
    }
  };
  const logLine = (id: NodeId, text: string, ms: number) => {
    const li = el("li", "tw-log-line");
    li.append(el("span", "tw-log-kanji", pos[id].kanji), el("span", "tw-log-text", text), el("span", "tw-log-ms data", `${ms.toFixed(1)} ms`));
    log.append(li);
    if (!reduced) animate(li, { opacity: { from: 0, to: 1 }, x: { from: -8, to: 0 }, duration: dur.enter, ease: fn(ease.softLand) });
  };
  /** One node: mark it running, do the real call, time it, show the result. */
  const step = async <T,>(id: NodeId, work: () => T, describe: (r: T) => { out: string; log: string }, stop = false): Promise<T> => {
    setNode(id, "run");
    if (!reduced) await sleep(260);
    const t = performance.now();
    const r = work();
    const ms = performance.now() - t;
    const d = describe(r);
    setNode(id, stop ? "stop" : "done", d.out);
    logLine(id, d.log, ms);
    return r;
  };

  let running = false;
  const reset = () => {
    NODES.forEach((n) => setNode(n.id, "idle"));
    edgeEls.forEach((w) => w.path.classList.remove("is-live"));
    log.replaceChildren();
    proof.classList.remove("is-shown");
    sec.classList.remove("is-proven");
    for (const dd of [pN, pKey, pA, pB, pSize]) dd.textContent = "—";
    pVerdict.textContent = "";
  };

  const execute = async () => {
    if (running) return;
    running = true;
    execBtn.disabled = true;
    reset();
    status.textContent = "Running…";
    try {
      const w = await loadWasm();
      const k = await keys();
      const inv = await step("trigger", () => w.invoiceEncode(JSON.stringify(INVOICE)), (c) => ({ out: short(w.invoiceNullifier(c)), log: "Invoice sealed by the buyer: its fingerprint N" }));
      await Promise.all([flow("trigger", "signA"), flow("trigger", "signB")]);
      const a = await step(
        "signA",
        () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finA), k.saltA)) as { memo: string; commitment: string },
        (r) => ({ out: `→ ${short(r.commitment)}`, log: "Supplier signs a register entry, committed to financier A" }),
      );
      const b = await step(
        "signB",
        () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finB), k.saltB)) as { memo: string; commitment: string },
        (r) => ({ out: `→ ${short(r.commitment)}`, log: "Same supplier key signs a second entry, committed to financier B" }),
      );
      await flow("signA", "board");
      const onBoard = await step(
        "board",
        () => JSON.parse(w.boardMemoDescribe(a.memo)) as { nullifier: string; financier_commitment: string },
        (d) => ({ out: `${short(d.nullifier)} · registered`, log: "Entry A posted: N is on the public board" }),
      );
      await Promise.all([flow("board", "lookup"), flow("signB", "lookup")]);
      const seen = await step(
        "lookup",
        () => JSON.parse(w.boardMemoDescribe(b.memo)) as { nullifier: string; financier_commitment: string },
        (d) => ({ out: d.nullifier === onBoard.nullifier ? "N found on the board" : "N not found", log: "Financier B looks N up before paying" }),
      );
      await flow("lookup", "same");
      const caught = await step(
        "same",
        () => seen.nullifier === onBoard.nullifier && seen.financier_commitment !== onBoard.financier_commitment,
        (c) => ({ out: c ? "yes · other commitment" : "no", log: "Same N, another financier's commitment?" }),
      );
      if (!caught) throw new Error("the two entries do not collide");
      await Promise.all([flow("same", "refuse"), flow("same", "proof")]);
      await step("refuse", () => true, () => ({ out: "拒否 · not financed", log: "Financier B refuses to finance it" }), true);
      const sig = w.buyerSignInvoice(k.master, 7, inv);
      const pf = await step(
        "proof",
        () => w.doubleSignProof(inv, sig, a.memo, b.memo),
        (x) => ({ out: `JTSP · ${b64len(x)} bytes ✓`, log: "Both entries kept as a double-signature proof, verified offline" }),
      );
      const r = JSON.parse(w.verifyProof(pf));
      pN.textContent = short(r.nullifier);
      pKey.textContent = `supplier ${short(r.supplier_pk)}`;
      pA.textContent = `commitment ${short(r.first_commitment)}`;
      pB.textContent = `commitment ${short(r.second_commitment)}`;
      pSize.textContent = `JTSP · ${b64len(pf)} bytes · checked offline`;
      pVerdict.textContent = "Verified: one supplier key signed one N for two financiers.";
      proof.classList.add("is-shown");
      sec.classList.add("is-proven");
      if (!reduced) animate(proof, { y: { from: 60, to: 0 }, rotate: { from: 7, to: -1.5 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 300, ease: fn(ease.softLand) });
      status.textContent = "Done: double financing caught, proof verified.";
    } catch (e) {
      status.textContent = `Stopped: ${(e as Error).message}`;
    } finally {
      running = false;
      execBtn.disabled = false;
    }
  };
  execBtn.addEventListener("click", execute);

  // warm the wasm as the chapter nears; run the workflow the first time it is in view
  const io = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        void loadWasm();
        io.disconnect();
      }
    },
    { rootMargin: "600px 0px" },
  );
  io.observe(sec);
  let ran = false;
  inView(
    canvas,
    () => {
      if (!reduced) {
        sec.classList.remove("is-waiting");
        [kanji, h2, p, note].forEach((t, i) =>
          animate(t, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
        );
        animate(canvas, { opacity: { from: 0, to: 1 }, y: { from: 20, to: 0 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
      }
      if (!ran) {
        ran = true;
        setTimeout(execute, reduced ? 0 : 700);
      }
    },
    { amount: 0.2 }, // the canvas is wider than a phone, so it is never more than ~40% in view there
  );
  if (!reduced) sec.classList.add("is-waiting");
  return sec;
}
