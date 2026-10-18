// Buyer screen (HNK-10.T3 crucial, HNK-06.T5 QR): keys from a passkey, sign the invoice, seal
// the letter, issue the history certificate, and pay at maturity by QR.
import { daysToDate, json, today, wasm, zatToZec } from "../lib/core";
import { createPasskey, masterFromPasskey, passkeysAvailable } from "../lib/passkey";
import { actions, banner, button, card, codeBlock, field, h, kv, Out, page, trustedSvg } from "../lib/ui";

// In memory only (never storage): survives moving between screens while the tab is open.
let master = "";

export function buyerPage(): HTMLElement {  const index = field("Invoice number in your history", { type: "number", value: "0", help: "0 for your first financed invoice, then 1, 2, …" });
  const idx = () => {
    const n = Number(index.value());
    if (!Number.isInteger(n) || n < 0) throw new Error("history number must be 0 or more");
    return n;
  };

  // 1. keys
  const keysOut = new Out();
  const testSecret = field("Test secret (demo only)", { placeholder: "64 hex characters", help: "Stands in for the passkey on devices without PRF support." });
  const showKeys = () => {
    const k = json<{ identity_pk: string; invoice_pk: string }>(wasm.buyerKeys(master, idx()));
    keysOut.show(
      kv([
        ["Your identity key", k.identity_pk, true],
        [`Key for invoice #${idx()}`, k.invoice_pk, true],
      ]),
      h("p", { class: "hint" }, "Give the invoice key to the supplier for the invoice. Each invoice uses a different key, so the public board cannot link your invoices."),
    );
  };
  const unlock = async (get: () => Promise<string>) => {
    try {
      master = await get();
      showKeys();
    } catch (e) {
      keysOut.error(e);
    }
  };
  const keysCard = card(
    "Step 1",
    "Unlock your keys",
    "Your keys come from a passkey on this device. There is no seed phrase and nothing is stored: the same passkey always gives the same keys.",
    actions(
      button("Create passkey", async () => {
        try {
          await createPasskey();
          keysOut.show(banner("ok", "Passkey created", "Now use it to unlock your keys."));
        } catch (e) {
          keysOut.error(e);
        }
      }, true),
      button("Unlock with passkey", () => unlock(masterFromPasskey)),
      button("Use test secret", () => unlock(async () => {
        wasm.buyerKeys(testSecret.value(), 0);
        return testSecret.value();
      }), true),
    ),
    passkeysAvailable() ? null : banner("warn", "Passkeys unavailable here", "Open the app over https or localhost, or use a test secret."),
    index.el,
    testSecret.el,
    keysOut.el,
  );
  if (master) showKeys();

  const need = () => {
    if (!master) throw new Error("unlock your keys first (step 1)");
    return master;
  };

  // 2. sign the invoice
  const sInvoice = field("Invoice code from the supplier", { area: true });
  const signOut = new Out();
  const signCard = card(
    "Step 2",
    "Review and sign the invoice",
    "Your signature confirms the trade happened. Check every field: this is what financiers rely on.",
    sInvoice.el,
    actions(
      button("Show invoice", () => {
        try {
          const f = json<Record<string, string | number>>(wasm.invoiceDecode(sInvoice.value()));
          signOut.show(invoiceTable(f));
        } catch (e) {
          signOut.error(e);
        }
      }, true),
      button("Sign invoice", () => {
        try {
          const f = json<Record<string, string | number>>(wasm.invoiceDecode(sInvoice.value()));
          const sig = wasm.buyerSignInvoice(need(), idx(), sInvoice.value());
          signOut.show(invoiceTable(f), codeBlock("Your signature: send it to the supplier", sig, "buyer.signature.txt"));
        } catch (e) {
          signOut.error(e);
        }
      }),
    ),
    signOut.el,
  );

  // 3. seal the letter
  const lInvoice = field("Invoice code", { area: true });
  const lLetter = field("Assignment letter code", { area: true });
  const lSeal = field("Supplier seal", { area: true });
  const sealOut = new Out();
  const sealCard = card(
    "Step 3",
    "Acknowledge the assignment",
    "Sealing the letter is your written acknowledgment that you will pay the financier named in it at maturity. The financier pays the supplier only after this.",
    lInvoice.el,
    lLetter.el,
    lSeal.el,
    actions(
      button("Seal as buyer", () => {
        try {
          const seal = wasm.buyerSealAssignment(need(), idx(), lInvoice.value(), lLetter.value(), lSeal.value());
          sealOut.show(codeBlock("Your seal: send it to the financier", seal, "buyer.seal.txt"));
        } catch (e) {
          sealOut.error(e);
        }
      }),
    ),
    sealOut.el,
  );

  // 4. history certificate
  const hInvoice = field("Invoice code", { area: true });
  const hFin = field("Financier key", { placeholder: "64 hex characters" });
  const hPrev = field("Your previous certificate (empty for invoice #0)", { area: true });
  const histOut = new Out();
  const histCard = card(
    "Step 4",
    "History certificate",
    "Financiers check your full payment history before financing. Each certificate links to the previous one and is anchored on the board, so a history cannot be trimmed.",
    hInvoice.el,
    hFin.el,
    hPrev.el,
    actions(
      button("Issue certificate", () => {
        try {
          const cert = wasm.buyerHistoryCert(need(), idx(), hInvoice.value(), hFin.value(), hPrev.value());
          histOut.show(codeBlock(`Certificate #${idx()}: keep it and give it to the financier`, cert, `history-${idx()}.cert.txt`));
        } catch (e) {
          histOut.error(e);
        }
      }),
    ),
    histOut.el,
  );

  // 5. pay
  const pInvoice = field("Invoice code", { area: true });
  const pLetter = field("Assignment letter code", { area: true });
  const payOut = new Out();
  const payCard = card(
    "Step 5",
    "Pay at maturity",
    "Scan the QR with a Zcash wallet. The payment is shielded; its memo carries your signed receipt and your claim, which the financier countersigns once the payment is on chain.",
    pInvoice.el,
    pLetter.el,
    actions(
      button("Show payment QR", () => {
        try {
          const r = json<{ uri: string; qr_svg: string }>(wasm.buyerRepayment(need(), idx(), pInvoice.value(), pLetter.value(), today()));
          payOut.show(trustedSvg(r.qr_svg), codeBlock("Payment request (ZIP-321)", r.uri));
        } catch (e) {
          payOut.error(e);
        }
      }),
    ),
    payOut.el,
  );

  return page("Buyer", "Confirm the invoice, acknowledge who you will pay, and pay at maturity, all from keys only you hold.", keysCard, signCard, sealCard, histCard, payCard);
}

function invoiceTable(f: Record<string, string | number>): HTMLElement {
  return kv([
    ["Invoice number", String(f.invoice_id)],
    ["Amount", `${zatToZec(Number(f.amount_zat))} ZEC`],
    ["Issued", daysToDate(Number(f.issue_date))],
    ["Due", daysToDate(Number(f.due_date))],
    ["Addressed to your key", String(f.buyer_pk), true],
    ["Document hash", String(f.terms_hash), true],
    ["Fingerprint N", String(f.nullifier), true],
  ]);
}
