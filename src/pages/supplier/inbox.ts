// The supplier's letters in the inbox panel (HNK-23.T7, HNK-25.T2, HNK-26.T6, T16, T18; IA port
// 2026-10-26): each kind's action, as the mailbox on the supplier's desk ran it, and one line in
// plain words about each letter. Where an action leads (lib/inbox-routes.ts): the deal at the
// station it moved, or Write an invoice; keeping a settlement bundle completes in the panel.
import type { Handler, Handlers } from "../../app/inbox";
import { tiedTo } from "../../lib/letter-away";
import { account } from "../../lib/app-session";
import { cardFromKeyLetter, contactId, contactName, type Contact } from "../../lib/contact";
import { daysToDate, json, wasm, zatToZec } from "../../lib/core";
import { leadPath, letterAction } from "../../lib/inbox-routes";
import { readablePrint } from "../../lib/print";
import type { Received } from "../../lib/relay";
import type { Header, MessageType } from "../../lib/relay-message";
import { entryRequestProblems, type StationKey } from "../../lib/supplier-deal";
import { dealByN, keepArrivedKey, keepLetterCard, save, store, type Deal } from "./data";

const bytesToB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));

/** Where `type`'s action leads for deal `d`. */
function to(type: MessageType, d?: Deal): { path: string; at?: StationKey } | undefined {
  const a = letterAction("supplier", type);
  const l = a ? leadPath(a.lead, d?.ref) : null;
  return l ? { path: l.to, ...(l.at ? { at: l.at } : {}) } : undefined;
}

async function dealOf(h: Header): Promise<Deal> {
  const d = await dealByN(h.n ?? "");
  if (!d) throw new Error("No invoice on this device matches this letter.");
  return d;
}

const facts = (d: Deal) => `${d.invoice_id}, ${zatToZec(d.amount_zat)} ZEC due ${daysToDate(d.due_date)}`;

/** One line about a deal letter: the invoice it is about, or that it is for none of yours. */
const aboutDeal = (line: (d: Deal, h: Header) => string) => async (r: Received) => {
  const d = await dealByN(r.message.header.n ?? "").catch(() => undefined);
  return d ? line(d, r.message.header) : "For an invoice that is not on this device.";
};

/** The letter's work is done on its deal already (judge run 2, finding 3); no deal: not done. */
const doneOn = (yes: (d: Deal, h: Header) => boolean) => async (r: Received) => {
  const d = await dealByN(r.message.header.n ?? "").catch(() => undefined);
  return d ? yes(d, r.message.header) : false;
};

/**
 * HNK-26.T16: a letter from the financier's node about one of this device's deals, accepted only
 * from the financier the invoice was offered to (its key signed the letter).
 */
function fromFinancier(type: MessageType, [glyph, title]: [string, string], use: (d: Deal, h: Header, files: Uint8Array[]) => Promise<string>, about: (d: Deal, h: Header) => string, handled: (d: Deal, h: Header) => boolean): Handler {
  return {
    about: aboutDeal(about),
    handled: doneOn(handled),
    run: async (r) => {
      const h = r.message.header;
      const d = await dealOf(h);
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("This letter is not from the financier you offered this invoice to.");
      const said = await use(d, h, r.message.attachments);
      return { said, did: { glyph, title, text: said }, to: to(type, d) };
    },
  };
}

async function contactOf(mailbox: string): Promise<Contact | undefined> {
  return account.current?.store?.get<Contact>(contactId({ mailbox_pk: mailbox } as Contact)).catch(() => undefined);
}

