// The buyer's letters in the inbox panel (HNK-23.T7, HNK-25.T4, HNK-26.T8, T16, T18, buyer-late;
// IA port part 2, 2026-10-26): each kind's action, as the mailbox on the buyer's page ran it, and
// one line in plain words about each letter. Where an action leads (lib/inbox-routes.ts): the open
// invoice under Invoices, its slip under Pay, or History; keeping a settlement bundle completes in
// the panel.
import type { Handler, Handlers } from "../../app/inbox";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { account } from "../../lib/app-session";
import { append, head, localNextIndex } from "../../lib/buyer-history";
import { invoiceRecord, type BuyerInvoice } from "../../lib/buyer-invoices";
import { lateState, reminderText } from "../../lib/buyer-late";
import { contactId, type Contact } from "../../lib/contact";
import { daysToDate, fileHash, json, today, wasm, zatToZec } from "../../lib/core";
import { leadPath, letterAction, type Lead } from "../../lib/inbox-routes";
import { readablePrint } from "../../lib/print";
import { draft, send, type Received } from "../../lib/relay";
import { encodeMessage, verifyHeader, type Header, type MessageType } from "../../lib/relay-message";
import { chainState, findKeyIndex, invoiceByN, loadHistory, saveHistory, saveInvoice, toB64, withInvoiceIndex, type Inv } from "./data";

/** Where `type`'s action leads for invoice `r` (or `lead`, when the letter decides it). */
function to(type: MessageType, r?: Inv, lead?: Lead): { path: string } | undefined {
  const a = letterAction("buyer", type);
  const l = a ? leadPath(lead ?? a.lead, r?.ref) : null;
  return l ? { path: l.to } : undefined;
}

async function invoiceOf(h: Header): Promise<Inv> {
  const r = await invoiceByN(h.n ?? "").catch(() => undefined);
  if (!r) throw new Error("No invoice on this device matches this letter.");
  return r;
}

const facts = (r: BuyerInvoice) => `${r.invoice_id}, ${zatToZec(r.amount_zat)} ZEC due ${daysToDate(r.due_date)}`;

/** One line about a letter for one of this device's invoices, or that it is for none of them. */
const aboutInvoice = (line: (r: Inv, h: Header) => string) => async (x: Received) => {
  const r = await invoiceByN(x.message.header.n ?? "").catch(() => undefined);
  return r ? line(r, x.message.header) : "For an invoice that is not on this device.";
};

async function contactOf(mailbox: string): Promise<Contact | undefined> {
  return account.current?.store?.get<Contact>(contactId({ mailbox_pk: mailbox } as Contact)).catch(() => undefined);
}

/** The letter's work is done on its invoice already (judge run 2, finding 3); no invoice: not done. */
const doneOn = (yes: (r: Inv, h: Header) => boolean) => async (x: Received) => {
  const r = await invoiceByN(x.message.header.n ?? "").catch(() => undefined);
  return r ? yes(r, x.message.header) : false;
};

/** HNK-26.T16: the letter from the financier's node, or a seal on it, kept with the invoice. */
function keepAssignment(type: MessageType, take: (h: Header, files: Uint8Array[], r: Inv) => Promise<NonNullable<BuyerInvoice["assignment"]>>): Handler {
  return {
    handled: doneOn((r, h) => {
      const a = r.assignment;
      if (r.bundle) return true;
      if (type === "deal.letter") return !!a?.letter && a.letter === String(h.body.letter);
      const seal = String(h.body.seal);
      return a?.supplier_seal === seal || a?.financier_seal === seal || a?.buyer_seal === seal;
    }),
    about: aboutInvoice((r, h) =>
      type === "deal.letter"
        ? `The financier's assignment letter for ${facts(r)}, with its PDF: read it, then seal.`
        : h.from.role === "financier"
          ? `The financier sealed the assignment letter for ${r.invoice_id} when it paid the supplier the advance.`
          : `The supplier's seal on the assignment letter for ${r.invoice_id}.`,
    ),
    run: async (x) => {
      const h = x.message.header;
      const r = await invoiceOf(h);
      const add = await take(h, x.message.attachments, r);
      const next = await saveInvoice((prev) => ({ ...(prev ?? r), assignment: { ...(prev ?? r).assignment, ...add } }), r.n);
      const a = next.assignment!;
      if (a.financier_seal) {
        const said = `${r.invoice_id}: the financier sealed the letter and paid the supplier. Pay at maturity on its slip.`;
        return { said, did: { glyph: "印", title: "All three seals hold", text: `${said} The payment QR opens now.` }, to: to(type, next, { kind: "slip" }) };
      }
      const ready = !!(a.letter && a.supplier_seal);
      const said = ready ? `${r.invoice_id}: the letter and the supplier's seal are on the desk. Read the letter, then seal.` : `${r.invoice_id}: kept. Sealing waits for ${a.letter ? "the supplier's seal" : "the financier's letter"}.`;
      return { said, did: { glyph: "印", title: ready ? "Letter to seal" : "Kept with the invoice", text: said }, to: to(type, next) };
    },
  };
}

