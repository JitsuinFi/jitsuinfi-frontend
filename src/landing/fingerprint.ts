// Chapter 2, "One fingerprint": the visitor edits the hero's test invoice and its fingerprint N is
// computed again in the browser by jitsuin-wasm (BLAKE2b-256 over the canonical invoice bytes,
// personal string "JitsuinNullifier"). One zat more and N changes almost everywhere; put it back
// and N is the same again, already on the board. Nothing leaves the page.
import { animate, stagger, svg as animeSvg } from "animejs";
import { inView } from "motion";
import { dur, ease, sibling } from "./motion";
import { createPrintView } from "./print";
import { loadWasm, type Wasm } from "./wasm";

/// The hero invoice (scripts/landing-keys.mjs): test keys from TES- labels; the buyer key is index 7 of a TES- master.
const BASE = {
  invoice_id: "TES-INV-0007",
  supplier_pk: "ed7ed2ff196e991257fa507e384dfea6fac4c66725e4b2dfc35861291421af8b",
  buyer_pk: "31124f793c6ba885185323f324eda73befe068565037e6c31c5c36935b63abb8",
  amount_zat: 40000,
  issue_date: 20745,
  due_date: 20805,
  terms_hash: "4b5958693a4f019b7de30dda6ee98ffc9d8412dfa2a7648d4095aba299950b77",
};
/// N of BASE: it is on the public board (hero, board row 7).
const ON_BOARD = "f9755d220e9d52da8b392467aeb63c6fc7cbaaf2cb23972a24ae715bb0825cd5";

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;
const days = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86_400_000);
const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);

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


