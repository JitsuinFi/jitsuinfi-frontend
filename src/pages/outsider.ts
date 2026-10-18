// "What outsiders see" (HNK-11.T2): the public board shows only hashes and opaque signatures.
import { json, wasm } from "../lib/core";
import { actions, button, card, field, h, kv, Out, page } from "../lib/ui";

const TABLE: Array<[string, string, string]> = [
  ["Who the supplier, buyer and financier are", "Hidden", "Shielded payments; per-invoice keys; financier behind a salted commitment"],
  ["Invoice amount, dates, terms", "Hidden", "Only inside the signed invoice the parties hold"],
  ["Which invoice an entry is about", "Hidden", "N is a hash of the whole invoice; it cannot be guessed"],
  ["That some invoice was registered", "Visible", "A register entry appears on the board"],
  ["That some invoice was settled", "Visible", "A settled entry appears, with a tag that cannot be linked to its register entry"],
  ["That one N appears twice", "Visible", "Without the invoice nobody can tell a double financing from griefing"],
  ["A buyer's invoices belong together", "Hidden", "Each invoice uses its own buyer key; history tags need the buyer's certificates"],
  ["Advance and repayment amounts", "Hidden", "Shielded; visible only to the parties and to whoever holds a viewing key"],
];

export function outsiderPage(): HTMLElement {
  const table = h(
    "table",
    { class: "kv" },
    h("tbody", {}, ...TABLE.map(([what, status, why]) => h("tr", {}, h("td", {}, what), h("td", {}, h("strong", {}, status), " · ", why)))),
  );
  const memo = field("A board memo (base64url)", { area: true, placeholder: "Paste a memo read with the board's public viewing key" });
  const out = new Out();
  return page(
    "What outsiders see",
    "The registry board is public so anyone can audit it. This is everything an outsider can learn from it.",
    card("Privacy", "Public vs hidden", "Zcash shields the money; JitsuinFi keeps the documents with the parties.", table),
    card(
      "Explorer",
      "What a block explorer shows for an advance",
      "Testnet advance 7b5687991a8df84c… paid a supplier 0.00015 TAZ with a receipt, a seal and a receivable note in its memo. An explorer sees this:",
      kv([
        ["Transaction", "7b5687991a8df84cdb334d910f5d08850b98d5d02c7df09cd1bff4f2c167dbd9", true],
        ["Transparent inputs / outputs", "none / none"],
        ["Shielded pool", "Ironwood"],
        ["Fee", "0.0001 TAZ (ZIP-317)"],
        ["Amount, sender, recipient", "encrypted"],
        ["Memo (receipt, seal, note)", "encrypted"],
      ]),
    ),
    card(
      "Try it",
      "Read a board entry as an outsider",
      "You will see only hashes and signatures. Checking a signature needs the supplier's key, which is only inside the invoice.",
      memo.el,
      actions(
        button("Read entry", () => {
          try {
            const d = json<Record<string, unknown>>(wasm.boardMemoDescribe(memo.value()));
            out.show(kv(Object.entries(d).map(([k, v]): [string, string, boolean] => [k, String(v ?? "—"), true])));
          } catch (e) {
            out.error(e);
          }
        }),
      ),
      out.el,
    ),
  );
}