/**
 * HNK-26.T8: a financier asks for this buyer's history before it registers the invoice. The
 * certificate for this invoice is issued if it is not yet, then the chain up to it is sent.
 */
export async function sendHistory(x: Received): Promise<string> {
  const hd = x.message.header;
  const fin = String(hd.body.financier_pk);
  const rec = await invoiceOf(hd);
  if (!rec.signature) throw new Error("you have not signed this invoice: there is nothing to finance");
  if (chainState.successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates first");
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
  const certsOut = hist.certs.slice(0, index + 1);
  const hdOut = draft("history.chain", { role: "buyer", mailbox_pk: myIdentity().mailbox_pk }, hd.from.mailbox_pk, relayDeps, {
    n: rec.n,
    body: identity ? { certs: certsOut, identity_pk: identity } : { certs: certsOut },
  });
  await send(hd.from.mailbox_pk, await encodeMessage(hdOut as Header), relayDeps);
  return `Your history (${certsOut.length - 1} earlier invoice${certsOut.length === 2 ? "" : "s"} and the certificate for ${rec.invoice_id}) went to the financier. It checks them on the board; the supplier signs the entry next.`;
}

export const buyerInbox: Handlers = {
  // HNK-23.T7: the supplier's invoice and its PDF, kept once it is known to be addressed to one of
  // this buyer's keys (one passkey touch); the check and the signature happen on the open invoice
  "invoice.sign_request": {
    handled: doneOn((r, h) => r.invoice === String(h.body.invoice) && !!r.terms_pdf),
    about: async (x) => {
      const h = x.message.header;
      try {
        const f = json<{ invoice_id: string; amount_zat: number; due_date: number }>(wasm.invoiceDecode(String(h.body.invoice)));
        const name = h.attachments[0]?.name;
        const c = await contactOf(h.from.mailbox_pk);
        const who = c ? (c.username ? `@${c.username}` : `a supplier in your contacts (${c.fingerprint})`) : "a supplier not in your contacts yet";
        return `${f.invoice_id}, ${zatToZec(f.amount_zat)} ZEC due ${daysToDate(f.due_date)}, from ${who}${name ? `, with its PDF (${name})` : ""}.`;
      } catch {
        return "An invoice this app cannot read.";
      }
    },
    run: async (x) => {
      const hd = x.message.header;
      const invoice = String(hd.body.invoice);
      const f = json<{ supplier_pk: string; nullifier: string; invoice_id: string; amount_zat: number; due_date: number }>(wasm.invoiceDecode(invoice));
      if (hd.n !== f.nullifier) throw new Error("the letter names another invoice than the one it carries");
      if (!(await verifyHeader(hd, f.supplier_pk))) throw new Error("not signed by this invoice's supplier key");
      const pdf = x.message.attachments[0];
      if (!pdf) throw new Error("The invoice came without its PDF.");
      const k = await findKeyIndex(invoice);
      if (k === null) throw new Error("This invoice is not addressed to one of your invoice keys: it is not kept. Ask the supplier for your key.");
      const d = { nullifier: f.nullifier, invoice_id: f.invoice_id, amount_zat: f.amount_zat, due_date: f.due_date };
      const name = hd.attachments[0]?.name ?? `${f.invoice_id}.pdf`;
      const rec = await saveInvoice((prev) => ({ ...invoiceRecord(d, invoice, k, false, Date.now(), prev), reply_to: hd.from.mailbox_pk, terms_pdf: { name, b64: toB64(pdf) } }), f.nullifier);
      const said = `${f.invoice_id} is on the desk with its PDF. Check it, then sign.`;
      return { said, did: { glyph: "請", title: "Invoice on the desk", text: said }, to: to("invoice.sign_request", rec) };
    },
  },
  "deal.letter": keepAssignment("deal.letter", async (hd, files, rec) => {
    const letter = String(hd.body.letter);
    const f = json<{ financier_pk: string; terms_hash: string; matches_invoice: boolean | null }>(wasm.assignmentDecode(letter, rec.invoice));
    if (f.matches_invoice !== true) throw new Error("this letter is for another invoice");
    if (f.financier_pk !== hd.signer) throw new Error("the letter was not sent by the financier it names");
    if (!files[0] || (await fileHash(new File([new Uint8Array(files[0])], "letter.pdf"))) !== f.terms_hash) throw new Error("the PDF is not the letter's document");
    return { letter, pdf: toB64(files[0]), financier_pk: f.financier_pk, financier_mailbox: hd.from.mailbox_pk };
  }),
  "deal.seal": keepAssignment("deal.seal", async (hd, _files, rec) => {
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
  // BL-D26-02: who asks, for which invoice, before the buyer agrees; declining is not answering
  "history.request": {
    about: async (x) => {
      const hd = x.message.header;
      const rec = await invoiceByN(hd.n ?? "").catch(() => undefined);
      const c = await contactOf(hd.from.mailbox_pk);
      const who = c ? `${c.username ? `@${c.username}` : "A financier"} (fingerprint ${c.fingerprint})` : `A financier you have no card for (key ${readablePrint(String(hd.body.financier_pk))})`;
      const what = rec ? facts(rec) : "an invoice this device does not hold";
      return `${who} asks for your payment history before financing ${what}. Sending shows how your earlier invoices were paid, not who they were with. To decline, do nothing: no answer is sent.`;
    },
    run: async (x) => {
      const said = await sendHistory(x);
      return { said, did: { glyph: "歴", title: "History sent", text: said }, to: to("history.request") };
    },
  },
  // buyer-late: the financier's node reminds at D-7, D-1 and D+1; the slip says the rest
  "deal.reminder": {
    handled: doneOn((r) => !!r.bundle),
    about: aboutInvoice((rec) => {
      const s = lateState(rec, today());
      return s.kind === "due-soon" || s.kind === "overdue" ? `The financier reminds you: ${reminderText({ invoice_id: rec.invoice_id, state: s }, `${zatToZec(rec.amount_zat)} ZEC`)}` : `The financier's reminder for ${rec.invoice_id}, due ${daysToDate(rec.due_date)}.`;
    }),
    run: async (x) => {
      const hd = x.message.header;
      const rec = await invoiceOf(hd);
      if (!rec.assignment?.financier_pk || rec.assignment.financier_pk !== hd.signer) throw new Error("not from the financier your letter names");
      if (hd.body.due_date !== rec.due_date || hd.body.amount_zat !== rec.amount_zat) throw new Error("the reminder names another due date or amount than your invoice");
      const s = lateState(rec, today());
      const line = s.kind === "due-soon" || s.kind === "overdue" ? reminderText({ invoice_id: rec.invoice_id, state: s }, `${zatToZec(rec.amount_zat)} ZEC`) : `${rec.invoice_id} is due ${daysToDate(rec.due_date)}.`;
      return { said: `${rec.invoice_id} is open on Pay: its slip says what paying late means.`, did: { glyph: "期", title: s.kind === "overdue" ? `Past due: ${rec.invoice_id}` : `Due soon: ${rec.invoice_id}`, text: `${line} Pay it on the slip below.` }, to: to("deal.reminder", rec) };
    },
  },
  // HNK-26.T18: kept here, in the panel; the slip shows 済
  "deal.bundle": {
    handled: doneOn((r) => !!r.bundle),
    about: aboutInvoice((r) => `${r.invoice_id}: your repayment settled; the financier sent the bundle that proves the whole deal.`),
    run: async (x) => {
      const hd = x.message.header;
      const rec = await invoiceOf(hd);
      if (rec.assignment?.financier_pk !== hd.signer) throw new Error("not from the financier your letter names");
      const bundle = String(hd.body.bundle);
      if (json<{ nullifier: string }>(wasm.verifyBundle(bundle)).nullifier !== rec.n) throw new Error("this bundle is for another invoice");
      await saveInvoice((prev) => ({ ...(prev ?? rec), bundle }), rec.n);
      return { said: `${rec.invoice_id} is settled. The bundle is kept on this device: it proves the whole deal to anyone, on the Verify page.` };
    },
  },
};
