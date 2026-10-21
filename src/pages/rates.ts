// Public rate index (HNK-08.T3): "price public, participants private". Recomputes the index from
// board data in the browser with the same rule as `jitsuin index` (wasm `rateIndex`): each invoice
// counts once, with its first entry, and a class is shown only with at least k = 5 invoices.
import { boardLine, loadBoard } from "../lib/board";
import { json, wasm } from "../lib/core";
import { classRows, indexRows, summary, type RateIndex } from "../lib/rate-index";
import { actions, banner, button, card, field, fileField, h, Out, page } from "../lib/ui";

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

export function ratesPage(): HTMLElement {
  const board = fileField("Board data (optional)", "Without a file the page reads the live testnet board from the financier node (the last one this browser saw, or a bundled copy, if the node does not answer).");
  const k = field("Smallest class (k)", { type: "number", value: "5", help: "A class is shown only with at least k invoices; k can be raised, not lowered below 5." });
  const out = new Out();
  const run = async () => {
    try {
      const file = await board.input.files?.[0]?.text();
      const b = file ? undefined : await loadBoard((u, i) => fetch(u, i));
      const boardJson = file ?? b!.json;
      const kv = Math.max(5, Math.floor(Number(k.value()) || 5));
      const idx = json<RateIndex>(wasm.rateIndex(boardJson, kv));
      const shown = idx.tenors.filter((t) => t.published).length;
      out.show(
        shown
          ? banner("ok", `${shown} of ${idx.tenors.length} tenor classes published`, summary(idx))
          : banner("warn", "No class reaches k yet", `${summary(idx)}. Every class needs at least ${idx.k} invoices before it is shown.`),
        table(["Tenor", "Invoices", "Median discount", "Discount classes (invoices)"], indexRows(idx)),
        h("p", { class: "note" }, `Board data: ${b ? boardLine(b) : "the file you added"}.`),
      );
    } catch (e) {
      out.error(e);
    }
  };
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
  return page(
    "Rate index",
    "Each register entry carries a discount class and a tenor class, never an amount or a party. Anyone can recompute the market's prices from the public board; nobody learns who financed whom.",
    card("Index", "Recompute the public rate index", "Runs in your browser with the same rule as the jitsuin index command. Nothing is sent anywhere.", board.el, k.el, actions(button("Show index", run)), out.el),
    card("Classes", "What the codes mean", "The supplier signs both codes into the entry.", legend),
  );
}
