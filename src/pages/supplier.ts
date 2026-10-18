// Supplier screen (HNK-10.T2): per-invoice key, create the invoice, seal the assignment letter.
import { dateToDays, fileHash, json, randomSecret, wasm, zecToZat } from "../lib/core";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out, page } from "../lib/ui";

// In memory only (never storage): survives moving between screens while the tab is open.
let secret = "";

export function supplierPage(): HTMLElement {
  // 1. per-invoice key
  const keyOut = new Out();
  const existing = field("Or paste an existing per-invoice secret", { placeholder: "64 hex characters", help: "Only for an invoice you already started. Keep it private." });
  const showKey = () =>
    keyOut.show(
      kv([["Supplier key for this invoice", wasm.publicKey(secret), true]]),
      banner("warn", "Keep this tab open", "The secret lives only in this page. Download a backup if you will seal the letter later."),
      actions(button("Download secret backup", () => downloadSecret(secret), true)),
    );
  const keyCard = card(
    "Step 1",
    "Per-invoice key",
    "Every invoice gets a fresh random key. It signs the board entry and the assignment letter, so nobody can link your invoices together.",
    actions(
      button("Generate a new key", () => {
        secret = randomSecret();
        showKey();
      }),
      button("Use pasted secret", () => {
        try {
          wasm.publicKey(existing.value());
          secret = existing.value();
          showKey();
        } catch (e) {
          keyOut.error(e);
        }
      }, true),
    ),
    existing.el,
    keyOut.el,
  );
  if (secret) showKey();

  // 2. invoice
  const id = field("Invoice number", { placeholder: "TES-INV-0007", help: "1–32 characters. Test data starts with TES-." });
  const buyer = field("Buyer key for this invoice", { placeholder: "64 hex characters from the buyer's screen" });
  const amount = field("Amount (ZEC)", { type: "number", placeholder: "0.0004" });
  const issue = field("Issue date", { type: "date" });
  const due = field("Due date", { type: "date" });
  const terms = fileField("Invoice document (PDF)", "Hashed in your browser with SHA-256. The file is never uploaded.");
  const invOut = new Out();
  const invCard = card(
    "Step 2",
    "Create the invoice",
    "The canonical invoice is what the buyer signs. Its fingerprint N is what financiers look up on the board.",
    id.el,
    buyer.el,
    h("div", { class: "row" }, amount.el, issue.el, due.el),
    terms.el,
    actions(
      button("Create invoice", async () => {
        try {
          if (!secret) throw new Error("generate the per-invoice key first (step 1)");
          const file = terms.input.files?.[0];
          if (!file) throw new Error("choose the invoice document");
          const code = wasm.invoiceEncode(
            JSON.stringify({
              invoice_id: id.value(),
              supplier_pk: wasm.publicKey(secret),
              buyer_pk: buyer.value(),
              amount_zat: zecToZat(amount.value()),
              issue_date: dateToDays(issue.value()),
              due_date: dateToDays(due.value()),
              terms_hash: await fileHash(file),
            }),
          );
          const f = json<{ nullifier: string }>(wasm.invoiceDecode(code));
          invOut.show(
            codeBlock("Invoice code: send it to the buyer to sign", code, `${id.value()}.invoice.txt`),
            kv([["Fingerprint N", f.nullifier, true]]),
          );
        } catch (e) {
          invOut.error(e);
        }
      }),
    ),
    invOut.el,
  );

  // 3. seal the letter
  const sInvoice = field("Invoice code", { area: true });
  const sLetter = field("Assignment letter code (from the financier)", { area: true });
  const sealOut = new Out();
  const sealCard = card(
    "Step 3",
    "Seal the assignment letter",
    "The letter assigns the invoice to one financier and names where the buyer pays. You seal first, then the buyer; the financier's seal arrives together with the money.",
    sInvoice.el,
    sLetter.el,
    actions(
      button("Seal as supplier", () => {
        try {
          if (!secret) throw new Error("load this invoice's per-invoice key (step 1)");
          const seal = wasm.supplierSealAssignment(secret, sInvoice.value(), sLetter.value());
          sealOut.show(codeBlock("Supplier seal: send it to the buyer", seal, "supplier.seal.txt"));
        } catch (e) {
          sealOut.error(e);
        }
      }),
    ),
    sealOut.el,
  );

  return page("Supplier", "Issue an invoice, have the buyer sign it, and seal the letter that assigns it to your financier.", keyCard, invCard, sealCard);
}

function downloadSecret(secret: string): void {
  const text = JSON.stringify({ warning: "TES only. Anyone with this secret can sign as the supplier of this invoice.", secret }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = h("a", { href: url, download: "supplier-invoice-key.json" });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