export function mountFingerprint(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter fp-chapter");
  sec.id = "story";
  sec.setAttribute("aria-labelledby", "fp-title");

  // caption (the 35%)
  const cap = el("div", "chapter-cap");
  const kanji = el("p", "chapter-kanji", "指紋 · Chapter 2");
  const h2 = el("h2", "chapter-title", "One fingerprint per invoice.");
  h2.id = "fp-title";
  const p = el("p", "chapter-lede", "N is a BLAKE2b-256 hash of the invoice’s exact bytes. The same invoice always gives the same N; change one zat and almost every digit changes. The board keeps N, never the invoice.");
  const note = el("p", "chapter-note", "Try it: this runs jitsuin-wasm in your browser. Nothing is sent.");
  cap.append(kanji, h2, p, note);

  // the visual: the invoice sheet, the press, the fingerprint
  const vis = el("div", "fp-visual");

  const sheet = el("form", "fp-sheet");
  sheet.setAttribute("aria-label", "Test invoice");
  sheet.addEventListener("submit", (e) => e.preventDefault());
  const head = el("div", "fp-sheet-head");
  head.append(el("span", "fp-sheet-title", "Invoice"), el("span", "fp-sheet-no data", BASE.invoice_id));
  const rows = el("div", "fp-rows");
  const fixed = (k: string, v: string) => {
    const r = el("div", "fp-row");
    r.append(el("span", "fp-key", k), el("span", "fp-val data", v));
    rows.append(r);
    return r;
  };
  fixed("Supplier", short(BASE.supplier_pk));
  fixed("Buyer", short(BASE.buyer_pk));
  // editable: amount (zat) with one-zat steps, and the due date
  const amtRow = el("div", "fp-row fp-edit");
  const amtLabel = el("label", "fp-key", "Amount (zat)");
  amtLabel.htmlFor = "fp-amount";
  const amtWrap = el("span", "fp-val fp-amount");
  const minus = el("button", "fp-step", "−1");
  minus.type = "button";
  minus.setAttribute("aria-label", "One zat less");
  const amount = el("input", "fp-input data");
  amount.id = "fp-amount";
  amount.type = "number";
  amount.min = "1";
  amount.step = "1";
  amount.inputMode = "numeric";
  amount.value = String(BASE.amount_zat);
  const plus = el("button", "fp-step", "+1");
  plus.type = "button";
  plus.setAttribute("aria-label", "One zat more");
  amtWrap.append(minus, amount, plus);
  amtRow.append(amtLabel, amtWrap);
  rows.append(amtRow);
  const dueRow = el("div", "fp-row fp-edit");
  const dueLabel = el("label", "fp-key", "Due");
  dueLabel.htmlFor = "fp-due";
  const due = el("input", "fp-input fp-date data");
  due.id = "fp-due";
  due.type = "date";
  due.value = iso(BASE.due_date);
  const dueVal = el("span", "fp-val");
  dueVal.append(due);
  dueRow.append(dueLabel, dueVal);
  rows.append(dueRow);
  fixed("Terms", short(BASE.terms_hash));
  const reset = el("button", "fp-reset ink-link", "Back to TES-INV-0007");
  reset.type = "button";
  sheet.append(head, rows, reset);

  // the press: threads from the fields into the hash, then out to N
  const press = el("div", "fp-press");
  press.setAttribute("aria-hidden", "true");
  const threads = svg("svg", { class: "fp-threads", viewBox: "0 0 200 300", preserveAspectRatio: "none" });
  const paths: SVGPathElement[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 40 + i * 44;
    const path = svg("path", { d: `M0 ${y} C 90 ${y}, 90 150, 200 150`, class: "fp-thread" }) as SVGPathElement;
    threads.append(path);
    paths.push(path);
  }
  const pulse = svg("circle", { r: 4.5, class: "fp-pulse", cx: -10, cy: -10, opacity: 0 });
  threads.append(pulse);
  const hashMark = el("div", "fp-hash");
  hashMark.append(el("span", "fp-hash-name", "BLAKE2b-256"), el("span", "fp-hash-key data", "“JitsuinNullifier”"));
  press.append(threads, hashMark);

  const out = el("div", "fp-out");
  out.append(el("p", "fp-out-label", "Fingerprint N"));
  // N drawn as an illustrated fingerprint, with callouts for the bytes that shape it
  const print = createPrintView();
  const printBox = el("div", "fp-print-box");
  printBox.append(print.el);
  print.set(ON_BOARD, false);
  out.append(printBox);
  const grid = el("div", "fp-grid data");
  grid.setAttribute("role", "status");
  grid.setAttribute("aria-live", "polite");
  const digits: HTMLSpanElement[] = [];
  for (let r = 0; r < 4; r++) {
    const line = el("span", "fp-line");
    for (let c = 0; c < 16; c++) {
      const d = el("span", "fp-digit", ON_BOARD[r * 16 + c]);
      digits.push(d);
      line.append(d);
    }
    grid.append(line);
  }
  const srN = el("span", "sr-only", `N ${ON_BOARD}`);
  grid.append(srN);
  const changed = el("p", "fp-changed", "The invoice as registered.");
  const boardRow = el("div", "fp-board");
  const boardN = el("span", "fp-board-n data", `${ON_BOARD.slice(0, 8)}…${ON_BOARD.slice(-6)}`);
  const boardSt = el("span", "fp-board-st", "already on the board");
  boardRow.append(el("span", "fp-board-tag", "登記簿"), boardN, boardSt);
  out.append(grid, changed, boardRow);

  vis.append(sheet, press, out);
  sec.append(cap, vis);
  root.append(sec);

  // ---------- computing N ----------
  let current = ON_BOARD;
  const load = (): Promise<Wasm> => loadWasm();
  const HEX = "0123456789abcdef";

  const show = (n: string, from: string) => {
    const diff = [...n].filter((ch, i) => ch !== from[i]).length;
    srN.textContent = `N ${n}`;
    if (n === ON_BOARD) changed.textContent = diff ? `Back to the registered invoice: ${diff} of 64 digits changed back.` : "The invoice as registered.";
    else changed.textContent = `${diff} of 64 digits changed.`;
    boardRow.classList.toggle("is-new", n !== ON_BOARD);
    boardN.textContent = `${n.slice(0, 8)}…${n.slice(-6)}`;
    boardSt.textContent = n === ON_BOARD ? "already on the board · a second financing is refused" : "new fingerprint · not on the board";
    print.set(n, !reduced);
    if (reduced) {
      digits.forEach((d, i) => (d.textContent = n[i]));
      return;
    }
    // each changed digit cycles 3-6 glyphs over 400ms, left to right, 20ms apart
    const clock = { t: 0 };
    const total = dur.enter + 64 * 20;
    digits.forEach((d, i) => d.classList.toggle("is-hot", n[i] !== from[i]));
    animate(clock, {
      t: total,
      duration: total,
      ease: "linear",
      onUpdate: () =>
        digits.forEach((d, i) => {
          if (n[i] === from[i]) return;
          const k = (clock.t - i * 20) / dur.enter;
          if (k <= 0) return;
          if (k >= 1) {
            d.textContent = n[i];
            d.classList.remove("is-hot");
            return;
          }
          d.textContent = HEX[(i * 7 + Math.floor(k * (3 + (i % 4))) * 5) % 16];
        }),
      onComplete: () => digits.forEach((d, i) => ((d.textContent = n[i]), d.classList.remove("is-hot"))),
    });
    // a pulse runs each thread into the press
    if (!reduced) {
      paths.forEach((path, i) => {
        const len = path.getTotalLength();
        const q = { t: 0 };
        animate(q, {
          t: 1,
          duration: dur.enter + 200,
          delay: sibling(i),
          ease: fn(ease.softInOut),
          onUpdate: () => {
            if (i !== 2) return; // one visible pulse; the threads themselves light
            const pt = path.getPointAtLength(len * q.t);
            pulse.setAttribute("cx", pt.x.toFixed(1));
            pulse.setAttribute("cy", pt.y.toFixed(1));
            pulse.setAttribute("opacity", q.t < 0.98 ? "1" : "0");
          },
        });
        path.classList.add("is-lit");
        setTimeout(() => path.classList.remove("is-lit"), dur.enter + 400 + sibling(i));
      });
      animate(hashMark, { scale: [1, 1.06, 1], duration: dur.seal + dur.press, delay: 300, ease: fn(ease.snapSettle) });
    }
  };

  let pending = 0;
  const recompute = async () => {
    const ticket = ++pending;
    const amt = Math.max(1, Math.floor(Number(amount.value) || 0));
    const dueDays = due.value ? days(due.value) : BASE.due_date;
    try {
      const w = await load();
      if (ticket !== pending) return;
      const code = w.invoiceEncode(JSON.stringify({ ...BASE, amount_zat: amt, due_date: dueDays }));
      const n = w.invoiceNullifier(code);
      if (n === current) return;
      const from = current;
      current = n;
      show(n, from);
    } catch (e) {
      changed.textContent = `That invoice is not valid: ${(e as Error).message}`;
    }
  };
  amount.addEventListener("input", recompute);
  due.addEventListener("change", recompute);
  minus.addEventListener("click", () => ((amount.value = String(Math.max(1, Number(amount.value) - 1))), recompute()));
  plus.addEventListener("click", () => ((amount.value = String(Number(amount.value) + 1)), recompute()));
  reset.addEventListener("click", () => {
    amount.value = String(BASE.amount_zat);
    due.value = iso(BASE.due_date);
    recompute();
  });

  // ---------- entry ----------
  // the wasm loads when the chapter comes near, the scene enters when it is in view
  const io = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        void load();
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
        animate(sheet, { y: { from: 24, to: 0 }, rotate: { from: -2, to: -0.8 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: 120, ease: fn(ease.softLand) });
        const drawn = animeSvg.createDrawable(paths);
        animate(drawn, { draw: ["0 0", "0 1"], duration: dur.ripple, delay: stagger(67, { start: 300 }), ease: fn(ease.softInOut) });
        animate(hashMark, { scale: { from: 0.6, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: 700, ease: fn(ease.snapSettle) });
        // the print draws itself in
        setTimeout(() => print.set(current, true), 900); // the N on the sheet now, which may already be edited
        animate(out, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, duration: dur.enter, delay: 900, ease: fn(ease.softLand) });
      },
      { amount: 0.3 },
    );
  }
  return sec;
}
