// The console's sign-in sheet (HNK-26.T21): the app's account sheet (src/auth.css) with the 印
// seal, plus the node's public facts at the foot.
import { h } from "../lib/ui";

const SVG = "http://www.w3.org/2000/svg";

function svg(tag: string, attrs: Record<string, string | number>, ...kids: Node[]): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

export function seal(): SVGElement {
  const t = svg("text", { x: 50, y: 67, "text-anchor": "middle", class: "kanji" });
  t.textContent = "印";
  return svg("svg", { viewBox: "0 0 100 100", class: "auth-logo", "aria-hidden": "true" }, svg("circle", { cx: 50, cy: 50, r: 44, class: "ring" }), svg("circle", { cx: 50, cy: 50, r: 36, class: "ring-fine" }), t);
}

export interface Sheet {
  root: HTMLElement;
  title: HTMLElement;
  lede: HTMLElement;
  body: HTMLElement;
  facts: HTMLElement;
  foot: HTMLElement;
}

export function sheet(title: string, lede: string): Sheet {
  const t = h("h1", { class: "auth-title", id: "title" }, title);
  const l = h("p", { class: "auth-sub" }, lede);
  const body = h("div", { class: "console-body" });
  const facts = h("dl", { class: "auth-facts" });
  const foot = h("footer", { class: "auth-foot" }, h("p", { class: "auth-host" }, `Passkeys work only on this address: ${location.host}`));
  const root = h(
    "main",
    { class: "auth" },
    h("section", { class: "auth-sheet", "aria-labelledby": "title" }, h("header", { class: "auth-head" }, seal(), h("p", { class: "auth-eyebrow" }, "Financier node"), t, l), body, facts, foot),
  );
  return { root, title: t, lede: l, body, facts, foot };
}

export function fact(dl: HTMLElement, term: string, value: string, mono = false, title?: string): void {
  dl.append(h("dt", {}, term), h("dd", { class: mono ? "is-mono" : undefined, title }, value));
}

export function verdict(glyph: string, title: string, text: string): HTMLElement {
  return h("div", { class: "auth-verdict" }, h("div", { class: "hanko", "aria-hidden": "true" }, glyph), h("h2", { class: "auth-title" }, title), h("p", { class: "auth-sub" }, text));
}