const handlers: Handlers = {
  // HNK-23.T7: the buyer's signature, checked against its deal and kept
  "invoice.signature": {
    about: aboutDeal((d) => `For ${facts(d)}: the buyer signed it.`),
    handled: doneOn((d) => !!d.buyer_signature),
    run: async (r) => {
      const d = await dealOf(r.message.header);
      const s = String(r.message.header.body.buyer_signature);
      wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s })); // throws unless it holds for these bytes
      await save({ ...d, buyer_signature: s });
      return {
        said: `The buyer signed ${d.invoice_id}. Next: offer it to one financier.`,
        did: { glyph: "照", title: "Signed by the buyer", text: "The buyer's signature arrived and holds for exactly this invoice. Next: offer it to one financier." },
        to: to("invoice.signature", d),
      };
    },
  },
  // HNK-25.T2 (BL-D22-01): the buyer's key for the next invoice, with the mailbox it came from
  "key.invoice_pk": {
    // kept already, or an invoice was written for it
    handled: async (r) => {
      const k = String(r.message.header.body.invoice_pk);
      const all = await store().list<{ buyer_pk?: string; invoice_pk?: string }>();
      return all.some((x) => x.doc.invoice_pk === k || x.doc.buyer_pk === k);
    },
    about: async (r) => {
      const c = await contactOf(r.message.header.from.mailbox_pk);
      const card = c ? null : cardFromKeyLetter(r.message.header);
      const who = c ? `${c.username ? `@${c.username}` : "A buyer in your contacts"} (${c.fingerprint})` : card ? `${card.username ? `@${card.username}` : "A buyer"}, not in your contacts yet (fingerprint ${card.fingerprint}),` : "A buyer not in your contacts yet";
      const k = String(r.message.header.body.invoice_pk);
      // messy-state E2E 2026-10-27: the same key again (it moves on only once that invoice is financed)
      const used = (await store().list<{ buyer_pk?: string; invoice_id?: string }>()).find((x) => x.doc.buyer_pk === k)?.doc.invoice_id;
      if (used) return `${who} sent key ${readablePrint(k)} again: it is on ${used} already, and a key is for one invoice. Their next key comes once ${used} is financed.`;
      return `${who} sent the key for your next invoice to them, key ${readablePrint(k)}, signed by that key.`;
    },
    run: async (r) => {
      const h = r.message.header;
      const k = String(h.body.invoice_pk);
      if (h.signer !== k) throw new Error("This key did not sign its own letter: it is ignored.");
      await keepArrivedKey({ invoice_pk: k, mailbox_pk: h.from.mailbox_pk, at: Date.now() });
      // judge run 3, finding 2: the card in the signed letter, offered on the buyer line until added
      const card = (await contactOf(h.from.mailbox_pk)) ? null : cardFromKeyLetter(h);
      if (card) await keepLetterCard(card, Date.now());
      const said = `The buyer's key ${readablePrint(k)} is on your next invoice.${card ? ` Add ${card.username ? contactName(card) : "them"} to your contacts from the sheet's buyer line.` : ""}`;
      return { said, did: { glyph: "新", title: "Buyer's key received", text: `${said} Write the number, dates and amount on the sheet, add the PDF and create it: it goes back to the buyer's inbox to sign.` }, to: to("key.invoice_pk") };
    },
  },
  // HNK-26.T6: a financier declined the offer; the invoice is free to offer to another one
  "deal.decline": {
    about: aboutDeal((d, h) => `${d.invoice_id}: ${String(h.body.reason ?? "")}`),
    handled: doneOn((d, h) => !d.offer || d.offer.financier_pk !== h.signer || !!d.entry_request || !!d.entry),
    run: async (r) => {
      const h = r.message.header;
      const d = await dealOf(h);
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("This decline is not from the financier you offered this invoice to.");
      if (d.entry_request || d.entry) throw new Error("This financier already moved the deal on; a late decline is ignored.");
      const reason = String(h.body.reason ?? "");
      await save({ ...d, offer: undefined, declined: [...(d.declined ?? []), { financier_pk: d.offer.financier_pk, reason, at: Date.now() }] });
      return { said: `Declined: ${reason} You can offer ${d.invoice_id} to another financier.`, did: { glyph: "署", title: "Offer declined", text: `${reason} You can offer ${d.invoice_id} to another financier.`, warn: true }, to: to("deal.decline", d) };
    },
  },
  "deal.commitment_opening": fromFinancier(
    "deal.commitment_opening",
    ["登", "Entry request received"],
    async (d, h) => {
      const b = h.body as { financier_pk: string; salt: string; discount?: number; tenor?: number; history_tag?: string };
      // HNK-26.T8: with the buyer's history checked, the entry must carry the certificate's tag
      const r = { n: d.n, financier_pk: b.financier_pk, salt: b.salt, ...(b.discount !== undefined ? { discount: b.discount, tenor: b.tenor } : {}), ...(b.history_tag ? { history_tag: b.history_tag } : {}) };
      const problems = entryRequestProblems(d, r);
      if (problems.length) throw new Error(problems.join("; "));
      await save({ ...d, entry_request: r });
      return `The financier checked the board: sign the entry for ${d.invoice_id} (Step 3).`;
    },
    (d) => `The financier you offered ${d.invoice_id} to checked the public board and asks you to sign the invoice's public record.`,
    (d) => !!d.entry_request || !!d.entry,
  ),
  "deal.letter": fromFinancier(
    "deal.letter",
    ["印", "Financing letter received"],
    async (d, h, files) => {
      if (!files[0]) throw new Error("The letter came without its PDF.");
      await save({ ...d, letter_in: { letter: String(h.body.letter), pdf: bytesToB64(files[0]), at: Date.now() } });
      return `The financing letter for ${d.invoice_id} is here: read and seal it (Step 4).`;
    },
    (d) => `The financing letter for ${d.invoice_id}, with its PDF: read it, then seal.`,
    (d) => !!d.letter_in || !!d.seal,
  ),
  "deal.advance": fromFinancier(
    "deal.advance",
    ["金", "The financier paid the advance"],
    async (d, h) => {
      const b = h.body as { txid: string; advance_zat: number };
      await save({ ...d, advance_notice: { txid: b.txid, advance_zat: b.advance_zat, at: Date.now() } });
      return `The financier paid ${zatToZec(b.advance_zat)} ZEC: check it in your wallet (Step 5).`;
    },
    (d, h) => `For ${d.invoice_id}: ${zatToZec(Number(h.body.advance_zat))} ZEC paid to your address for this deal.`,
    (d) => !!d.advance_notice || !!d.advance?.matches || !!d.bundle,
  ),
  // HNK-26.T18: kept here, in the panel; the deal shows 済
  "deal.bundle": fromFinancier(
    "deal.bundle",
    ["済", "Repaid and settled"],
    async (d, h) => {
      const bundle = String(h.body.bundle);
      if (json<{ nullifier: string }>(wasm.verifyBundle(bundle)).nullifier !== d.n) throw new Error("This bundle is for another invoice.");
      await save({ ...d, bundle });
      return `${d.invoice_id} is settled: the buyer repaid and the financier posted the settled entry. The bundle is on the deal, ready for Verify.`;
    },
    (d) => `${d.invoice_id}: the buyer repaid and the financier posted the settled entry.`,
    (d) => !!d.bundle,
  ),
};

/** A letter about an invoice written on another device stays in the mailbox for it (messy-state E2E). */
export const supplierInbox: Handlers = tiedTo(handlers, async (n) => !!(await dealByN(n).catch(() => undefined)), ["key.invoice_pk"]);
