// "What outsiders see" (HNK-11.T2, HNK-28.T5): what the public board shows to anyone holding its viewing key.
import { json, wasm } from "../lib/core";
import { actions, button, card, field, h, kv, Out, page } from "../lib/ui";

// What anyone holding the board's public viewing key learns (HNK-28.T5, BL-D28-07; threat model
// rows "viewing key holder" and TM #13 – #14). The key is published (D-11), so "outsider" means
// everyone: the board shows codes and hashes, never a party, an amount or a document.
const TABLE: Array<[string, string, string]> = [
  ["Who the supplier, buyer and financier are", "Hidden", "Shielded payments; per-invoice keys; each financier behind a commitment whose salt is new for every invoice"],
  ["Invoice amount, dates, terms", "Hidden", "Only inside the signed invoice the parties hold"],
  ["Which invoice an entry is about", "Hidden", "N is a hash of the whole invoice, including a per-invoice key; it cannot be guessed"],
  ["That an invoice was registered, and when", "Visible", "A register entry appears on the board in a block"],
  ["Discount class and tenor class of each registration", "Visible", "Every entry carries both codes (or 0/0). The public index shows a class only from 5 invoices, but each entry's codes can be read"],
  ["Whether the buyer brought a payment history", "Visible", "The entry kind: plain register, or register with a history tag"],
  ["That an invoice was settled, on time or late", "Visible", "A settled entry appears, with its on-time flag and two signatures"],
  ["Which registration a settlement closes", "Hidden", "The settled tag is a hash of N. Whoever holds N (the financiers who saw the invoice, a fund member, a lender shown the buyer's history) can link the two; timing and tenor class can hint"],
  ["That one N appears twice", "Visible", "Without the invoice nobody can tell a double financing from griefing"],
  ["A buyer's invoices belong together", "Hidden", "Each invoice uses its own buyer key. A lender the buyer showed its history to can find the buyer's next invoice on the board"],
  ["Advance and repayment amounts", "Hidden", "Shielded; visible only to the parties and to whoever holds their viewing key"],
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
    "The registry board is public so anyone can audit it: its viewing key is published. This is everything anyone can learn from it.",
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
      "You will see the entry's kind, N, the financier commitment, the two classes and any history tag, or a settlement's tag and on-time flag. No party, amount or document. Checking a signature needs the supplier's key, which is only inside the invoice.",
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
