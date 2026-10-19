// Chapter 5, "Paid, and remembered" (履歴): the buyer's history as a paper ribbon, April to December.
// Each invoice the buyer was given is a seal at its due date; a red thread joins the seals (each
// history certificate commits to the one before), and a line ties each seal to its entry on the
// public board. Everything is real jitsuin-wasm in the browser: eight certificates, the register
// entries that carry their tags, the buyer's repayments and the financier's settlements, then
// verifyHistory as a new financier would run it. "Pay" settles TES-INV-0007 by ZIP-321; "Hide the
// late invoice" leaves certificate 4 out, and the check refuses the history.
import { animate, stagger, svg as animeSvg } from "animejs";
import { inView } from "motion";
import { getLang, onLang, tx } from "./i18n";
import { dur, ease } from "./motion";
import { labelKey, loadWasm, type Wasm } from "./wasm";

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;
const day = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const TODAY = day("2026-10-19");
const GRACE = 7;
const PAY_TO = "utest1landingfinanciera";
/// The buyer's invoices (scripts/landing-keys.mjs): index i of the TES- master is TES-INV-000i;
/// 0..6 are paid, 7 is the landing invoice, still open.
const BOOK = [
  { amount: 25000, due: "2026-04-15", paid: "2026-04-14" },
  { amount: 32000, due: "2026-05-15", paid: "2026-05-15" },
  { amount: 18000, due: "2026-06-12", paid: "2026-06-10" },
  { amount: 40000, due: "2026-07-15", paid: "2026-07-15" },
  { amount: 27500, due: "2026-08-14", paid: "2026-08-17" },
  { amount: 36000, due: "2026-09-15", paid: "2026-09-15" },
  { amount: 30000, due: "2026-10-15", paid: "2026-10-13" },
  { amount: 40000, due: "2026-12-18", paid: null },
] as const;
const HERO = 7;
const LATE = 4;
const MONTHS = ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"];

type Outcome = "PaidOnTime" | "PaidLate" | "Default" | "Open";
type Report = { on_time: number; late: number; defaults: number; open: number; lines: { index: number; nullifier: string; outcome: Outcome }[] };

/** Ribbon space: u runs along time (60..1140), v across it (the board is at negative v). */
const U0 = day("2026-04-01");
const U1 = day("2026-12-31");
const uOf = (d: number) => 60 + ((d - U0) / (U1 - U0)) * 1080;
type Layout = { box: [number, number]; at: (u: number, v: number) => [number, number]; tall: boolean };
const WIDE: Layout = { box: [1200, 400], at: (u, v) => [u, 214 + v], tall: false };
const TALL: Layout = { box: [420, 980], at: (u, v) => [214 + v, 30 + (u - 20) * 0.82], tall: true };

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
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Apr" or "4月14日"; with `month`, "Apr" or "4月". */
const dateFmt = (d: number, month = false) => {
  const at = new Date(d * 86400000);
  const m = at.getUTCMonth();
  const dd = at.getUTCDate();
  if (getLang() === "zh") return month ? `${m + 1}月` : `${m + 1}月${dd}日`;
  return month ? MON[m] : `${dd} ${MON[m]}`;
};

