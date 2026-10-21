// What the board does not stop (N-13), posted as the registry's official notice 告示 on the wall
// beside the counter: one document, three clauses cited the way a notice cites them, the
// registry's square seal at the foot.
import { h } from "../../lib/ui";

export function notice(): HTMLElement {
  const clause = (no: string, text: string) => h("li", {}, h("span", { class: "nt-no", lang: "ja" }, no), h("p", {}, text));
  return h(
    "article",
    { class: "nt", "aria-label": "Notice: what this does not stop" },
    h("span", { class: "nt-pin is-l", "aria-hidden": "true" }),
    h("span", { class: "nt-pin is-r", "aria-hidden": "true" }),
    h("p", { class: "nt-head", lang: "ja" }, "告 示"),
    h("h2", {}, "What the board does not stop"),
    h("p", { class: "nt-lede" }, "The board stops one signed invoice from being financed twice. It is not credit diligence."),
    h(
      "ol",
      {},
      clause("第一", "A fake invoice that the buyer itself co-signs. The buyer's signature is real, so the board sees a new invoice."),
      clause("第二", "One delivery split into two invoices that the buyer both signs."),
      clause("第三", "A financier that does not check the board before paying."),
    ),
    h("span", { class: "nt-seal", "aria-hidden": "true", lang: "ja" }, "登記", h("br"), "所印"),
  );
}
