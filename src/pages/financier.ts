// Financier screen (HNK-05.T5 layout, HNK-05.T4 integration for the parts the browser does):
// write the assignment letter, check the buyer's history, assemble the verification bundle.
// Registering on the board and the Sign-to-Pay advance run in the financier's backend wallet.
import { NET } from "../lib/network";
import { fileHash, json, today, wasm } from "../lib/core";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out, page } from "../lib/ui";

export function financierPage(): HTMLElement {
  // assignment letter
  const aInvoice = field("Invoice code", { area: true });
  const aKey = field("Your financier key", { placeholder: "64 hex characters" });
  const aAddress = field("Your shielded pay address", { placeholder: NET.addressHint, help: "The buyer pays here at maturity." });
  const aTerms = fileField("Letter document (PDF)", "Hashed in your browser with SHA-256; never uploaded.");
  const aOut = new Out();
  const letterCard = card(
    "Deal",
    "Write the assignment letter",
    "After your board entry is confirmed, send this letter to the supplier and the buyer. Your backend pays the advance only once both have sealed it, and your seal travels with the money.",
    aInvoice.el,
    aKey.el,
    aAddress.el,
    aTerms.el,
    actions(
      button("Create letter", async () => {
        try {
          const file = aTerms.input.files?.[0];
          if (!file) throw new Error("choose the letter document");
          const code = wasm.assignmentEncode(aInvoice.value(), aKey.value(), aAddress.value(), await fileHash(file));
          aOut.show(codeBlock("Assignment letter code: send it to the supplier and the buyer", code, "assignment.letter.txt"));
        } catch (e) {
          aOut.error(e);
        }
      }),
    ),
    aOut.el,
  );

  // buyer history
  const hCerts = field("Buyer's history certificates", { area: true, help: "One certificate per line, from #0 up." });
  const hIdentity = field("Buyer identity key", { placeholder: "64 hex characters" });
  const hAllow = field("Registered financiers (allowlist)", { area: true, help: "One financier key per line." });
  const hBoard = fileField("Board data (JSON from the backend)", "List of {txid, height, tx_index, output_index, memo}.");
  const hGrace = field("Grace days", { type: "number", value: "7" });
  const hOut = new Out();
  const histCard = card(
    "Before you finance",
    "Check the buyer's history",
    "Your browser checks the chain against the board itself: every past invoice must be anchored, nothing may follow the last one, and defaults show up as unsettled entries past due.",
    hCerts.el,
    hIdentity.el,
    hAllow.el,
    hBoard.el,
    hGrace.el,
    actions(
      button("Check history", async () => {
        try {
          const board = await hBoard.input.files?.[0]?.text();
          if (!board) throw new Error("choose the board data file");
          const lines = (s: string) => s.split(/\s+/).filter(Boolean);
          const r = json<{ on_time: number; late: number; defaults: number; open: number; lines: Array<{ index: number; outcome: string }> }>(
            wasm.verifyHistory(JSON.stringify(lines(hCerts.value())), hIdentity.value(), JSON.stringify(lines(hAllow.value())), board, today(), Number(hGrace.value())),
          );
          const verdict = r.defaults > 0 ? banner("bad", "Defaults found", `${r.defaults} unpaid invoice(s) past due.`) : banner("ok", "Complete history", "No defaults.");
          hOut.show(
            verdict,
            kv([
              ["Paid on time", String(r.on_time)],
              ["Paid late", String(r.late)],
              ["Defaults", String(r.defaults)],
              ["Still open", String(r.open)],
              ...r.lines.map((l): [string, string] => [`Invoice #${l.index}`, l.outcome]),
            ]),
          );
        } catch (e) {
          hOut.error(e);
        }
      }),
    ),
    hOut.el,
  );

  // bundle
  const bInvoice = field("Invoice code", { area: true });
  const bSig = field("Buyer signature", { placeholder: "128 hex characters" });
  const bLetter = field("Assignment letter code (optional)", { area: true });
  const bSeals = field("Letter seals (optional)", { area: true, help: "One per line, in order: supplier, buyer, financier." });
  const bSettle = h("input", { type: "checkbox" });
  const bOut = new Out();
  const bundleCard = card(
    "Evidence",
    "Verification bundle",
    "One file with the signed invoice, the sealed letter and the settlement document. An auditor or judge verifies it offline, or against the board on the Verify page.",
    bInvoice.el,
    bSig.el,
    bLetter.el,
    bSeals.el,
    h("label", { class: "field" }, bSettle, " include the settlement document"),
    actions(
      button("Build bundle", () => {
        try {
          const code = wasm.bundleBuild(
            JSON.stringify({
              invoice: bInvoice.value(),
              buyer_signature: bSig.value(),
              assignment: bLetter.value() || undefined,
              seals: bSeals.value().split(/\s+/).filter(Boolean),
              with_settlement: bSettle.checked,
            }),
          );
          bOut.show(codeBlock("Bundle (verified)", code, "deal.bundle.txt"));
        } catch (e) {
          bOut.error(e);
        }
      }),
    ),
    bOut.el,
  );

  const backend = banner(
    "warn",
    "Runs in your backend wallet",
    "Board registration, waiting for confirmation, the Sign-to-Pay advance and the repayment watchdog need your shielded wallet. They run in the financier backend (jitsuin-flow); this page covers what the browser verifies.",
  );

  return page("Financier", "Finance invoices that are provably not financed elsewhere, to buyers whose full history you can check.", h("div", {}, backend), letterCard, histCard, bundleCard);
}