export function mountHistory(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter hs-chapter");
  sec.id = "history";
  sec.setAttribute("aria-labelledby", "hs-title");

  // ---------- the ribbon, edge to edge ----------
  const stage = el("div", "hs-stage");
  const art = svg("svg", { class: "hs-art", role: "img" }) as SVGSVGElement;
  const title = tx(svg("title"), "hs.aria");
  art.append(title);
  stage.append(art);

  // ---------- under it: the caption, the actions, the tally ----------
  const below = el("div", "hs-below");
  const cap = el("div", "chapter-cap hs-cap");
  const kanji = tx(el("p", "chapter-kanji"), "hs.kanji");
  const h2 = tx(el("h2", "chapter-title"), "hs.title");
  h2.id = "hs-title";
  const lede = tx(el("p", "chapter-lede"), "hs.lede");
  const note = tx(el("p", "chapter-note"), "hs.note");
  cap.append(kanji, h2, lede, note);

  const act = el("div", "hs-act");
  const payBtn = el("button", "seal-btn hs-pay");
  payBtn.type = "button";
  const payLabel = tx(el("span", "seal-btn-label"), "hs.pay");
  payBtn.append(payLabel);
  const links = el("div", "hs-links");
  const hideBtn = tx(el("button", "ink-link hs-hide"), "hs.hide");
  hideBtn.type = "button";
  const resetBtn = tx(el("button", "ink-link hs-reset"), "hs.reset");
  resetBtn.type = "button";
  links.append(hideBtn, resetBtn);
  // the repayment slip: the ZIP-321 request the buyer's wallet pays, drawn by jitsuin-wasm
  const slip = el("figure", "hs-slip");
  const qr = el("div", "hs-qr");
  const slipCap = el("figcaption", "hs-slip-cap");
  slipCap.append(tx(el("span", "hs-slip-title"), "hs.slip"), tx(el("span", "hs-slip-to"), "hs.slipTo"), el("span", "hs-slip-uri data"));
  slip.append(qr, slipCap);
  act.append(payBtn, links, slip);

  const tally = el("div", "hs-tally");
  tally.setAttribute("role", "status");
  tally.setAttribute("aria-live", "polite");
  const nums = el("dl", "hs-nums");
  const num = (key: string, cls: string) => {
    const g = el("div", `hs-num ${cls}`);
    const dd = el("dd", "hs-num-v", "–");
    g.append(dd, tx(el("dt", "hs-num-k"), key));
    nums.append(g);
    return dd;
  };
  const nOnTime = num("hs.t.onTime", "is-ok");
  const nLate = num("hs.t.late", "is-late");
  const nDefault = num("hs.t.default", "is-default");
  const nOpen = num("hs.t.open", "is-open");
  const verdict = tx(el("p", "hs-verdict"), "hs.working");
  const stats = el("p", "hs-stats data");
  tally.append(nums, verdict, stats);

  below.append(cap, act, tally);
  sec.append(stage, below);
  root.append(sec);

  // ---------- the real history ----------
  type Book = {
    w: Wasm;
    certs: string[];
    ns: string[];
    board: unknown[];
    identity: string;
    finPk: string;
    hero: { inv: string; letter: string; finSk: string };
  };
  let book: Book | null = null;
  const build = async (): Promise<Book> => {
    const w = await loadWasm();
    const supplier = await labelKey("TES-landing-supplier");
    const master = await labelKey("TES-landing-buyer-master");
    const finSk = await labelKey("TES-landing-financier-a");
    const finPk = w.publicKey(finSk);
    const supplierPk = w.publicKey(supplier);
    const certs: string[] = [];
    const ns: string[] = [];
    const board: unknown[] = [];
    let hero = { inv: "", letter: "", finSk };
    const post = (memo: string, k: number) =>
      board.push({ txid: (k % 16).toString(16).repeat(64), height: 4_500_000 + k, tx_index: 0, output_index: 0, memo });
    for (let i = 0; i < BOOK.length; i++) {
      const b = BOOK[i];
      const id = `TES-INV-000${i}`;
      const due = day(b.due);
      const inv = w.invoiceEncode(
        JSON.stringify({
          invoice_id: id,
          supplier_pk: supplierPk,
          buyer_pk: JSON.parse(w.buyerKeys(master, i)).invoice_pk,
          amount_zat: b.amount,
          issue_date: i === HERO ? TODAY : due - 60,
          due_date: due,
          terms_hash: await labelKey(`${id} terms: 60 days net`),
        }),
      );
      ns.push(w.invoiceNullifier(inv));
      const cert = w.buyerHistoryCert(master, i, inv, finPk, certs[i - 1] ?? "");
      certs.push(cert);
      post(JSON.parse(w.supplierRegisterHistoryEntry(supplier, inv, finPk, await labelKey(`TES-landing-salt-h${i}`), cert)).memo, 2 * i);
      const letter = w.assignmentEncode(inv, finPk, PAY_TO, await labelKey(`${id} assignment terms`));
      if (b.paid) {
        const pay = JSON.parse(w.buyerRepayment(master, i, inv, letter, day(b.paid)));
        post(JSON.parse(w.financierSettle(finSk, inv, letter, pay.memo)).memo, 2 * i + 1);
      } else hero = { inv, letter, finSk };
    }
    const identity = JSON.parse(w.buyerKeys(master, 0)).identity_pk;
    // the master stays here: the repayment of the open invoice needs the buyer's key
    heroMaster = master;
    return { w, certs, ns, board, identity, finPk, hero };
  };
  let heroMaster = "";

  // ---------- state ----------
  let paid = false;
  let hidden = false;
  let report: Report | null = null;
  // the stamps show what the board settled, so a refused check (an invoice left out) keeps them
  let settledAs = new Map<number, Outcome>();
  let error = "";
  const check = (b: Book) => {
    const certs = hidden ? b.certs.filter((_, i) => i !== LATE) : b.certs;
    const t0 = performance.now();
    try {
      const r: Report = JSON.parse(b.w.verifyHistory(JSON.stringify(certs), b.identity, JSON.stringify([b.finPk]), JSON.stringify(b.board), TODAY, GRACE));
      report = r;
      settledAs = new Map(r.lines.map((l) => [l.index, l.outcome]));
      error = "";
    } catch (e) {
      report = null;
      error = (e as Error).message ?? String(e);
    }
    const ms = performance.now() - t0;
    tx(stats, "hs.stats", { c: certs.length, e: b.board.length, ms: ms.toFixed(1) });
  };
  const outcomeOf = (i: number): Outcome | null => settledAs.get(i) ?? null;

  // ---------- drawing (redrawn whole on a layout or language switch; animations act on it) ----------
  type Mark = { g: SVGGElement; imp: SVGGElement; ring: SVGElement; stamp: SVGGElement; anchor: SVGElement };
  let marks: Mark[] = [];
  let threads: SVGPathElement[] = [];
  const tallQuery = matchMedia("(max-width: 700px)");
  const layout = () => (tallQuery.matches ? TALL : WIDE);

  const draw = () => {
    const L = layout();
    const P = (u: number, v: number) => L.at(u, v);
    art.replaceChildren(title);
    art.setAttribute("viewBox", `0 0 ${L.box[0]} ${L.box[1]}`);
    art.classList.toggle("is-tall", L.tall);
    const line = (u0: number, v0: number, u1: number, v1: number, cls: string) => {
      const [x0, y0] = P(u0, v0);
      const [x1, y1] = P(u1, v1);
      return svg("path", { d: `M${x0} ${y0} L${x1} ${y1}`, class: cls });
    };
    // the board, as one rule all entries hang from
    const BV = -140;
    art.append(line(-40, BV, 1240, BV, "hs-board-rule"));
    {
      // the board's name sits above its rule, clear of the N labels that hang under it
      const [x, y] = P(L.tall ? 30 : 60, BV - 44);
      art.append(svg("text", { x: L.tall ? x - 20 : x, y: L.tall ? y + 24 : y, class: "hs-board-name", "text-anchor": L.tall ? "middle" : "start" }, "登記簿"));
      if (!L.tall) art.append(tx(svg("text", { x: x + 62, y, class: "hs-board-sub" }), "hs.board"));
    }
    // the ribbon
    const [rx0, ry0] = P(-40, -34);
    const [rx1, ry1] = P(1240, 34);
    art.append(svg("rect", { x: Math.min(rx0, rx1), y: Math.min(ry0, ry1), width: Math.abs(rx1 - rx0), height: Math.abs(ry1 - ry0), class: "hs-ribbon" }));
    art.append(line(-40, -34, 1240, -34, "hs-ribbon-edge"), line(-40, 34, 1240, 34, "hs-ribbon-edge"));
    // months
    MONTHS.forEach((m) => {
      const u = uOf(day(m));
      art.append(line(u, 26, u, 34, "hs-tick"));
      const [x, y] = P(u + (L.tall ? 0 : 6), L.tall ? 48 : 52);
      art.append(svg("text", { x: L.tall ? x + 6 : x, y: L.tall ? y + 4 : y, class: "hs-month", "text-anchor": "start" }, dateFmt(day(m), true)));
    });
    // today
    {
      const u = uOf(TODAY);
      art.append(line(u, -72, u, 34, "hs-today"));
      const [x, y] = P(u, -72);
      art.append(tx(svg("text", { x: L.tall ? x - 8 : x + 8, y: L.tall ? y + 18 : y + 4, class: "hs-today-label", "text-anchor": L.tall ? "end" : "start" }), "hs.today"));
    }
    // the thread: one segment per link, sagging a little between seals
    threads = [];
    for (let i = 1; i < BOOK.length; i++) {
      const ua = uOf(day(BOOK[i - 1].due));
      const ub = uOf(day(BOOK[i].due));
      const [x0, y0] = P(ua, 0);
      const [x1, y1] = P(ub, 0);
      const [cx, cy] = P((ua + ub) / 2, 16);
      const p = svg("path", { d: `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`, class: "hs-thread" }) as SVGPathElement;
      art.append(p);
      threads.push(p);
    }
    // the seals
    marks = BOOK.map((b, i) => {
      const u = uOf(day(b.due));
      const [x, y] = P(u, 0);
      const g = svg("g", { class: "hs-mark" }) as SVGGElement;
      const anchor = line(u, -26, u, BV, "hs-anchor");
      const [ax, ay] = P(u, BV - 12);
      const nLabel = svg("text", { x: L.tall ? ax - 8 : ax, y: L.tall ? ay + 4 : ay, class: "hs-n", "text-anchor": L.tall ? "end" : "middle" }, book ? book.ns[i].slice(0, 8) : "········");
      const dot = svg("circle", { cx: P(u, BV)[0], cy: P(u, BV)[1], r: 3.2, class: "hs-anchor-dot" });
      const ring = svg("circle", { cx: x, cy: y, r: 23, class: "hs-ring" });
      const imp = svg("g", { class: "hs-imp" }) as SVGGElement;
      imp.append(svg("circle", { cx: x, cy: y, r: 22, class: "hs-imp-disc" }), svg("circle", { cx: x, cy: y, r: 17.5, class: "hs-imp-fine" }), svg("text", { x, y: y + 7.5, "text-anchor": "middle", class: "hs-imp-kanji" }, "買"));
      // under the ribbon: the date, then the verdict stamp
      const [dx, dy] = P(u, L.tall ? 64 : 64);
      const date = svg("text", { x: L.tall ? dx - 20 : dx, y: L.tall ? dy - 4 : dy, "text-anchor": L.tall ? "start" : "middle", class: "hs-date" });
      const sub = svg("text", { x: L.tall ? dx - 20 : dx, y: L.tall ? dy + 12 : dy + 16, "text-anchor": L.tall ? "start" : "middle", class: "hs-sub" });
      const o = outcomeOf(i);
      const settledOnTime = o === "PaidOnTime";
      const paidLate = o === "PaidLate";
      if (b.paid) {
        tx(date, "hs.paidOn", { d: dateFmt(day(b.paid)) });
        if (paidLate) tx(sub, "hs.late", { n: day(b.paid) - day(b.due) });
        else tx(sub, "hs.onTime");
      } else if (paid) {
        tx(date, "hs.paidOn", { d: dateFmt(TODAY) });
        tx(sub, "hs.onTime");
      } else {
        tx(date, "hs.due", { d: dateFmt(day(b.due)) });
        tx(sub, "hs.open");
      }
      const [sx, sy] = P(u, L.tall ? 128 : 112);
      // the placed group keeps its transform; the inner one is what moves (CSS would replace it)
      const stampAt = svg("g", { transform: `translate(${L.tall ? sx + 18 : sx} ${sy}) rotate(${-8 + (i % 3) * 5})` });
      const stamp = svg("g", { class: `hs-stamp${paidLate ? " is-late" : ""}` }) as SVGGElement;
      stampAt.append(stamp);
      stamp.append(svg("rect", { x: -15, y: -15, width: 30, height: 30, rx: 3, class: "hs-stamp-box" }), svg("text", { x: 0, y: 7, "text-anchor": "middle", class: "hs-stamp-kanji" }, paidLate ? "遅" : "済"));
      g.append(anchor, dot, nLabel, ring, imp, date, sub, stampAt);
      g.classList.toggle("is-sealed", !!b.paid || paid);
      g.classList.toggle("is-stamped", settledOnTime || paidLate);
      g.classList.toggle("is-hero", i === HERO);
      g.classList.toggle("is-hidden", hidden && i === LATE);
      art.append(g);
      return { g, imp, ring, stamp, anchor };
    });
    threads.forEach((p, k) => {
      const i = k + 1;
      p.classList.toggle("is-on", i < HERO || paid);
      p.classList.toggle("is-cut", hidden && (i === LATE || i === LATE + 1));
    });
  };

  const paintTally = () => {
    const set = (dd: HTMLElement, v: number | null) => (dd.textContent = v === null ? "–" : String(v));
    set(nOnTime, report?.on_time ?? null);
    set(nLate, report?.late ?? null);
    set(nDefault, report?.defaults ?? null);
    set(nOpen, report?.open ?? null);
    tally.classList.toggle("is-caught", !!error);
    if (error) tx(verdict, "hs.caught", { msg: error });
    else if (report) tx(verdict, "hs.ok", { n: report.lines.length });
  };
  const paintActions = () => {
    payBtn.disabled = paid || hidden || !book;
    tx(payLabel, paid ? "hs.paid" : "hs.pay");
    tx(hideBtn, hidden ? "hs.unhide" : "hs.hide");
    hideBtn.disabled = !book;
  };
  const repaint = () => {
    draw();
    paintTally();
    paintActions();
  };
  onLang(() => (book || marks.length ? repaint() : undefined));
  tallQuery.addEventListener("change", repaint);
  draw();
  paintActions();

  // ---------- motion ----------
  const enter = () => {
    if (reduced) return;
    // seals press down left to right, the thread draws behind them, the stamps land last
    marks.forEach((m, i) => {
      const delay = 200 + i * 140;
      animate(m.anchor, { opacity: { from: 0, to: 1 }, duration: dur.enter, delay, ease: fn(ease.softLand) });
      if (m.g.classList.contains("is-sealed"))
        animate(m.imp, { scale: { from: 1.8, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay, ease: fn(ease.snapSettle) });
      if (m.g.classList.contains("is-stamped"))
        animate(m.stamp, { scale: { from: 1.6, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: delay + 260, ease: fn(ease.snapSettle) });
    });
    const on = threads.filter((p) => p.classList.contains("is-on"));
    animate(animeSvg.createDrawable(on), { draw: ["0 0", "0 1"], duration: 260, delay: stagger(140, { start: 340 }), ease: fn(ease.softInOut) });
    animate([nOnTime, nLate, nDefault, nOpen].map((d) => d.parentElement!), { y: { from: 18, to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 100, delay: stagger(67, { start: 200 + BOOK.length * 140 }), ease: fn(ease.softLand) });
  };

  const pay = async () => {
    if (!book || paid || hidden) return;
    payBtn.disabled = true;
    const b = book;
    // the buyer's wallet request: amount, the financier's address, the receipt in the memo
    const req = JSON.parse(b.w.buyerRepayment(heroMaster, HERO, b.hero.inv, b.hero.letter, TODAY));
    const doc = new DOMParser().parseFromString(req.qr_svg, "image/svg+xml").documentElement;
    doc.removeAttribute("width");
    doc.removeAttribute("height");
    doc.setAttribute("aria-hidden", "true");
    qr.replaceChildren(document.importNode(doc, true));
    const uri = slipCap.querySelector(".hs-slip-uri")!;
    uri.textContent = `${req.uri.slice(0, 34)}…`;
    slip.classList.add("is-shown");
    if (!reduced) {
      animate(slip, { y: { from: 24, to: 0 }, rotate: { from: -6, to: -1.5 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, ease: fn(ease.softLand) });
      await new Promise((r) => setTimeout(r, 1100));
    }
    // the financier sees the payment, countersigns, and the settlement goes on the board
    const settled = JSON.parse(b.w.financierSettle(b.hero.finSk, b.hero.inv, b.hero.letter, req.memo));
    b.board.push({ txid: "f".repeat(64), height: 4_500_020, tx_index: 0, output_index: 0, memo: settled.memo });
    paid = true;
    check(b);
    repaint();
    if (!reduced) {
      const m = marks[HERO];
      animate(m.imp, { scale: { from: 2.2, to: 1 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(6px)", to: "blur(0px)" }, duration: dur.seal, ease: fn(ease.snapSettle) });
      animate(animeSvg.createDrawable(threads[HERO - 1]), { draw: ["0 0", "0 1"], duration: dur.enter, delay: dur.seal, ease: fn(ease.softInOut) });
      animate(m.stamp, { scale: { from: 1.8, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: dur.seal + dur.enter, ease: fn(ease.snapSettle) });
      animate([nOnTime, nOpen], { scale: [1, 1.18, 1], duration: dur.proof, delay: dur.seal + dur.enter, ease: fn(ease.softInOut) });
    }
  };

  const hide = () => {
    if (!book) return;
    hidden = !hidden;
    check(book);
    repaint();
    if (reduced) return;
    const m = marks[LATE];
    if (hidden) {
      const tall = layout().tall;
      animate(m.g, { translateY: { from: 0, to: tall ? 0 : -18 }, translateX: { from: 0, to: tall ? 24 : 0 }, duration: dur.exit, ease: fn(ease.accelExit) });
      animate(tally, { x: [0, -6, 6, -3, 0], duration: dur.proof, delay: dur.micro, ease: "linear" });
    } else animate(m.g, { opacity: { from: 0.2, to: 1 }, duration: dur.enter, ease: fn(ease.softLand) });
  };
  const reset = () => {
    if (!book) return;
    paid = false;
    hidden = false;
    book.board = book.board.filter((e) => (e as { txid: string }).txid !== "f".repeat(64));
    slip.classList.remove("is-shown");
    qr.replaceChildren();
    check(book);
    repaint();
  };

  payBtn.addEventListener("click", pay);
  hideBtn.addEventListener("click", hide);
  resetBtn.addEventListener("click", reset);

  // build as soon as the chapter nears; play when it is in view
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    try {
      book = await build();
      check(book);
      repaint();
      enter();
    } catch (e) {
      tx(verdict, "hs.caught", { msg: (e as Error).message ?? String(e) });
    }
  };
  if (!reduced) sec.classList.add("is-waiting");
  inView(
    art,
    () => {
      sec.classList.remove("is-waiting");
      void start();
    },
    { amount: 0.25 },
  );
  return sec;
}
