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
import { loadBoard } from "../lib/board";
import { append, dropTail, emptyHistory, head, HISTORY_ID, localNextIndex, type HistoryDoc } from "../lib/buyer-history";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { checkInvoice } from "../lib/buyer-check";
import { discard, draft, send, type Received } from "../lib/relay";
import { encodeMessage, verifyHeader, type Header } from "../lib/relay-message";
import { deskPage, miniInvoice, route } from "./desk";
import { mailboxCard } from "./mailbox";
import { invoiceRecord, invoiceStatus, isInvoiceId, sortInvoices, storeId, withSignature, type BuyerInvoice } from "../lib/buyer-invoices";
import { daysToDate, fileHash, json, today, wasm, zatToZec } from "../lib/core";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out, trustedSvg } from "../lib/ui";

// This tab only: the history check found the board ahead of this device, so issuing is blocked.
let successorOnBoard = false;

// This tab only: sign requests opened from the inbox, by N: who to answer, and the relay message to
// remove once the signature is sent (it stays until then, so its PDF is not lost).
const pending = new Map<string, { replyTo: string; relayId: string }>();

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

/** One passkey touch: the history index of the key `invoice` is addressed to, or null. */
async function findKeyIndex(invoice: string): Promise<number | null> {
  try {
    return await withInvoiceIndex(invoice, (_m, k) => k);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("this invoice is not addressed")) return null;
    throw e;
  }
}

// Received invoices in the encrypted device store (BL-D22-07): saved once the invoice is known to
// be addressed to one of the buyer's keys, again with the signature.
async function loadInvoices(): Promise<BuyerInvoice[]> {
  const store = account.current?.store;
  if (!store) return [];
  return sortInvoices((await store.list<BuyerInvoice>()).filter((r) => isInvoiceId(r.id)).map((r) => r.doc));
}

async function saveInvoice(update: (previous: BuyerInvoice | undefined) => BuyerInvoice, n: string): Promise<void> {
  const store = account.current?.store;
  if (!store) return;
  await store.put(storeId(n), update(await store.get<BuyerInvoice>(storeId(n))));
}

/** Sends the signature on invoice N to the supplier's mailbox and removes the request it answers. */
async function sendSignature(n: string, signature: string, replyTo: string): Promise<void> {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  const me = myIdentity();
  const header = { ...draft("invoice.signature", { role: "buyer", mailbox_pk: me.mailbox_pk }, replyTo, relayDeps, { n, body: { buyer_signature: signature } }) };
  await send(replyTo, await encodeMessage(header), relayDeps);
  await saveInvoice((prev) => {
    if (!prev) throw new Error("check the invoice first");
    return { ...prev, reply_to: replyTo, signature_sent_at: Date.now() };
  }, n);
  const p = pending.get(n);
  if (p) {
    pending.delete(n);
    await discard(s.inbox, p.relayId, relayDeps).catch(() => undefined); // expires anyway
  }
}

