// Chapter 4, "Pressed twice, caught once": a flow that runs itself, on the day paper. Each station
// is drawn as the thing it is (the sealed invoice, two signed entry slips, the public board, a
// lookup, the comparison of N and commitments, a bank with its shutter down, the proof) and is
// joined to the next by a wire that data flows along. When the chapter comes into view the flow
// executes with jitsuin-wasm: each station runs a real call, then shows its result; a log keeps
// the measured times; the verified double-signature proof (JTSP) lands at the end.
import { animate } from "animejs";
import { inView } from "motion";
import { tx, untx } from "./i18n";
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

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64len = (b64: string) => Math.floor((b64.length * 3) / 4);
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

export function mountTwice(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter tw-chapter");
  sec.id = "pressed-twice";
  sec.setAttribute("aria-labelledby", "tw-title");

  // a wide frame: the title over the flow, the log and the proof under it
  const cap = el("header", "tw-head");
  const capL = el("div", "tw-head-title");
  const capR = el("div", "tw-head-text");
  const kanji = tx(el("p", "chapter-kanji"), "tw.kanji");
  const h2 = tx(el("h2", "chapter-title"), "tw.title");
  h2.id = "tw-title";
  const p = tx(el("p", "chapter-lede"), "tw.lede");
  const note = tx(el("p", "chapter-note"), "tw.note");
  capL.append(kanji, h2);
  capR.append(p, note);
  cap.append(capL, capR);

  // ---------- the flow ----------
  const stage = el("div", "tw-stage");
  const art = svg("svg", { class: "tw-flowart", role: "img" }) as SVGSVGElement;
  const title = svg("title");
  tx(title, "tw.lede");
  art.append(title);
  const wireLayer = svg("g");
  art.append(wireLayer);

  const station = (id: Id) => {
    const g = svg("g", { class: `tw-st tw-st-${id}` });
    const halo = svg("rect", { x: -W - 14, y: -78, width: 2 * W + 28, height: 132, rx: 22, class: "tw-halo" });
    const draw = svg("g", { class: "tw-draw" });
    const label = tx(svg("text", { x: 0, y: 78, "text-anchor": "middle", class: "tw-st-label" }), `tw.st.${id}`);
    const out = svg("text", { x: 0, y: 100, "text-anchor": "middle", class: "tw-st-out" });
    const check = svg("g", { class: "tw-check", transform: `translate(${W + 4} -64)` });
    check.append(svg("circle", { r: 12, class: "tw-check-dot" }), svg("path", { d: "M-5 0 L-1 4 L6 -4", class: "tw-check-tick" }));
    g.append(halo, draw, label, out, check);
    art.append(g);
    return { g, draw, out };
  };
  const S = Object.fromEntries(IDS.map((id) => [id, station(id)])) as unknown as Record<Id, ReturnType<typeof station>>;

  // the sealed invoice: a sheet, ruled lines, the buyer's seal, its N
  {
    const d = S.invoice.draw;
    d.append(
      svg("rect", { x: -46, y: -66, width: 92, height: 118, class: "tw-paper" }),
      svg("path", { d: "M-34 -50 H8 M-34 -38 H26 M-34 -26 H18 M-34 -14 H30", class: "tw-rule" }),
      svg("circle", { cx: 18, cy: 24, r: 15, class: "tw-seal" }),
      svg("circle", { cx: 18, cy: 24, r: 11, class: "tw-seal-fine" }),
      svg("text", { x: 18, y: 29, "text-anchor": "middle", class: "tw-seal-kanji" }, "印"),
      svg("text", { x: -34, y: 4, class: "tw-mono-s" }, "N"),
    );
  }
  const invN = svg("text", { x: -22, y: 4, class: "tw-mono-s" }, "········");
  S.invoice.draw.append(invN);

  // an entry slip: a ticket with a notched edge, N, who it is for, the supplier's signature
  const slip = (id: "entryA" | "entryB", who: string) => {
    const d = S[id].draw;
    d.append(
      svg("path", { d: "M-70 -40 H70 V40 H-70 V10 a10 10 0 0 0 0 -20 Z", class: "tw-paper" }),
      svg("text", { x: -52, y: -16, class: "tw-mono-s" }, "N"),
      svg("path", { d: "M-52 24 c8 -14 14 10 22 -2 s10 -12 16 0 s8 6 14 -4", class: "tw-sign" }),
    );
    const n = svg("text", { x: -38, y: -16, class: "tw-mono-s" }, "········");
    const to = tx(svg("text", { x: -52, y: 4, class: "tw-slip-to" }), "tw.toFin", { x: who.slice(-1) });
    const mark = svg("text", { x: 52, y: -14, "text-anchor": "middle", class: "tw-slip-mark" }, who.slice(-1));
    d.append(n, to, mark);
    return n;
  };
  const slipAN = slip("entryA", "Financier A");
  const slipBN = slip("entryB", "Financier B");

  // the public board: a panel of fingerprints, our row empty until A's entry lands
  const boardRows: SVGElement[] = [];
  const ourRow = svg("rect", { x: -60, y: 20, width: 120, height: 18, class: "tw-row is-ours" });
  const ourRowN = svg("text", { x: -52, y: 33, class: "tw-mono-s is-ours" }, "");
  {
    const d = S.board.draw;
    d.append(svg("rect", { x: -72, y: -70, width: 144, height: 120, class: "tw-board" }), svg("text", { x: -60, y: -50, class: "tw-board-title" }, "登記簿"));
    ["2eca708e…", "43a49aba…", "f1f00264…"].forEach((r, i) => {
      const row = svg("rect", { x: -60, y: -38 + i * 19, width: 120, height: 15, class: "tw-row" });
      boardRows.push(row);
      d.append(row, svg("text", { x: -52, y: -27 + i * 19, class: "tw-mono-xs" }, r));
    });
    d.append(ourRow, ourRowN);
  }

  // the lookup: a row of the board under a magnifying glass
  const lookN = svg("text", { x: -54, y: 4, class: "tw-mono-s" }, "········");
  {
    const d = S.lookup.draw;
    d.append(
      svg("rect", { x: -66, y: -12, width: 112, height: 24, class: "tw-row is-look" }),
      lookN,
      svg("circle", { cx: 34, cy: -10, r: 24, class: "tw-lens" }),
      svg("path", { d: "M52 8 L68 26", class: "tw-lens-handle" }),
    );
  }

  // the comparison: N against N (equal), commitment against commitment (different)
  const cmp = {
    n1: svg("text", { x: -10, y: -10, "text-anchor": "end", class: "tw-mono-s" }, "········"),
    n2: svg("text", { x: 10, y: -10, class: "tw-mono-s" }, "········"),
    c1: svg("text", { x: -10, y: 30, "text-anchor": "end", class: "tw-mono-s" }, "····"),
    c2: svg("text", { x: 10, y: 30, class: "tw-mono-s" }, "····"),
  };
  {
    const d = S.same.draw;
    d.append(
      svg("path", { d: "M-74 -40 H74 M-74 0 H74 M-74 40 H74", class: "tw-rule" }),
      tx(svg("text", { x: -74, y: -28, class: "tw-cmp-key" }), "tw.k.n"),
      tx(svg("text", { x: -74, y: 12, class: "tw-cmp-key" }), "tw.k.c"),
      svg("text", { x: 0, y: -9, "text-anchor": "middle", class: "tw-eq" }, "="),
      svg("text", { x: 0, y: 31, "text-anchor": "middle", class: "tw-neq" }, "≠"),
      cmp.n1,
      cmp.n2,
      cmp.c1,
      cmp.c2,
    );
  }

  // the refusal: a bank with its shutter, and the stamp that lands on it
  const shutter = svg("rect", { x: -28, y: -14, width: 56, height: 0, class: "tw-shutter" });
  const stampG = svg("g", { class: "tw-stamp", opacity: 0 });
  {
    const d = S.refuse.draw;
    d.append(
      svg("path", { d: "M-62 -36 L0 -66 L62 -36 Z", class: "tw-roof" }),
      svg("rect", { x: -56, y: -36, width: 112, height: 82, class: "tw-wall" }),
      ...[0, 1, 2, 3, 4].map((i) => svg("rect", { x: -48 + i * 22, y: -28, width: 8, height: 66, class: "tw-col" })),
      svg("rect", { x: -28, y: -14, width: 56, height: 52, class: "tw-doorway" }),
      shutter,
      svg("rect", { x: -64, y: 46, width: 128, height: 8, class: "tw-step" }),
    );
    const sAt = svg("g", { transform: "translate(0 4) rotate(-10)" });
    stampG.append(svg("rect", { x: -52, y: -20, width: 104, height: 40, class: "tw-stamp-box" }), svg("text", { x: 0, y: -1, "text-anchor": "middle", class: "tw-stamp-jp" }, "拒否"), svg("text", { x: 0, y: 14, "text-anchor": "middle", class: "tw-stamp-en" }, "REFUSED"));
    sAt.append(stampG);
    d.append(sAt);
  }

  // the proof: a document with a check
  {
    const d = S.proof.draw;
    d.append(
      svg("rect", { x: -44, y: -64, width: 88, height: 114, class: "tw-paper" }),
      svg("path", { d: "M-32 -48 H22 M-32 -36 H30 M-32 -24 H14 M-32 -12 H26 M-32 0 H20", class: "tw-rule" }),
      svg("circle", { cx: 16, cy: 26, r: 15, class: "tw-ok" }),
      svg("path", { d: "M8 26 L14 32 L25 19", class: "tw-ok-tick" }),
    );
  }

  // wires, under the stations
  const wires = WIRES.map((w) => {
    const path = svg("path", { class: `tw-wire${w.reads ? " is-read" : ""}` }) as SVGPathElement;
    wireLayer.append(path);
    const dots = [0, 1, 2].map(() => {
      const c = svg("circle", { r: 4.5, class: "tw-flowdot", cx: -20, cy: -20, opacity: 0 });
      wireLayer.append(c);
      return c;
    });
    return { w, path, dots };
  });
  stage.append(art);

  // wide on a desk, tall on a phone: the stations move, the wires are redrawn between them
  const wire = (w: (typeof WIRES)[number], L: Layout) => {
    const [ax, ay] = L.at[w.from];
    const [bx, by] = L.at[w.to];
    if (!L.tall) return w.reads ? `M${ax} ${ay + 112} L${bx} ${by - 80}` : `M${ax + W + 4} ${ay} C${ax + W + 70} ${ay}, ${bx - W - 70} ${by}, ${bx - W - 4} ${by}`;
    if (w.reads) return `M${ax + W + 2} ${ay - 8} L${bx - W - 2} ${by - 8}`;
    return `M${ax} ${ay + 112} C${ax} ${ay + 170}, ${bx} ${by - 150}, ${bx} ${by - 84}`;
  };
  const tallQuery = matchMedia("(max-width: 700px)");
  const layout = () => {
    const L = LAYOUTS[tallQuery.matches ? "tall" : "wide"];
    art.setAttribute("viewBox", `0 0 ${L.box[0]} ${L.box[1]}`);
    for (const id of IDS) S[id].g.setAttribute("transform", `translate(${L.at[id][0]} ${L.at[id][1]})`);
    for (const x of wires) x.path.setAttribute("d", wire(x.w, L));
  };
  layout();
  tallQuery.addEventListener("change", layout);

  // ---------- under the flow: the log and the proof ----------
  const below = el("div", "tw-below");
  const logWrap = el("div", "tw-log-wrap");
  const logHead = el("div", "tw-log-head");
  const execBtn = el("button", "seal-btn tw-exec");
  execBtn.type = "button";
  execBtn.append(tx(el("span", "seal-btn-label"), "tw.run"));
  const status = tx(el("span", "tw-run-status"), "tw.idle");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  logHead.append(execBtn, status);
  const log = el("ol", "tw-log");
  logWrap.append(logHead, log);

  const proof = el("article", "tw-proof");
  const ph = el("div", "tw-proof-head");
  ph.append(tx(el("span", "tw-proof-title"), "tw.proof"), el("span", "tw-proof-kanji", "二重署名証明"));
  const pr = el("dl", "tw-proof-rows");
  const prow = (k: string) => {
    const dd = el("dd", "data", "—");
    pr.append(tx(el("dt"), k), dd);
    return dd;
  };
  const pN = prow("tw.p.n");
  const pKey = prow("tw.p.by");
  const pA = prow("tw.p.a");
  const pB = prow("tw.p.b");
  const pSize = prow("tw.p.size");
  const pVerdict = el("p", "tw-verdict", "");
  proof.append(ph, pr, pVerdict);
  below.append(logWrap, proof);

  sec.append(cap, stage, below);
  root.append(sec);

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
      const w = wires.find((x) => x.w.from === from && x.w.to === to)!;
      w.path.classList.add("is-live");
      if (reduced) return done();
      const len = w.path.getTotalLength();
      let left = w.dots.length;
      w.dots.forEach((c, i) => {
        const q = { t: 0 };
        animate(q, {
          t: 1,
          duration: dur.enter + 250,
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

  const mark = (id: Id, state: "idle" | "run" | "done" | "stop") => {
    const g = S[id].g;
    g.classList.remove("is-run", "is-done", "is-stop");
    if (state !== "idle") g.classList.add(`is-${state}`);
    if ((state === "done" || state === "stop") && !reduced) animate(S[id].draw, { scale: [1, 1.05, 1], duration: dur.seal + dur.press, ease: fn(ease.snapSettle) });
  };
  const logLine = (id: Id, key: string, ms: number) => {
    const li = el("li", "tw-log-line");
    li.append(tx(el("span", "tw-log-st"), `tw.st.${id}`), tx(el("span", "tw-log-text"), key), el("span", "tw-log-ms data", `${ms.toFixed(1)} ms`));
    log.append(li);
    if (!reduced) animate(li, { opacity: { from: 0, to: 1 }, x: { from: -8, to: 0 }, duration: dur.enter, ease: fn(ease.softLand) });
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
    logLine(id, `tw.log.${id}`, ms);
    return r;
  };
  const out = (id: Id, key: string, params: Record<string, string | number> = {}) => tx(S[id].out, key, params);
  const plain = (id: Id, text: string) => {
    untx(S[id].out);
    S[id].out.textContent = text;
  };

  let running = false;
  const reset = () => {
    IDS.forEach((id) => {
      mark(id, "idle");
      plain(id, "");
    });
    wires.forEach((w) => w.path.classList.remove("is-live"));
    log.replaceChildren();
    [invN, slipAN, slipBN, lookN, cmp.n1, cmp.n2].forEach((n) => (n.textContent = "········"));
    cmp.c1.textContent = cmp.c2.textContent = "····";
    ourRowN.textContent = "";
    sec.classList.remove("is-registered", "is-caught", "is-proven");
    shutter.setAttribute("height", "0");
    stampG.setAttribute("opacity", "0");
    proof.classList.remove("is-shown");
    for (const dd of [pN, pKey, pA, pB, pSize, pVerdict]) (untx(dd), (dd.textContent = dd === pVerdict ? "" : "—"));
  };

  const execute = async () => {
    if (running) return;
    running = true;
    execBtn.disabled = true;
    reset();
    tx(status, "tw.running");
    try {
      const w = await loadWasm();
      const k = await keys();
      const inv = await run("invoice", () => w.invoiceEncode(JSON.stringify(INVOICE)), (c) => {
        const n = w.invoiceNullifier(c);
        invN.textContent = n.slice(0, 8);
        plain("invoice", short(n));
      });
      await Promise.all([flow("invoice", "entryA"), flow("invoice", "entryB")]);
      type Entry = { memo: string; commitment: string };
      const a = await run("entryA", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finA), k.saltA)) as Entry, (r) => {
        slipAN.textContent = invN.textContent ?? "";
        plain("entryA", `→ ${short(r.commitment)}`);
      });
      const b = await run("entryB", () => JSON.parse(w.supplierRegisterEntry(k.supplier, inv, w.publicKey(k.finB), k.saltB)) as Entry, (r) => {
        slipBN.textContent = invN.textContent ?? "";
        plain("entryB", `→ ${short(r.commitment)}`);
      });
      await flow("entryA", "board");
      type Seen = { nullifier: string; financier_commitment: string };
      const onBoard = await run("board", () => JSON.parse(w.boardMemoDescribe(a.memo)) as Seen, (d) => {
        ourRowN.textContent = `${d.nullifier.slice(0, 8)}…`;
        sec.classList.add("is-registered");
        out("board", "tw.registered");
      });
      await Promise.all([flow("board", "lookup"), flow("entryB", "lookup")]);
      const seen = await run("lookup", () => JSON.parse(w.boardMemoDescribe(b.memo)) as Seen, (d) => {
        lookN.textContent = `${d.nullifier.slice(0, 8)}…`;
        out("lookup", d.nullifier === onBoard.nullifier ? "tw.found" : "tw.notFound");
      });
      await flow("lookup", "same");
      const caught = await run("same", () => seen.nullifier === onBoard.nullifier && seen.financier_commitment !== onBoard.financier_commitment, () => {
        cmp.n1.textContent = onBoard.nullifier.slice(0, 8);
        cmp.n2.textContent = seen.nullifier.slice(0, 8);
        cmp.c1.textContent = onBoard.financier_commitment.slice(0, 6);
        cmp.c2.textContent = seen.financier_commitment.slice(0, 6);
        sec.classList.add("is-caught");
        out("same", "tw.again");
      });
      if (!caught) throw new Error("the two entries do not collide");
      await Promise.all([flow("same", "refuse"), flow("same", "proof")]);
      await run("refuse", () => true, () => {
        out("refuse", "tw.refused");
        if (reduced) {
          shutter.setAttribute("height", "52");
          stampG.setAttribute("opacity", "1");
          return;
        }
        const sh = { h: 0 };
        animate(sh, { h: 52, duration: dur.seal, ease: fn(ease.snapSettle), onUpdate: () => shutter.setAttribute("height", sh.h.toFixed(1)) });
        animate(stampG, { opacity: { from: 0, to: 1 }, scale: { from: 1.7, to: 1 }, duration: dur.proof, delay: 200, ease: fn(ease.popOver) });
      }, true);
      const sig = w.buyerSignInvoice(k.master, 7, inv);
      const pf = await run("proof", () => w.doubleSignProof(inv, sig, a.memo, b.memo), (x) => plain("proof", `JTSP · ${b64len(x)} B ✓`));
      const r = JSON.parse(w.verifyProof(pf));
      pN.textContent = short(r.nullifier);
      tx(pKey, "tw.p.supplier", { k: short(r.supplier_pk) });
      tx(pA, "tw.p.commit", { k: short(r.first_commitment) });
      tx(pB, "tw.p.commit", { k: short(r.second_commitment) });
      tx(pSize, "tw.p.sizeVal", { n: b64len(pf) });
      tx(pVerdict, "tw.p.verdict");
      proof.classList.add("is-shown");
      sec.classList.add("is-proven");
      if (!reduced) animate(proof, { y: { from: 50, to: 0 }, rotate: { from: 6, to: -1.2 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 300, ease: fn(ease.softLand) });
      tx(status, "tw.done");
    } catch (e) {
      tx(status, "tw.stopped", { msg: (e as Error).message });
    } finally {
      running = false;
      execBtn.disabled = false;
    }
  };
  execBtn.addEventListener("click", execute);

  // warm the wasm as the chapter nears; run the flow the first time it is in view
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
  if (!reduced) sec.classList.add("is-waiting");
  inView(
    art,
    () => {
      if (!reduced) {
        sec.classList.remove("is-waiting");
        [kanji, h2, p, note].forEach((x, i) =>
          animate(x, { y: { from: 16, to: 0 }, filter: { from: "blur(8px)", to: "blur(0px)" }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: sibling(i), ease: fn(ease.softLand) }),
        );
        animate(art, { opacity: { from: 0, to: 1 }, y: { from: 20, to: 0 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
      }
      if (!ran) {
        ran = true;
        setTimeout(execute, reduced ? 0 : 700);
      }
    },
    { amount: 0.2 },
  );
  return sec;
}
