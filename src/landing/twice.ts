// Chapter 4, "Pressed twice, caught once": the supplier signs a register entry for the hero's
// invoice with financier A (it goes on the public board), then signs a second one for the same
// N with financier B. B looks N up, finds it already registered under another commitment,
// refuses, and keeps both entries: a double-signature proof (JTSP) that anyone can verify
// offline. Every entry, signature and proof here is made by jitsuin-wasm in the browser.
import { animate, stagger } from "animejs";
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
/** Earlier entries on the board (the hero's rows): real N of TES-INV-0001..0006. */
const ROWS = ["82dfbc47…6a3a", "3d4fa116…0637", "463789b7…53fb", "545cc224…738d", "ce4150a1…feee", "96a3e728…c703"];

const STEPS = [
  { btn: "Register with financier A", say: "The supplier signs a register entry for N, committed to financier A. It goes on the public board." },
  { btn: "Offer the same invoice to financier B", say: "Then signs a second entry for the same N, committed to financier B, and offers it off the board." },
  { btn: "Financier B checks the board", say: "B looks N up before paying: it is already on the board, under another commitment. Refused." },
  { btn: "Verify the proof offline", say: "B keeps both entries. Signed by the same supplier key for one N: a double-signature proof anyone can check." },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
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

  const cap = el("div", "chapter-cap");
  const kanji = el("p", "chapter-kanji", "二重 · Chapter 4");
  const h2 = el("h2", "chapter-title", "Pressed twice, caught once.");
  h2.id = "tw-title";
  const p = el("p", "chapter-lede", "A supplier who signs one invoice for two financiers leaves two signatures on one N. The second financier finds N on the board, refuses, and keeps both entries: a proof anyone can check, offline.");
  const note = el("p", "chapter-note", "Real register entries and a real proof, made in your browser with test keys. Nothing is sent.");
  cap.append(kanji, h2, p, note);

  const vis = el("div", "tw-visual");

  // ---------- the scene: line art in the site's ink ----------
  const scene = svg("svg", { viewBox: "0 0 640 380", class: "tw-scene", role: "img", "aria-label": "The supplier, the public board, financier A and financier B" }) as SVGSVGElement;
  // ground line
  scene.append(svg("path", { d: "M10 336 H630", class: "tw-ground" }));
  // supplier workshop (sawtooth roof)
  const workshop = svg("g", { class: "tw-house" });
  workshop.append(
    svg("path", { d: "M24 336 V262 L54 238 V262 L84 238 V262 L114 238 V262 L144 238 V336 Z", class: "tw-wall" }),
    svg("rect", { x: 66, y: 296, width: 34, height: 40, class: "tw-door" }),
    svg("rect", { x: 36, y: 276, width: 20, height: 16, class: "tw-win" }),
    svg("rect", { x: 110, y: 276, width: 20, height: 16, class: "tw-win" }),
    svg("text", { x: 84, y: 360, "text-anchor": "middle", class: "tw-label" }, "Supplier"),
    svg("text", { x: 84, y: 228, "text-anchor": "middle", class: "tw-kanji" }, "売"),
  );
  scene.append(workshop);
  // the public board
  const board = svg("g", { class: "tw-board" });
  board.append(
    svg("rect", { x: 238, y: 52, width: 164, height: 284, class: "tw-board-body" }),
    svg("text", { x: 252, y: 80, class: "tw-board-kanji" }, "登記簿"),
    svg("text", { x: 388, y: 80, "text-anchor": "end", class: "tw-board-title" }, "Public board"),
    svg("path", { d: "M252 92 H388", class: "tw-board-rule" }),
  );
  ROWS.forEach((r, i) => {
    board.append(svg("rect", { x: 252, y: 102 + i * 30, width: 136, height: 22, class: "tw-row" }), svg("text", { x: 260, y: 117 + i * 30, class: "tw-row-n" }, r));
  });
  const ourY = 102 + 6 * 30;
  const ourRow = svg("rect", { x: 252, y: ourY, width: 136, height: 22, class: "tw-row is-ours" });
  const ourText = svg("text", { x: 260, y: ourY + 15, class: "tw-row-n is-ours" }, "");
  const ourTag = svg("text", { x: 382, y: ourY + 15, "text-anchor": "end", class: "tw-row-tag" }, "");
  board.append(ourRow, ourText, ourTag);
  scene.append(board);
  // the banks: a portico, a pediment, a mark
  const bank = (x: number, y: number, name: string, mark: string) => {
    const g = svg("g", { class: "tw-house" });
    g.append(
      svg("path", { d: `M${x - 60} ${y} L${x} ${y - 28} L${x + 60} ${y} Z`, class: "tw-roof" }),
      svg("rect", { x: x - 56, y, width: 112, height: 70, class: "tw-wall" }),
      ...[0, 1, 2, 3].map((i) => svg("rect", { x: x - 44 + i * 26, y: y + 10, width: 8, height: 52, class: "tw-col" })),
      svg("rect", { x: x - 60, y: y + 70, width: 120, height: 8, class: "tw-step" }),
      svg("text", { x, y: y + 96, "text-anchor": "middle", class: "tw-label" }, name),
      svg("text", { x, y: y - 8, "text-anchor": "middle", class: "tw-mark" }, mark),
    );
    scene.append(g);
    return g;
  };
  bank(552, 74, "Financier A", "A");
  const bankB = bank(552, 238, "Financier B", "B");
  // the refusal stamp over bank B
  // the outer group places it; the inner one is what animates (a CSS transform would replace the attribute)
  const refuseAt = svg("g", { transform: "translate(552 268) rotate(-10)" });
  const refuse = svg("g", { class: "tw-refuse", opacity: 0 });
  refuseAt.append(refuse);
  refuse.append(svg("rect", { x: -58, y: -24, width: 116, height: 48, class: "tw-refuse-box" }), svg("text", { x: 0, y: -2, "text-anchor": "middle", class: "tw-refuse-jp" }, "拒否"), svg("text", { x: 0, y: 16, "text-anchor": "middle", class: "tw-refuse-en" }, "REFUSED"));
  scene.append(refuseAt);
  // paths for the entries and the lookup
  const pathA = svg("path", { d: "M120 236 C160 120, 220 150, 320 " + (ourY + 11), class: "tw-route" }) as SVGPathElement;
  const pathAtoBank = svg("path", { d: "M402 " + (ourY - 10) + " C460 200, 470 120, 500 96", class: "tw-route" }) as SVGPathElement;
  const pathB = svg("path", { d: "M140 300 C260 380, 400 360, 494 290", class: "tw-route" }) as SVGPathElement;
  const beam = svg("path", { d: `M496 262 L402 ${ourY + 11}`, class: "tw-beam" }) as SVGPathElement;
  // routes run behind the board and the houses; the beam and the papers ride on top
  scene.insertBefore(pathB, scene.children[1]);
  scene.insertBefore(pathAtoBank, scene.children[1]);
  scene.insertBefore(pathA, scene.children[1]);
  scene.append(beam);
  // two paper entries
  const paper = (cls: string, label: string) => {
    const g = svg("g", { class: `tw-paper ${cls}`, opacity: 0 });
    g.append(svg("path", { d: "M-15 -10 H11 L15 -6 V10 H-15 Z", class: "tw-paper-sheet" }), svg("text", { x: 0, y: 4, "text-anchor": "middle", class: "tw-paper-label" }, label));
    scene.append(g);
    return g;
  };
  const entryA = paper("is-a", "A");
  const entryB = paper("is-b", "B");
  vis.append(scene);

  // ---------- the proof, as a document ----------
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
  const pVerdict = el("p", "tw-verdict", "Not built yet.");
  proof.append(ph, pr, pVerdict);
  vis.append(proof);

  // ---------- controls ----------
  const controls = el("div", "tw-controls");
  const stepBtn = el("button", "seal-btn tw-step-btn");
  stepBtn.type = "button";
  const stepLabel = el("span", "seal-btn-label", `1 · ${STEPS[0].btn}`);
  stepBtn.append(stepLabel);
  const reset = el("button", "ink-link tw-reset", "Start over");
  reset.type = "button";
  const say = el("p", "tw-say", STEPS[0].say);
  say.setAttribute("role", "status");
  say.setAttribute("aria-live", "polite");
  controls.append(stepBtn, reset, say);
  vis.append(controls);

  sec.append(cap, vis);
  root.append(sec);

  // ---------- the real work ----------
  let step = 0;
  type Made = { inv: string; a?: { memo: string; commitment: string }; b?: { memo: string; commitment: string }; n?: string };
  const made: Made = { inv: "" };
  const keys = async () => ({
    supplier: await labelKey("TES-landing-supplier"),
    master: await labelKey("TES-landing-buyer-master"),
    finA: await labelKey("TES-landing-financier-a"),
    finB: await labelKey("TES-landing-financier-b"),
    saltA: await labelKey("TES-landing-salt-a"),
    saltB: await labelKey("TES-landing-salt-b"),
  });

  const fly = (g: SVGElement, path: SVGPathElement, ms = dur.sink) =>
    new Promise<void>((done) => {
      const len = path.getTotalLength();
      g.setAttribute("opacity", "1");
      if (reduced) {
        const pt = path.getPointAtLength(len);
        g.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
        return done();
      }
      const q = { t: 0 };
      animate(q, {
        t: 1,
        duration: ms,
        ease: fn(ease.softInOut),
        onUpdate: () => {
          const pt = path.getPointAtLength(len * q.t);
          const ah = path.getPointAtLength(Math.min(len, len * q.t + 2));
          const a = (Math.atan2(ah.y - pt.y, ah.x - pt.x) * 180) / Math.PI;
          g.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${(a * 0.25).toFixed(1)})`);
        },
        onComplete: () => done(),
      });
    });

  const run = async () => {
    stepBtn.disabled = true;
    try {
      const w = await loadWasm();
      const k = await keys();
      if (!made.inv) made.inv = w.invoiceEncode(JSON.stringify(INVOICE));
      if (step === 0) {
        made.a = JSON.parse(w.supplierRegisterEntry(k.supplier, made.inv, w.publicKey(k.finA), k.saltA));
        const d = JSON.parse(w.boardMemoDescribe(made.a!.memo));
        made.n = d.nullifier as string;
        await fly(entryA, pathA);
        entryA.setAttribute("opacity", "0");
        ourText.textContent = `${made.n.slice(0, 8)}…`; // short, so the row keeps room for its tag
        ourTag.textContent = "new";
        sec.classList.add("is-registered");
        await fly(entryA, pathAtoBank, dur.enter + 300);
        entryA.setAttribute("opacity", "0");
      } else if (step === 1) {
        made.b = JSON.parse(w.supplierRegisterEntry(k.supplier, made.inv, w.publicKey(k.finB), k.saltB));
        await fly(entryB, pathB);
      } else if (step === 2) {
        const db = JSON.parse(w.boardMemoDescribe(made.b!.memo));
        const caught = db.nullifier === made.n && db.financier_commitment !== made.a!.commitment;
        sec.classList.add("is-caught");
        ourTag.textContent = caught ? "again" : "";
        if (!reduced) {
          animate(beam, { opacity: { from: 0, to: 1 }, duration: dur.fade, ease: "linear" });
          animate(refuse, { opacity: { from: 0, to: 1 }, scale: { from: 1.6, to: 1 }, duration: dur.proof, delay: 250, ease: fn(ease.popOver) });
          animate(bankB, { x: [0, -5, 4, -2, 0], duration: 320, delay: 200, ease: "linear" });
        } else refuse.setAttribute("opacity", "1");
      } else if (step === 3) {
        const sig = w.buyerSignInvoice(k.master, 7, made.inv);
        const pf = w.doubleSignProof(made.inv, sig, made.a!.memo, made.b!.memo);
        const r = JSON.parse(w.verifyProof(pf));
        pN.textContent = short(r.nullifier);
        pKey.textContent = `supplier ${short(r.supplier_pk)}`;
        pA.textContent = `commitment ${short(r.first_commitment)}`;
        pB.textContent = `commitment ${short(r.second_commitment)}`;
        pSize.textContent = `JTSP · ${b64len(pf)} bytes · checked offline`;
        pVerdict.textContent = "Verified: one supplier key signed one N for two financiers.";
        sec.classList.add("is-proven");
        if (!reduced) {
          animate(entryA, { opacity: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) });
          animate(entryB, { opacity: { to: 0 }, duration: dur.exit, ease: fn(ease.accelExit) });
          animate(proof, { y: { from: 20, to: 0 }, rotate: { from: -2, to: 0.5 }, opacity: { from: 0.4, to: 1 }, duration: dur.enter + 200, ease: fn(ease.softLand) });
          animate([...pr.querySelectorAll("dd"), pVerdict], { opacity: { from: 0, to: 1 }, x: { from: -6, to: 0 }, duration: dur.enter, delay: stagger(67), ease: fn(ease.softLand) });
        }
      }
      step++;
    } catch (e) {
      say.textContent = `Refused by the wasm: ${(e as Error).message}`;
      stepBtn.disabled = false;
      return;
    }
    const next = STEPS[step];
    say.textContent = STEPS[step - 1].say;
    stepLabel.textContent = next ? `${step + 1} · ${next.btn}` : "Proof verified";
    stepBtn.disabled = !next;
  };

  const startOver = () => {
    step = 0;
    made.a = made.b = made.n = undefined;
    sec.classList.remove("is-registered", "is-caught", "is-proven");
    ourText.textContent = "";
    ourTag.textContent = "";
    [entryA, entryB, refuse].forEach((g) => g.setAttribute("opacity", "0"));
    beam.style.opacity = "";
    for (const dd of [pN, pKey, pA, pB, pSize]) dd.textContent = "—";
    pVerdict.textContent = "Not built yet.";
    stepLabel.textContent = `1 · ${STEPS[0].btn}`;
    say.textContent = STEPS[0].say;
    stepBtn.disabled = false;
  };
  stepBtn.addEventListener("click", run);
  reset.addEventListener("click", startOver);

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
  if (!reduced) {
    sec.classList.add("is-waiting");
    inView(
      sec,
      () => {
        sec.classList.remove("is-waiting");
        [kanji, h2, p, note].forEach((t, i) =>
          animate(t, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
        );
        animate(scene, { y: { from: 24, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
        animate([proof, controls], { y: { from: 16, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter, delay: 400, ease: fn(ease.softLand) });
      },
      { amount: 0.25 },
    );
  }
  return sec;
}
