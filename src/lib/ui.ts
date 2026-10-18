// Small DOM helpers: no framework, no innerHTML for user data.

type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function card(step: string, title: string, hint: string, ...body: Child[]): HTMLElement {
  return h("section", { class: "card" }, h("div", { class: "step" }, step), h("h2", {}, title), h("p", { class: "hint" }, hint), ...body);
}

export interface Field {
  el: HTMLElement;
  input: HTMLInputElement | HTMLTextAreaElement;
  value: () => string;
}

export function field(label: string, opts: { type?: string; placeholder?: string; area?: boolean; value?: string; help?: string } = {}): Field {
  const input = opts.area
    ? h("textarea", { placeholder: opts.placeholder, spellcheck: "false" })
    : h("input", { type: opts.type ?? "text", placeholder: opts.placeholder, spellcheck: "false", autocomplete: "off" });
  if (opts.value !== undefined) input.value = opts.value;
  const el = h("label", { class: "field" }, h("span", {}, label), input, opts.help ? h("small", {}, opts.help) : null);
  return { el, input, value: () => input.value.trim() };
}

export function fileField(label: string, help?: string): { el: HTMLElement; input: HTMLInputElement } {
  const input = h("input", { type: "file" });
  return { el: h("label", { class: "field" }, h("span", {}, label), input, help ? h("small", {}, help) : null), input };
}

export function button(text: string, onClick: () => void | Promise<void>, secondary = false): HTMLButtonElement {
  const b = h("button", { type: "button", class: secondary ? "secondary" : undefined }, text);
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await onClick();
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

export function actions(...buttons: HTMLElement[]): HTMLElement {
  return h("div", { class: "actions" }, ...buttons);
}

/// A slot that shows either a result or an error, replacing its previous content.
export class Out {
  readonly el = h("div", { class: "out" });

  clear(): void {
    this.el.replaceChildren();
  }

  show(...nodes: Node[]): void {
    this.el.replaceChildren(...nodes);
  }

  error(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.show(banner("bad", "Refused", msg));
  }
}

export function banner(kind: "ok" | "warn" | "bad", title: string, text: string): HTMLElement {
  return h("div", { class: `banner ${kind}` }, h("strong", {}, title), text);
}

export function codeBlock(label: string, value: string, filename?: string): HTMLElement {
  const copy = button("Copy", async () => {
    await navigator.clipboard.writeText(value);
  }, true);
  const buttons: HTMLElement[] = [copy];
  if (filename) buttons.push(button("Download", () => download(filename, value), true));
  return h(
    "div",
    {},
    h("div", { class: "label" }, label),
    h("div", { class: "copyrow" }, h("div", { class: "code" }, value), h("div", { class: "actions" }, ...buttons)),
  );
}

export function kv(rows: Array<[string, string, boolean?]>): HTMLElement {
  return h(
    "table",
    { class: "kv" },
    h("tbody", {}, ...rows.map(([k, v, mono]) => h("tr", {}, h("td", {}, k), h("td", { class: mono ? "mono" : undefined }, v)))),
  );
}

export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/// Inserts SVG produced by our own WASM (the QR renderer), never user-provided markup.
export function trustedSvg(svg: string): HTMLElement {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const wrap = h("div", { class: "qr" });
  if (root.nodeName.toLowerCase() === "svg") wrap.append(document.importNode(root, true));
  return wrap;
}

export function page(title: string, lead: string, ...cards: HTMLElement[]): HTMLElement {
  return h("div", {}, h("h1", {}, title), h("p", { class: "lead" }, lead), ...cards);
}
