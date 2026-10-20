// Buyer screen (HNK-10.T3 crucial, HNK-06.T5 QR; HNK-22.T4): keys from a passkey, sign the
// invoice, seal the letter, issue the history certificate, and pay at maturity by QR.
//
// Opens in a buyer session. No master stays in this tab: every action that needs a key is a stamp
// (one passkey touch, `account.stamp()`) passed to a jitsuin-wasm `*Bytes` function, which zeroes
// it. The buyer salt is unchanged (`jitsuin/buyer/master/v1`), so old buyer keys stay the same.
//
// The invoice number `k` is never typed (HNK-25.T2, P-09): the next one comes from the history
// certificates kept in the encrypted deal store, checked against board data when given (wasm
// `historyNext`); for an invoice already in hand, `k` is found from the key it is addressed to.
import { account } from "../lib/app-session";
import { append, dropTail, emptyHistory, head, HISTORY_ID, localNextIndex, type HistoryDoc } from "../lib/buyer-history";
import { daysToDate, json, today, wasm, zatToZec } from "../lib/core";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out, page, trustedSvg } from "../lib/ui";

// This tab only: the history check found the board ahead of this device, so issuing is blocked.
let successorOnBoard = false;

async function loadHistory(): Promise<HistoryDoc> {
  return (await account.current?.store?.get<HistoryDoc>(HISTORY_ID)) ?? emptyHistory();
}

async function saveHistory(h: HistoryDoc): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("sign in as buyer first");
  await store.put(HISTORY_ID, h);
}

/** How far `findIndex` looks past the next index for an invoice addressed to an older key. */
const LOOKAHEAD = 8;

/**
 * One passkey touch: finds the history index of the key `invoice` is addressed to, then runs
 * `use` with a fresh copy of the master for that index. The master is zeroed afterwards.
 */
async function withInvoiceIndex<T>(invoice: string, use: (master: Uint8Array, k: number) => T): Promise<T> {
  const buyerPk = json<{ buyer_pk: string }>(wasm.invoiceDecode(invoice)).buyer_pk;
  const limit = localNextIndex(await loadHistory()) + LOOKAHEAD;
  const m = await account.stamp();
  try {
    for (let k = 0; k <= limit; k++) {
      if (json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk === buyerPk) return use(m.slice(), k);
    }
    throw new Error("this invoice is not addressed to one of your invoice keys");
  } finally {
    m.fill(0);
  }
}

export function buyerPage(): HTMLElement {
  // 1. keys and history
  const board = fileField("Board data (optional)", "JSON snapshot of the public board. Checks which of your certificates are anchored.");
  const keysOut = new Out();
  const keysCard = card(
    "Step 1",
    "Your next invoice key",
    "Your keys come from your passkey; nothing secret is stored. The number of your next invoice comes from your own history, so you never type it.",
    board.el,
    actions(
      button("Show my next invoice key", async () => {
        try {
          let hist = await loadHistory();
          let k = localNextIndex(hist);
          const m = await account.stamp();
          const notes: Node[] = [];
          try {
            const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
            const boardJson = await board.input.files?.[0]?.text();
            if (boardJson) {
              const r = json<{ next_index: number; dropped: number[]; successor_on_board: boolean }>(wasm.historyNext(JSON.stringify(hist.certs), id, boardJson));
              if (r.dropped.length) {
                hist = dropTail(hist, r.dropped);
                await saveHistory(hist);
                notes.push(banner("warn", "Unused certificate removed", `Certificate${r.dropped.length > 1 ? "s" : ""} #${r.dropped.join(", #")} never reached the board (the financier did not register), so the number is free again.`));
              }
              successorOnBoard = r.successor_on_board;
              k = r.next_index;
              notes.push(
                successorOnBoard
                  ? banner("bad", "Your history is ahead of this device", `The board already holds a certificate after #${k - 1 < 0 ? "start" : k - 1} that this device does not have. Do not issue a new certificate here: it would fork your history. Restore your certificates first.`)
                  : banner("ok", "History checked against the board", `${r.next_index} certificate${r.next_index === 1 ? "" : "s"} anchored.`),
              );
            } else {
              notes.push(h("p", { class: "hint" }, "Not checked against the board. Add board data to check which certificates are anchored."));
            }
            const next = json<{ invoice_pk: string }>(wasm.buyerKeysBytes(m.slice(), k)).invoice_pk;
            keysOut.show(
              ...notes,
              kv([
                ["Your identity key", id, true],
                ["Next invoice in your history", `#${k}`],
                [`Key for invoice #${k}`, next, true],
              ]),
              h("p", { class: "hint" }, "Give this key to the supplier for your next invoice. Each invoice uses a different key, so the public board cannot link your invoices."),
            );
          } finally {
            m.fill(0);
          }
        } catch (e) {
          keysOut.error(e);
        }
      }),
    ),
    keysOut.el,
  );

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
      button("Sign invoice", async () => {
        try {
          const f = json<Record<string, string | number>>(wasm.invoiceDecode(sInvoice.value()));
          const sig = await withInvoiceIndex(sInvoice.value(), (m, k) => wasm.buyerSignInvoiceBytes(m, k, sInvoice.value()));
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
      button("Seal as buyer", async () => {
        try {
          const seal = await withInvoiceIndex(lInvoice.value(), (m, k) => wasm.buyerSealAssignmentBytes(m, k, lInvoice.value(), lLetter.value(), lSeal.value()));
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
  const histOut = new Out();
  const histCard = card(
    "Step 4",
    "History certificate",
    "Financiers check your full payment history before financing. Each certificate links to the previous one, which this device keeps for you, and is anchored on the board, so a history cannot be trimmed.",
    hInvoice.el,
    hFin.el,
    actions(
      button("Issue certificate", async () => {
        try {
          if (successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates before issuing a new one");
          const hist = await loadHistory();
          const next = localNextIndex(hist);
          const { cert, k } = await withInvoiceIndex(hInvoice.value(), (m, k) => {
            if (k !== next) {
              m.fill(0);
              throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
            }
            return { cert: wasm.buyerHistoryCertBytes(m, k, hInvoice.value(), hFin.value(), head(hist)), k };
          });
          await saveHistory(append(hist, k, cert));
          histOut.show(codeBlock(`Certificate #${k}: give it to the financier (this device keeps a copy)`, cert, `history-${k}.cert.txt`));
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
      button("Show payment QR", async () => {
        try {
          const r = json<{ uri: string; qr_svg: string }>(await withInvoiceIndex(pInvoice.value(), (m, k) => wasm.buyerRepaymentBytes(m, k, pInvoice.value(), pLetter.value(), today())));
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