export function buyerPage(): HTMLElement {
  // 1. keys and history
  const board = fileField("Board data (optional)", "Without a file the live testnet board is read (the last one this browser saw, or a bundled copy, if the node does not answer). Checks which of your certificates are anchored.");
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
            const boardJson = (await board.input.files?.[0]?.text()) ?? (await loadBoard((u, i) => fetch(u, i)).catch(() => undefined))?.json;
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

  // 2. sign the invoice: signing stays off until the terms PDF matches and the key is ours
  // (HNK-25.T1, BL-D22-06)
  const sInvoice = field("Invoice code from the supplier", { area: true });
  const sTerms = fileField("Terms PDF from the supplier", "Hashed in your browser and compared with the invoice; the file is not sent anywhere.");
  const signOut = new Out();
  let checked: string | null = null; // the invoice text that passed both checks
  const signBtn = button("Sign invoice", async () => {
    try {
      if (checked === null || checked !== sInvoice.value()) throw new Error("check the invoice first");
      const f = json<Record<string, string | number>>(wasm.invoiceDecode(checked));
      const sig = await withInvoiceIndex(checked, (m, k) => wasm.buyerSignInvoiceBytes(m, k, checked as string));
      await saveInvoice((prev) => {
        if (!prev) throw new Error("check the invoice first");
        return withSignature(prev, sig);
      }, String(f.nullifier));
      const n = String(f.nullifier);
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(n));
      const replyTo = rec?.reply_to ?? pending.get(n)?.replyTo;
      const sendOut = new Out();
      const sendBtn: HTMLButtonElement | null = replyTo
        ? button("Send signature to the supplier", async () => {
            try {
              await sendSignature(n, sig, replyTo);
              sendRow?.remove(); // sent once; a second copy would only repeat it
              sendOut.show(banner("ok", "Signature sent", "Sealed to the supplier's mailbox. The supplier offers the invoice to a financier next."));
              void refreshInvoices();
            } catch (e) {
              sendOut.error(e);
            }
          })
        : null;
      const sendRow = sendBtn ? actions(sendBtn) : null;
      signOut.show(invoiceTable(f), sendRow ?? codeBlock("Your signature: send it to the supplier", sig, "buyer.signature.txt"), sendOut.el);
      void refreshInvoices();
    } catch (e) {
      signOut.error(e);
    }
  });
  const lock = () => {
    checked = null;
    signBtn.disabled = true;
  };
  lock();
  sInvoice.input.addEventListener("input", lock);
  sTerms.input.addEventListener("change", lock);
  const signCard = card(
    "Step 2",
    "Review and sign the invoice",
    "Your signature confirms the trade happened. Check every field: this is what financiers rely on.",
    sInvoice.el,
    sTerms.el,
    actions(
      button("Check invoice", async () => {
        try {
          lock();
          const invoice = sInvoice.value();
          const f = json<Record<string, string | number>>(wasm.invoiceDecode(invoice));
          const file = sTerms.input.files?.[0];
          const hash = file ? await fileHash(file) : null;
          const keyIndex = await findKeyIndex(invoice);
          const r = checkInvoice({ termsHash: String(f.terms_hash), fileHash: hash, keyIndex });
          if (keyIndex !== null) {
            const d = { nullifier: String(f.nullifier), invoice_id: String(f.invoice_id), amount_zat: Number(f.amount_zat), due_date: Number(f.due_date) };
            const p = pending.get(d.nullifier);
            await saveInvoice((prev) => ({ ...invoiceRecord(d, invoice, keyIndex, r.canSign, Date.now(), prev), ...(p ? { reply_to: p.replyTo } : {}) }), d.nullifier);
            void refreshInvoices();
          }
          signOut.show(banner(r.kind, r.title, r.text), kv(r.rows), invoiceTable(f));
          if (r.canSign) {
            checked = invoice;
            signBtn.disabled = false;
          }
        } catch (e) {
          signOut.error(e);
        }
      }, true),
      signBtn,
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
          // HNK-26.T16: when the letter came through the mailbox, the seal goes back the same way
          const n = json<{ nullifier: string }>(wasm.invoiceDecode(lInvoice.value())).nullifier;
          const rec = await account.current?.store?.get<BuyerInvoice>(storeId(n));
          const a = rec?.assignment;
          const to = a && a.letter === lLetter.value() ? [a.financier_mailbox, a.supplier_mailbox].filter((x): x is string => !!x) : [];
          for (const t of to) {
            const hd = draft("deal.seal", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n, body: { seal, index: 1 } });
            await send(t, await encodeMessage(hd as Header), relayDeps);
          }
          if (to.length && rec) {
            await saveInvoice((prev) => ({ ...(prev ?? rec), assignment: { ...a, buyer_seal: seal, sealed_at: Date.now() } }), n);
            sealOut.show(banner("ok", "Sealed and sent", "Your seal went to the financier and the supplier. The financier pays the advance next, with its own seal."));
          } else sealOut.show(codeBlock("Your seal: send it to the financier", seal, "buyer.seal.txt"));
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
          // HNK-25.T4: a letter that came through the mailbox is paid only once all three seals hold
          const n = json<{ nullifier: string }>(wasm.invoiceDecode(pInvoice.value())).nullifier;
          const a = (await account.current?.store?.get<BuyerInvoice>(storeId(n)))?.assignment;
          if (a?.letter === pLetter.value()) {
            const seals = [a.supplier_seal, a.buyer_seal, a.financier_seal].filter((x): x is string => !!x);
            if (seals.length < 3 || wasm.assignmentStatus(pInvoice.value(), a.letter, JSON.stringify(seals)) !== "Sealed") {
              throw new Error("the letter is not complete yet: the financier seals it when it pays the advance; wait for that seal in your inbox");
            }
          }
          const payTo = json<{ financier_address: string }>(wasm.assignmentDecode(pLetter.value(), pInvoice.value())).financier_address;
          const r = json<{ uri: string; qr_svg: string }>(await withInvoiceIndex(pInvoice.value(), (m, k) => wasm.buyerRepaymentBytes(m, k, pInvoice.value(), pLetter.value(), today())));
          payOut.show(trustedSvg(r.qr_svg), kv([["Pays the financier at", payTo, true]]), codeBlock("Payment request (ZIP-321)", r.uri));
        } catch (e) {
          payOut.error(e);
        }
      }),
    ),
    payOut.el,
  );

  // inbox: a sign request fills step 2 with the invoice and its PDF (HNK-23.T7)
  const fromInbox = {
    label: "Open in step 2",
    keep: true,
    run: async (r: Received): Promise<string> => {
      const hd = r.message.header;
      const invoice = String(hd.body.invoice);
      const f = json<{ supplier_pk: string; nullifier: string; invoice_id: string }>(wasm.invoiceDecode(invoice));
      if (hd.n !== f.nullifier) throw new Error("the message names another invoice than the one it carries");
      if (!(await verifyHeader(hd, f.supplier_pk))) throw new Error("not signed by this invoice's supplier key");
      const pdf = r.message.attachments[0];
      pending.set(f.nullifier, { replyTo: hd.from.mailbox_pk, relayId: r.relayId });
      sInvoice.input.value = invoice;
      sInvoice.input.dispatchEvent(new Event("input", { bubbles: true }));
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(pdf)], hd.attachments[0]?.name ?? `${f.invoice_id}.pdf`, { type: "application/pdf" }));
      sTerms.input.files = dt.files;
      sTerms.input.dispatchEvent(new Event("change", { bubbles: true }));
      signCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return `${f.invoice_id} is in step 2 with its PDF. Check it, then sign.`;
    },
  };
  // HNK-26.T16: the letter from the financier's node and the supplier's seal fill step 3
  const fillSeal = (rec: BuyerInvoice) => {
    if (rec.assignment?.financier_seal && rec.assignment.letter) {
      pInvoice.input.value = rec.invoice;
      pLetter.input.value = rec.assignment.letter;
      payCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    lInvoice.input.value = rec.invoice;
    if (rec.assignment?.letter) lLetter.input.value = rec.assignment.letter;
    if (rec.assignment?.supplier_seal) lSeal.input.value = rec.assignment.supplier_seal;
    sealCard.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const keepAssignment = (label: string, take: (hd: Received["message"]["header"], files: Uint8Array[], rec: BuyerInvoice) => Promise<NonNullable<BuyerInvoice["assignment"]>>) => ({
    label,
    run: async (r: Received): Promise<string> => {
      const hd = r.message.header;
      const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
      if (!rec) throw new Error("no invoice on this device has this fingerprint N");
      const add = await take(hd, r.message.attachments, rec);
      const next = { ...rec, assignment: { ...rec.assignment, ...add } };
      await saveInvoice(() => next, rec.n);
      fillSeal(next);
      return next.assignment.financier_seal
        ? `${rec.invoice_id}: the financier sealed the letter and paid the supplier. Pay at maturity in step 5.`
        : next.assignment.letter && next.assignment.supplier_seal
        ? `${rec.invoice_id}: letter and the supplier's seal are in step 3. Read the letter, then seal.`
        : `${rec.invoice_id}: kept. Step 3 waits for ${next.assignment.letter ? "the supplier's seal" : "the financier's letter"}.`;
    },
  });
  const mailCard = mailboxCard({
    "invoice.sign_request": fromInbox,
    "deal.letter": keepAssignment("Keep the letter", async (hd, files, rec) => {
      const letter = String(hd.body.letter);
      const f = json<{ financier_pk: string; terms_hash: string; matches_invoice: boolean | null }>(wasm.assignmentDecode(letter, rec.invoice));
      if (f.matches_invoice !== true) throw new Error("this letter is for another invoice");
      if (f.financier_pk !== hd.signer) throw new Error("the letter was not sent by the financier it names");
      if (!files[0] || (await fileHash(new File([new Uint8Array(files[0])], "letter.pdf"))) !== f.terms_hash) throw new Error("the PDF is not the letter's document");
      return { letter, pdf: btoa(Array.from(files[0], (x) => String.fromCharCode(x)).join("")), financier_pk: f.financier_pk, financier_mailbox: hd.from.mailbox_pk };
    }),
    "deal.seal": keepAssignment("Keep the seal", async (hd, _files, rec) => {
      if (hd.from.role === "supplier" && hd.body.index === 0) return { supplier_seal: String(hd.body.seal), supplier_mailbox: hd.from.mailbox_pk };
      // HNK-25.T4: the financier's seal completes the letter; checked against the whole chain
      const a = rec.assignment;
      if (hd.from.role === "financier" && hd.body.index === 2 && a?.letter && a.supplier_seal && a.buyer_seal) {
        const s2 = String(hd.body.seal);
        if (wasm.assignmentStatus(rec.invoice, a.letter, JSON.stringify([a.supplier_seal, a.buyer_seal, s2])) !== "Sealed") throw new Error("this seal does not complete your letter");
        return { financier_seal: s2 };
      }
      throw new Error("not a seal this device expects for this invoice");
    }),
    // HNK-26.T8: a financier asks for this buyer's history before it registers the invoice
    "history.request": {
      label: "Send my history",
      run: async (r: Received): Promise<string> => {
        const hd = r.message.header;
        const fin = String(hd.body.financier_pk);
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        if (!rec) throw new Error("no invoice on this device has this fingerprint N");
        if (!rec.signature) throw new Error("you have not signed this invoice: there is nothing to finance");
        if (successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates first");
        let hist = await loadHistory();
        let index = rec.history_cert?.financier_pk === fin ? rec.history_cert.index : null;
        let identity = "";
        if (index === null || index >= hist.certs.length) {
          const next = localNextIndex(hist);
          const made = await withInvoiceIndex(rec.invoice, (m, k) => {
            const id = json<{ identity_pk: string }>(wasm.buyerKeysBytes(m.slice(), 0)).identity_pk;
            if (k !== next) {
              m.fill(0);
              throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
            }
            return { cert: wasm.buyerHistoryCertBytes(m, k, rec.invoice, fin, head(hist)), k, id };
          });
          hist = append(hist, made.k, made.cert);
          await saveHistory(hist);
          index = made.k;
          identity = made.id;
          await saveInvoice((prev) => ({ ...(prev ?? rec), history_cert: { index: made.k, financier_pk: fin } }), rec.n);
        }
        const certs = hist.certs.slice(0, index + 1);
        const hdOut = draft("history.chain", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, hd.from.mailbox_pk, relayDeps, {
          n: rec.n,
          body: identity ? { certs, identity_pk: identity } : { certs },
        });
        await send(hd.from.mailbox_pk, await encodeMessage(hdOut as Header), relayDeps);
        return `Your history (${certs.length - 1} earlier invoice${certs.length === 2 ? "" : "s"} and the certificate for ${rec.invoice_id}) went to the financier. It checks them on the board; the supplier signs the entry next.`;
      },
    },
    "deal.bundle": {
      label: "Keep the settlement bundle",
      run: async (r: Received): Promise<string> => {
        const hd = r.message.header;
        const rec = await account.current?.store?.get<BuyerInvoice>(storeId(hd.n ?? ""));
        if (!rec) throw new Error("no invoice on this device has this fingerprint N");
        if (rec.assignment?.financier_pk !== hd.signer) throw new Error("not from the financier your letter names");
        const bundle = String(hd.body.bundle);
        const v = json<{ nullifier: string }>(wasm.verifyBundle(bundle));
        if (v.nullifier !== rec.n) throw new Error("this bundle is for another invoice");
        await saveInvoice((prev) => ({ ...(prev ?? rec), bundle }), rec.n);
        void refreshInvoices();
        return `${rec.invoice_id} is settled. The bundle is kept on this device: it proves the whole deal to anyone, on the Verify page.`;
      },
    },
  });

  // The stage (HNK-30.T17): the invoice in hand and its route along the counter rail. Only the
  // first three stations are tracked on this device; sealing and paying follow in their steps.
  const stage = h("section", { class: "ds", "aria-label": "The invoice in hand" });
  const paintStage = (rec?: BuyerInvoice) => {
    const done = rec ? [rec.terms_checked, !!rec.signature, !!rec.signature_sent_at] : [false, false, false];
    const first = done.indexOf(false);
    const state = (i: number): "done" | "next" | "later" => (i < 3 && done[i] ? "done" : i === (first < 0 ? 3 : first) ? "next" : "later");
    const stations = [
      { glyph: "受", label: "Checked with its PDF" },
      { glyph: "署", label: "Signed" },
      { glyph: "送", label: "Sent to the supplier" },
      { glyph: "印", label: "Letter sealed" },
      { glyph: "払", label: "Paid at maturity" },
    ].map((x, i) => ({ ...x, state: state(i) }));
    stage.replaceChildren(
      miniInvoice(rec ? { id: rec.invoice_id, amount: `${zatToZec(rec.amount_zat)} ZEC`, due: daysToDate(rec.due_date), n: rec.n, sealed: !!rec.signature } : null),
      route(stations, rec ? `${rec.invoice_id}: ${invoiceStatus(rec)}.` : "Invoices addressed to your keys arrive in your mailbox below."),
    );
  };
  paintStage();

  // 0. the invoices received on this device, newest first; Open fills every step
  const listOut = new Out();
  const open = (rec: BuyerInvoice) => {
    paintStage(rec);
    for (const f of [sInvoice, lInvoice, hInvoice, pInvoice]) {
      f.input.value = rec.invoice;
      f.input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    signCard.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const refreshInvoices = async () => {
    try {
      const list = await loadInvoices();
      if (!account.current?.store) return listOut.show(h("p", { class: "hint" }, "This browser blocks local storage, so received invoices are not kept."));
      if (!list.length) return listOut.show(h("p", { class: "hint" }, "No invoice yet. Check one in step 2 and it is kept here, encrypted on this device."));
      paintStage(list[0]);
      listOut.show(
        h(
          "div",
          { class: "deals" },
          ...list.map((rec) =>
            h(
              "div",
              { class: "deal" },
              h(
                "div",
                { class: "deal-head" },
                h("strong", {}, rec.invoice_id),
                h("span", {}, `${zatToZec(rec.amount_zat)} ZEC · due ${daysToDate(rec.due_date)} · key #${rec.key_index}`),
                button("Open", () => open(rec), true),
              ),
              h("small", {}, invoiceStatus(rec)),
            ),
          ),
        ),
      );
    } catch (e) {
      listOut.error(e);
    }
  };
  const listCard = card("Invoices", "Your invoices", "Invoices addressed to your keys, kept encrypted on this device after you check them.", listOut.el);
  void refreshInvoices();

  return deskPage({
    glyph: "買",
    eyebrow: "Buyer's counter",
    title: "Buyer",
    lede: "Confirm the invoice, acknowledge who you will pay, and pay at maturity, all from keys only you hold.",
    stage,
    docs: [mailCard, listCard, keysCard, signCard, sealCard, histCard, payCard],
  });
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
