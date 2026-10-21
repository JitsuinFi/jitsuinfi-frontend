// Public rate index (HNK-08.T3): "price public, participants private". Recomputes the index from
// board data in the browser with the same rule as `jitsuin index` (wasm `rateIndex`): each invoice
// counts once, with its first entry, and a class is shown only with at least k = 5 invoices.
import { NET } from "../lib/network";
import { boardLine, loadBoard } from "../lib/board";
import { json, wasm } from "../lib/core";
import { classRows, indexRows, summary, type RateIndex } from "../lib/rate-index";
import { actions, button, card, field, fileField, h, Out } from "../lib/ui";
import { deskPage } from "./desk";

function table(head: string[], rows: string[][]): HTMLElement {
  return h(
    "div",
    { class: "table-scroll" },
    h(
      "table",
      { class: "kv grid-table" },
      h("thead", {}, h("tr", {}, ...head.map((c) => h("th", {}, c)))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", {}, c))))),
    ),
  );
}

/** The tide gauge (M-08, HNK-30.T17): one glass tube per tenor class. A published class fills to
 *  its median discount class; a class under k stays dry, its count not shown (k protects it). */
function gauge(idx: RateIndex | null, line: string): HTMLElement {
  const discounts = idx?.classes.discount_bps ?? [];
  const tubes = (idx?.tenors ?? []).map((t) => {
    const level = t.published && t.median_discount ? t.median_discount.class / Math.max(1, discounts.length) : 0;
    const tube = h(
      "div",
      { class: `tg-tube${t.published ? " is-published" : ""}` },
      h("span", { class: "tg-glass" }, h("span", { class: "tg-water" })),
      h("strong", {}, t.label),
      h("span", {}, t.published ? `median ${t.median_discount?.label ?? "-"} · ${t.invoices ?? 0} invoices` : `fewer than ${idx!.k}: dry`),
    );
    (tube.querySelector(".tg-water") as HTMLElement).style.setProperty("--level", String(level));
    return tube;
  });
  return h(
    "section",
    { class: "tg", "aria-label": "The rate index as a tide gauge" },
    h("div", { class: "tg-scale", "aria-hidden": "true" }, ...discounts.slice().reverse().map((d) => h("span", {}, d.label))),
    h("div", { class: "tg-tubes" }, ...(tubes.length ? tubes : [h("p", { class: "tg-wait" }, "Reading the board…")])),
    h(
      "p",
      { class: "tg-cap" },
      idx
        ? `${summary(idx)}. A tube fills only once its class holds ${idx.k} invoices, so no single deal's rate shows. ${line}`
        : line,
    ),
  );
}

export function ratesPage(): HTMLElement {
  const board = fileField("Board data (optional)", `Without a file the page reads the live ${NET.noun} board from the financier node (the last one this browser saw, or a bundled copy, if the node does not answer).`);
  const k = field("Smallest class (k)", { type: "number", value: "5", help: "A class is shown only with at least k invoices; k can be raised, not lowered below 5." });
  const out = new Out();
  const stageHost = h("div", {}, gauge(null, "Reading the board…"));
  const run = async () => {
    try {
      const file = await board.input.files?.[0]?.text();
      const b = file ? undefined : await loadBoard((u, i) => fetch(u, i));
      const boardJson = file ?? b!.json;
      const kv = Math.max(5, Math.floor(Number(k.value()) || 5));
      const idx = json<RateIndex>(wasm.rateIndex(boardJson, kv));
      const source = `Board data: ${b ? boardLine(b) : "the file you added"}.`;
      stageHost.replaceChildren(gauge(idx, source));
      out.show(table(["Tenor", "Invoices", "Median discount", "Discount classes (invoices)"], indexRows(idx)));
    } catch (e) {
      out.error(e);
    }
  };
  void run();
  const legend = h(
    "div",
    {},
    h("p", { class: "note" }, "Discount is (face − advance) / face; tenor runs from the advance to the due date. Entries without classes (0/0) are counted as not disclosed."),
    table(
      ["Code", "Discount", "Tenor"],
      classRows({
        k: 5,
        entries: 0,
        invoices: 0,
        undisclosed: 0,
        invalid: 0,
        tenors: [],
        classes: json<RateIndex>(wasm.rateIndex("[]", 5)).classes,
      }),
    ),
  );
  return deskPage({
    glyph: "価",
    eyebrow: "Public rate index",
    title: "Rate index",
    lede: "Each register entry carries a discount class and a tenor class, never an amount or a party. Anyone can recompute the market's prices from the public board; nobody learns who financed whom.",
    stage: stageHost,
    docs: [
      card("Index", "Recompute it yourself", "Runs in your browser with the same rule as the jitsuin index command. Nothing is sent anywhere.", board.el, k.el, actions(button("Recompute", run)), out.el),
      card("Classes", "What the codes mean", "The supplier signs both codes into the entry.", legend),
    ],
  });
}
