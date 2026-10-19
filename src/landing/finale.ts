// Chapter 6, "It already happened" (結び): the close. One invoice, TES-INV-0003, lived its whole life
// on Zcash testnet (TEST-HNK-19, 2026-10-17): registered, advanced, repaid, settled, then offered to
// a second financier and caught. Its five real transactions lie on the page as sealed envelopes.
// Outsiders see what an explorer sees, a shielded transaction; the switch to the viewing key opens
// each envelope and shows what the parties read in its memo. Then the tagline and the way in.
import { animate, stagger } from "animejs";
import { inView } from "motion";
import { SPEC_URL } from "./hero";
import { t, ta, tx } from "./i18n";
import { dur, ease } from "./motion";

const SVG_NS = "http://www.w3.org/2000/svg";
const fn = (f: (t: number) => number) => () => f;

/// The testnet cycle of TES-INV-0003 as recorded in TEST-HNK-19 (I-HNK-19.1) and VID-06. Heights
/// only where they were recorded; fee 10000 zat on the four cycle transactions.
const TXS = [
  { id: "a", kanji: "登", txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", block: 4509299, fee: true },
  { id: "advance", kanji: "融", txid: "501e40dafff4d2b7bcedf1adb9535522dc8977b6c6c8f8d3da55e00574335ccb", block: null, fee: true },
  { id: "repay", kanji: "返", txid: "d59014b726554404fc5729c8699d0d029fab7a3900485241d632c50bf4aadaf0", block: null, fee: true },
  { id: "settled", kanji: "済", txid: "dcba74c63a701057d0e6e5f2cee4391b509d393c792801449c772c9552b7cad3", block: null, fee: true },
  { id: "b", kanji: "拒", txid: "05d5aa7a02a33c14d460922468745fb4d6d814daa83989eed22b21c0540c79eb", block: 4509521, fee: false },
] as const;

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

/** An envelope: back, the letter inside, the front pocket, the flap with its seal. */
function envelope(kanji: string) {
  const s = svg("svg", { viewBox: "0 0 220 170", class: "fn-env", "aria-hidden": "true" });
  const back = svg("rect", { x: 10, y: 50, width: 200, height: 112, rx: 4, class: "fn-env-back" });
  const letter = svg("g", { class: "fn-letter" }) as SVGGElement;
  letter.append(
    svg("rect", { x: 26, y: 58, width: 168, height: 100, rx: 2, class: "fn-letter-paper" }),
    svg("path", { d: "M42 76 H140 M42 90 H160 M42 104 H122 M42 118 H150", class: "fn-letter-rule" }),
    svg("text", { x: 172, y: 84, "text-anchor": "middle", class: "fn-letter-kanji" }, kanji),
  );
  // the pocket covers all but the notch the flap closes over, so their edges are one line
  const front = svg("path", { d: "M10 50 L110 116 L210 50 V162 H10 Z", class: "fn-env-front" });
  const folds = svg("path", { d: "M10 162 L92 104 M210 162 L128 104", class: "fn-env-fold" });
  // the flap turns on its top edge; the outer group keeps the position, the inner one moves
  const flapAt = svg("g", { transform: "translate(0 50)" });
  const flap = svg("g", { class: "fn-flap" }) as SVGGElement;
  flap.append(svg("path", { d: "M10 0 L110 66 L210 0 Z", class: "fn-flap-face" }));
  const seal = svg("g", { class: "fn-seal" });
  seal.append(svg("circle", { cx: 110, cy: 62, r: 17, class: "fn-seal-disc" }), svg("circle", { cx: 110, cy: 62, r: 13, class: "fn-seal-fine" }), svg("text", { x: 110, y: 69, "text-anchor": "middle", class: "fn-seal-kanji" }, kanji));
  flap.append(seal);
  flapAt.append(flap);
  s.append(back, letter, front, folds, flapAt);
  return { s, back, letter, flap, flapAt };
}

export function mountFinale(root: HTMLElement, reduced: boolean): HTMLElement {
  const sec = el("section", "chapter fn-chapter");
  sec.id = "on-testnet";
  sec.setAttribute("aria-labelledby", "fn-title");

  const head = el("header", "fn-head");
  const kanji = tx(el("p", "chapter-kanji"), "fn.kanji");
  const h2 = tx(el("h2", "chapter-title"), "fn.title");
  h2.id = "fn-title";
  const lede = tx(el("p", "chapter-lede"), "fn.lede");
  head.append(kanji, h2, lede);

  // who is looking: an outsider, or a party holding the viewing key
  const lens = el("div", "fn-lens");
  lens.setAttribute("role", "group");
  ta(lens, "aria-label", "fn.lens");
  const asOut = tx(el("button", "fn-lens-opt"), "fn.outsider");
  const asKey = tx(el("button", "fn-lens-opt"), "fn.withKey");
  for (const b of [asOut, asKey]) b.type = "button";
  lens.append(asOut, asKey);

  const row = el("ol", "fn-row");
  const items = TXS.map((x, i) => {
    const li = el("li", "fn-tx");
    const env = envelope(x.kanji);
    const step = el("p", "fn-step");
    step.append(el("span", "fn-step-n data", String(i + 1).padStart(2, "0")), tx(el("span", "fn-step-name"), `fn.${x.id}.name`));
    // the outside: what any explorer shows
    const outside = el("div", "fn-face fn-outside");
    const id = el("button", "fn-txid data");
    id.type = "button";
    id.textContent = `${x.txid.slice(0, 10)}…${x.txid.slice(-8)}`;
    ta(id, "aria-label", "fn.copy");
    id.title = x.txid;
    const facts = el("p", "fn-facts");
    const parts: [string, Record<string, string | number>?][] = [["fn.shielded"]];
    if (x.block) parts.push(["fn.block", { h: x.block.toLocaleString("en-US") }]);
    if (x.fee) parts.push(["fn.fee"]);
    facts.append(...parts.flatMap(([k, p], j) => (j ? [document.createTextNode(" · "), tx(el("span"), k, p)] : [tx(el("span"), k, p)])));
    outside.append(id, facts);
    // the inside: what the parties read in the memo
    const inside = el("div", "fn-face fn-inside");
    inside.append(tx(el("p", "fn-memo"), `fn.${x.id}.memo`));
    li.append(env.s, step, outside, inside);
    row.append(li);
    id.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(x.txid);
        id.textContent = t("fn.copied");
      } catch {
        // no clipboard: select the full id so it can be copied by hand
        id.textContent = x.txid;
        getSelection()?.selectAllChildren(id);
        return;
      }
      setTimeout(() => (id.textContent = `${x.txid.slice(0, 10)}…${x.txid.slice(-8)}`), 1400);
    });
    return { li, env };
  });

  const caption = tx(el("p", "fn-caption"), "fn.caption");

  // the close: the line, the way in
  const close = el("div", "fn-close");
  const line = el("p", "fn-line");
  line.append(tx(el("span", "fn-line-a"), "fn.line1"), tx(el("span", "fn-line-b"), "fn.line2"));
  const calls = el("div", "fn-calls");
  const demo = el("a", "seal-btn");
  demo.href = "/app.html";
  demo.append(tx(el("span", "seal-btn-label"), "hero.demo"));
  const spec = tx(el("a", "ink-link fn-spec"), "nav.spec");
  spec.href = SPEC_URL;
  spec.rel = "noreferrer";
  calls.append(demo, spec);
  const foot = el("footer", "fn-foot");
  foot.append(el("span", "fn-brand", "JitsuinFi"), tx(el("span"), "fn.foot"));
  close.append(line, calls, foot);

  sec.append(head, lens, row, caption, close);
  root.append(sec);

  // ---------- the switch ----------
  let open = false;
  const setOpen = (o: boolean, animated: boolean) => {
    open = o;
    sec.classList.toggle("is-open", o);
    asOut.setAttribute("aria-pressed", String(!o));
    asKey.setAttribute("aria-pressed", String(o));
    // an open flap lies behind the letter; a closed one over the pocket
    const layer = (behind: boolean) =>
      items.forEach(({ env }) => (behind ? env.back.after(env.flapAt) : env.s.append(env.flapAt)));
    if (!animated || reduced) return layer(o);
    if (o) setTimeout(() => layer(true), (dur.enter + 100) / 2 + 4 * 67);
    else layer(false);
    const flaps = items.map((x) => x.env.flap);
    const letters = items.map((x) => x.env.letter);
    if (o) {
      animate(flaps, { scaleY: { from: 1, to: -1 }, duration: dur.enter + 100, delay: stagger(67), ease: fn(ease.softInOut) });
      animate(letters, { translateY: { from: 0, to: -34 }, duration: dur.enter + 200, delay: stagger(67, { start: 220 }), ease: fn(ease.softLand) });
    } else {
      animate(letters, { translateY: { from: -34, to: 0 }, duration: dur.exit, delay: stagger(40), ease: fn(ease.accelExit) });
      animate(flaps, { scaleY: { from: -1, to: 1 }, duration: dur.enter, delay: stagger(40, { start: 200 }), ease: fn(ease.softInOut) });
    }
  };
  asOut.addEventListener("click", () => open && setOpen(false, true));
  asKey.addEventListener("click", () => !open && setOpen(true, true));
  setOpen(false, false);

  // ---------- entry: the envelopes are posted one by one ----------
  if (!reduced) sec.classList.add("is-waiting");
  inView(
    row,
    () => {
      if (reduced) return;
      sec.classList.remove("is-waiting");
      // each envelope lands with its own small tilt
      items.forEach((x, i) =>
        animate(x.li, { translateY: { from: -36, to: 0 }, rotate: { from: [-5, 3, -2, 4, -3][i], to: 0 }, opacity: { from: 0, to: 1 }, duration: dur.enter + 200, delay: i * 110, ease: fn(ease.softLand) }),
      );
      animate(items.map((x) => x.env.s.querySelector(".fn-seal")!), { scale: { from: 1.7, to: 1 }, opacity: { from: 0, to: 1 }, duration: dur.seal, delay: stagger(110, { start: 380 }), ease: fn(ease.snapSettle) });
    },
    { amount: 0.3 },
  );
  inView(
    close,
    () => {
      if (reduced) return;
      animate([...line.children, calls], { translateY: { from: 22, to: 0 }, opacity: { from: 0, to: 1 }, filter: { from: "blur(8px)", to: "blur(0px)" }, duration: dur.enter + 200, delay: stagger(120), ease: fn(ease.softLand) });
    },
    { amount: 0.4 },
  );
  return sec;
}
