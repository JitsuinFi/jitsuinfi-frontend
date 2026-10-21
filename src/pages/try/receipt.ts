// Exhibit A as the slip B's receipt printer prints (M-03, D-44, reference PIN-06): the double
// signature without the deal. Every line comes from `verifyExhibitOnBoard` (the same rule as
// `jitsuin verify --exhibit`); the bars at the foot are N's own 32 bytes, so each exhibit prints
// its own barcode. The paper feeds out line by line over 1.2s (linear).
import { inView } from "motion";
import { download, h } from "../../lib/ui";
import { json, wasm } from "../../lib/core";
import { run, wait } from "./anim";

interface At {
  txid: string;
  height: number;
  tx_index?: number;
}
interface ExhibitOnBoard {
  holds: boolean;
  signatures: { ok: boolean; error?: string; nullifier?: string; supplier_pk?: string };
  first: { claimed_at: At | null; on_board: boolean | null };
  second: { claimed_at: At | null; on_board: boolean | null };
  ordered: boolean | null;
  board_entries: number | null;
  binds: boolean | null;
}

const where = (a: At | null) => (a ? `block ${a.height} · tx ${a.tx_index ?? "?"}` : "not posted");
const mark = (ok: boolean | null) => (ok === null ? "?" : ok ? "✓" : "✗");

/** N's bytes as bars: each nibble sets a bar's width, so the code is the fingerprint itself. */
function bars(n: string): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 256 40");
  svg.setAttribute("aria-hidden", "true");
  let x = 0;
  for (const c of n) {
    const w = 1 + (parseInt(c, 16) % 4);
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("width", String(w * 0.9));
    r.setAttribute("height", "40");
    svg.append(r);
    x += w + 1;
  }
  svg.setAttribute("viewBox", `0 0 ${x} 40`);
  svg.setAttribute("preserveAspectRatio", "none");
  return svg;
}

export interface Printer {
  el: HTMLElement;
  /** The print button, for the filmed autoplay. */
  button: HTMLButtonElement;
  /** Where the printed slip appears, for the filmed autoplay. */
  out: HTMLElement;
}

export function printer(load: () => Promise<{ exhibit: string; board: string; line: string }>): Printer {
  const slip = h("div", { class: "rc-slip", "aria-live": "polite" });
  const out = h("div", { class: "rc-out" }, slip);
  const button = h("button", { type: "button", class: "seal-btn" }, h("span", {}, "Print it again")) as HTMLButtonElement;
  const keep = h("button", { type: "button", class: "ink-link", hidden: true }, "Keep it (exhibit-a.txt)") as HTMLButtonElement;
  let text = "";
  keep.addEventListener("click", () => download("exhibit-a.txt", text));
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const { exhibit, board, line } = await load();
      text = exhibit;
      const r = json<ExhibitOnBoard>(wasm.verifyExhibitOnBoard(exhibit, board, null));
      const n = r.signatures.nullifier ?? "";
      const lines: Node[] = [
        h("p", { class: "rc-title" }, "EXHIBIT A"),
        h("p", { class: "rc-sub" }, r.holds ? "Double signature, on the board" : "Does not hold on this board data"),
        h("p", { class: "rc-rule" }),
        h("p", {}, h("span", {}, "Fingerprint N"), h("code", {}, n)),
        h("p", {}, h("span", {}, "Supplier key"), h("code", {}, r.signatures.supplier_pk ?? "")),
        h("p", { class: "rc-rule" }),
        h("p", { class: "rc-check" }, h("b", {}, mark(r.signatures.ok)), "one key signed N for two financiers"),
        h("p", { class: "rc-check" }, h("b", {}, mark(r.first.on_board)), `entry ① ${where(r.first.claimed_at)}`),
        h("p", { class: "rc-check" }, h("b", {}, mark(r.second.on_board)), `entry ② ${where(r.second.claimed_at)}`),
        h("p", { class: "rc-check" }, h("b", {}, mark(r.ordered)), "① came before ②"),
        h("p", { class: "rc-rule" }),
        h("p", { class: "rc-small" }, "Names no invoice, amount, buyer or financier. Whoever holds the invoice can check it is this one."),
        h("div", { class: "rc-bars" }, bars(n)),
        h("p", { class: "rc-small" }, `Checked in this browser by the rule of jitsuin verify --exhibit. ${line}`),
      ];
      slip.replaceChildren();
      out.dataset.printed = "true";
      for (const l of lines) {
        slip.append(l);
        if (l instanceof HTMLElement) void run(l, { opacity: [0, 1], y: [-6, 0], duration: 160 });
        await wait(1200 / lines.length);
      }
      keep.hidden = false;
    } catch (e) {
      slip.replaceChildren(h("p", { class: "rc-small" }, e instanceof Error ? e.message : String(e)));
    } finally {
      button.disabled = false;
    }
  });
  const el = h(
    "div",
    { class: "rc" },
    h(
      "div",
      { class: "rc-machine", "aria-hidden": "true" },
      h("span", { class: "rc-brand", lang: "ja" }, "証拠"),
      h("span", { class: "rc-light" }),
      h("span", { class: "rc-mouth" }),
    ),
    out,
    h("div", { class: "rc-actions" }, button, keep),
  );
  // B prints the slip as soon as the printer comes into view; the button prints it again.
  inView(el, () => {
    if (out.dataset.printed !== "true" && !button.disabled) button.click();
  }, { amount: 0.4 });
  return { el, button, out };
}
