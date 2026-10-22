// Kept for the DOM pages until they move to components (supplier: HNK-31.T8, verify: T6).
// The board as the registry book 登記簿 behind B's window (MASTER.md §8, reference PIN-05): one
// row per real entry of the testnet board, printed in the board's blue ink on ruled pages, five
// rows a page, two pages a spread. B turns the leaves to the spread that holds an invoice's
// fingerprint (280ms a leaf, snapSettle, at most five) and underlines the row in seal ink.
import { h } from "../../lib/ui";
import { dur, ease, run, still } from "./anim";

export interface Entry {
  txid: string;
  height: number;
  tx_index: number;
  n: string;
  kind: string;
  mine: boolean;
}

const PER_PAGE = 5;
const short = (x: string) => `${x.slice(0, 14)}…${x.slice(-8)}`;

/** The registry rows of a board snapshot (wasm `boardMemoDescribe` per entry); a settled entry
 *  carries its settled tag where a register entry carries N. */
export function entriesOf(
  boardJson: string,
  describe: (memo: string) => string,
  mine?: string,
): Entry[] {
  const list = JSON.parse(boardJson) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
  return list.flatMap((e) => {
    try {
      const d = JSON.parse(describe(e.memo)) as { kind: string; nullifier?: string; settled_tag?: string };
      return [{ txid: e.txid, height: e.height, tx_index: e.tx_index, n: d.nullifier ?? d.settled_tag ?? "", kind: d.kind, mine: e.txid === mine }];
    } catch {
      return [];
    }
  });
}

export interface Registry {
  el: HTMLElement;
  set(entries: Entry[], note: string): void;
  /** Marks `txid`'s row if it is on the open spread; false otherwise. */
  mark(txid: string): boolean;
  /** Turns to the spread holding `txid` and marks its row; resolves with the row element. */
  find(txid: string): Promise<HTMLElement | null>;
  clear(): void;
}

export function registry(): Registry {
  let entries: Entry[] = [];
  let spread = 0;
  const left = h("div", { class: "rg-page is-left" });
  const right = h("div", { class: "rg-page is-right" });
  const note = h("p", { class: "rg-note" }, "Reading the board…");
  const el = h(
    "section",
    { class: "rg", "aria-label": "The registry book: the public board" },
    h("div", { class: "rg-book" }, left, h("span", { class: "rg-spine", "aria-hidden": "true" }), right),
    note,
  );

  const pages = () => Math.max(1, Math.ceil(entries.length / PER_PAGE));

  const pageBody = (p: number): Node[] => {
    const rows = entries.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
    return [
      h("header", {}, h("span", { lang: "ja" }, p % 2 === 0 ? "登記簿" : "Zcash testnet"), h("small", {}, `page ${p + 1} of ${pages()}`)),
      h(
        "ol",
        { class: "rg-rows", start: String(p * PER_PAGE + 1) },
        ...rows.map((e) =>
          h(
            "li",
            { class: e.mine ? "is-a" : undefined, "data-txid": e.txid },
            h("span", { class: "rg-h" }, String(e.height)),
            h("code", { title: e.n }, short(e.n)),
            h("span", { class: "rg-k" }, e.mine ? "financier A" : e.kind === "RegisterWithHistory" ? "with history" : e.kind.toLowerCase()),
          ),
        ),
      ),
    ];
  };
  const show = (s: number) => {
    spread = s;
    left.replaceChildren(...pageBody(s * 2));
    right.replaceChildren(...(s * 2 + 1 < pages() ? pageBody(s * 2 + 1) : [h("p", { class: "rg-blank" }, "The next entry is written here.")]));
  };

  /** One leaf turning over the spine, front = the right page, back = the next left page. */
  const turn = async (to: number) => {
    const forward = to > spread;
    const leaf = h(
      "div",
      { class: `rg-leaf ${forward ? "is-fwd" : "is-back"}`, "aria-hidden": "true" },
      h("div", { class: "rg-page rg-face" }, ...Array.from((forward ? right : left).cloneNode(true).childNodes)),
      h("div", { class: "rg-page rg-face is-back" }, ...pageBody(forward ? to * 2 : to * 2 + 1)),
    );
    el.querySelector(".rg-book")!.append(leaf);
    if (forward) right.replaceChildren(...(to * 2 + 1 < pages() ? pageBody(to * 2 + 1) : []));
    else left.replaceChildren(...pageBody(to * 2));
    await run(leaf, { rotateY: forward ? [0, -180] : [0, 180], duration: 280 }, ease.snapSettle);
    leaf.remove();
    show(to);
  };

  return {
    el,
    set(list, line) {
      entries = list;
      note.textContent = line;
      show(0);
    },
    async find(txid) {
      const i = entries.findIndex((e) => e.txid === txid);
      if (i < 0) return null;
      const target = Math.floor(i / PER_PAGE / 2);
      let flips = 0;
      while (spread !== target && flips < 5) {
        await turn(spread + Math.sign(target - spread));
        flips++;
      }
      if (spread !== target) show(target);
      const row = el.querySelector<HTMLElement>(`li[data-txid="${txid}"]`);
      if (row) {
        row.classList.add("is-hit");
        if (!still()) await run(row, { x: [0, 3, 0], duration: dur.seal }, ease.snapSettle);
      }
      return row;
    },
    mark(txid) {
      const row = el.querySelector<HTMLElement>(`li[data-txid="${txid}"]`);
      row?.classList.add("is-hit");
      return row !== null;
    },
    clear() {
      for (const r of el.querySelectorAll(".is-hit")) r.classList.remove("is-hit");
      if (spread !== 0 && entries.length) show(0);
    },
  };
}
