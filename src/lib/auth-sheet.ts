// The consumer sign-in sheet's pieces (src/auth.css), shared by the app's account screen and the
// financier console (HNK-26.T21): the 印 seal, line icons, list rows, the primary button, links,
// a status message, the sheet, its head and the 3-step progress.
import { h } from "./ui";

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

/** The JitsuinFi seal mark: heavy ring, fine ring, 印. */
export function logo(): SVGElement {
  const t = svg("text", { x: 50, y: 67, "text-anchor": "middle", class: "kanji" });
  t.textContent = "印";
  return svg("svg", { viewBox: "0 0 100 100", class: "auth-logo", "aria-hidden": "true" }, svg("circle", { cx: 50, cy: 50, r: 44, class: "ring" }), svg("circle", { cx: 50, cy: 50, r: 36, class: "ring-fine" }), t);
}

export function icon(...paths: SVGElement[]): SVGElement {
  return svg("svg", { viewBox: "0 0 24 24", class: "auth-ico", "aria-hidden": "true" }, ...paths);
}
export const passkeyIcon = () => icon(svg("circle", { cx: 9, cy: 8, r: 3.5 }), svg("path", { d: "M3 19.5c0-3.3 2.7-5.5 6-5.5 1.2 0 2.3.3 3.2.8" }), svg("circle", { cx: 17.5, cy: 13.5, r: 2.5 }), svg("path", { d: "M17.5 16v5M17.5 18.5h2M17.5 20.5h1.5" }));
export const fingerIcon = () => icon(svg("path", { d: "M8 20c1-2 1.5-4.2 1.5-7a2.5 2.5 0 0 1 5 0c0 1.6-.2 3.2-.6 4.7M12 13c0 3.2-.6 5.6-1.8 7.6M5.5 16.5c.6-1.2 1-2.6 1-4.3a5.5 5.5 0 0 1 11 0c0 .8 0 1.6-.1 2.4M16.5 19.5c.3-.8.5-1.6.7-2.5" }));
export const keyIcon = () => icon(svg("circle", { cx: 8, cy: 12, r: 3.5 }), svg("path", { d: "M11.5 12H21M18 12v3M15 12v2" }));
export const syncIcon = () => icon(svg("path", { d: "M19 8a7.5 7.5 0 0 0-13.4-1.6M5 16a7.5 7.5 0 0 0 13.4 1.6M5 4v3.5h3.5M19 20v-3.5h-3.5" }));
export const lockIcon = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-small", "aria-hidden": "true" }, svg("rect", { x: 5, y: 10.5, width: 14, height: 9.5, rx: 2 }), svg("path", { d: "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" }));
export const chevron = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-chevron", "aria-hidden": "true" }, svg("path", { d: "M9.5 6l6 6-6 6" }));
export const check = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-check", "aria-hidden": "true" }, svg("path", { d: "M5.5 12.5l4 4 9-9" }));

/** A list row button: icon, label (and a line under it), trailing mark. Shows "waiting" while it runs. */
export function row(lead: Node, label: string, line: string | null, trail: Node | null, run: () => void | Promise<void>): HTMLButtonElement {
  const text = h("span", { class: "auth-row-text" }, h("span", { class: "auth-row-label" }, label), line ? h("span", { class: "auth-row-line" }, line) : null);
  const b = h("button", { type: "button", class: "auth-row" }, lead, text, trail ?? h("span", {}));
  b.addEventListener("click", () => busy(b, run));
  return b;
}

/** Disables the sheet's buttons while `run` works; `b` shows the waiting mark. */
export async function busy(b: HTMLButtonElement, run: () => void | Promise<void>): Promise<void> {
  const sheet = b.closest(".auth-sheet");
  sheet?.querySelectorAll("button").forEach((x) => (x.disabled = true));
  b.classList.add("is-waiting");
  try {
    await run();
  } finally {
    b.classList.remove("is-waiting");
    sheet?.querySelectorAll("button").forEach((x) => (x.disabled = false));
  }
}

export function primary(label: string, run: () => void | Promise<void>, type: "button" | "submit" = "button"): HTMLButtonElement {
  const b = h("button", { type, class: "auth-button is-primary" }, label);
  if (type === "button") b.addEventListener("click", () => busy(b, run));
  return b;
}

export function link(label: string, run: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "auth-link" }, label);
  b.addEventListener("click", run);
  return b;
}

export class Message {
  readonly el = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  show(text: string): void {
    this.el.textContent = text;
  }
  error(e: unknown): void {
    const m = e instanceof Error ? e.message : String(e);
    this.show(m.charAt(0).toUpperCase() + m.slice(1));
  }
  clear(): void {
    this.el.textContent = "";
  }
}

export function sheet(...children: Array<Node | null>): HTMLElement {
  return h("div", { class: "auth-sheet", role: "dialog", "aria-labelledby": "auth-title" }, ...children);
}

export function head(title: string, sub: string | null, step?: number, names?: string[]): HTMLElement {
  return h(
    "div",
    { class: "auth-head" },
    step ? steps(step, names) : logo(),
    h("h1", { class: "auth-title", id: "auth-title" }, title),
    sub ? h("p", { class: "auth-sub" }, sub) : null,
  );
}

/** Sign-up progress, three steps: by default account, passkey, ready. */
export function steps(n: number, names: string[] = ["Account", "Passkey", "Ready"]): HTMLElement {
  return h(
    "ol",
    { class: "auth-steps", "aria-label": `Step ${n} of 3` },
    ...names.map((name, i) => h("li", { class: i + 1 < n ? "is-done" : i + 1 === n ? "is-now" : undefined }, h("span", { class: "auth-steps-bar" }), name)),
  );
}

