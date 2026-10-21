// Supplier screen (HNK-10.T2; HNK-24.T2, T4 – T9; HNK-22.T4): opens in a supplier session, keeps
// every deal in the encrypted device store, and walks each deal from invoice to advance.
//
// Keys: the per-invoice key comes from the supplier master (P-03, HNK-24.T1), so there is no secret
// to back up. No master stays in this tab: every action that needs a key is a stamp (one passkey
// touch, `account.stamp()`), and the jitsuin-wasm `*Bytes` call zeroes it. The invoice and its
// PDF go to the buyer through the relay, sealed to the buyer's mailbox, and the buyer's signature
// comes back the same way (HNK-23.T7); later steps still travel by copy-paste until the financier
// node exists (HNK-26).
import { NET } from "../lib/network";
import { financierFingerprint } from "../lib/account";
import { rank, recordLine, verifyDirectory, type Directory, type Fit } from "../lib/directory";
import { PROVIDER } from "../lib/provider";
import { loadBoard } from "../lib/board";
import { boardStatus } from "../lib/buyer-invoices";
import { account } from "../lib/app-session";
import { dateToDays, daysToDate, fileHash, json, wasm, zatToZec, zecToZat } from "../lib/core";
import {
  decodeEntryRequest,
  encodeOffer,
  entryRequestProblems,
  invoiceIdTaken,
  looksShielded,
  nextAction,
  nextStep,
  sortDeals,
  STEPS,
  timeline,
  type SupplierDeal,
} from "../lib/supplier-deal";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out } from "../lib/ui";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { draft, send, signInWasm } from "../lib/relay";
import { describeFiles, encodeMessage } from "../lib/relay-message";
import { mailboxCard, useContact } from "./mailbox";
import { deskPage, miniInvoice, route } from "./desk";

// The open deal, for this tab: survives moving between screens, gone when the tab closes.
let current: string | null = null;

const HEX64 = /^[0-9a-f]{64}$/i;
const LEAD = "Issue an invoice, have the buyer sign it, offer it to one financier, sign its board entry, seal the letter and receive the advance.";

function hex64(value: string, what: string): string {
  const v = value.trim().toLowerCase();
  if (!HEX64.test(v)) throw new Error(`${what}: expected 64 hex characters`);
  return v;
}

/** Per-invoice secret for `d` from one stamp; the supplier `*Bytes` function that receives it zeroes it. */
async function secretFor(d: SupplierDeal): Promise<Uint8Array> {
  return wasm.supplierInvoiceSecretBytes(await account.stamp(), d.invoice_id, d.buyer_pk);
}

async function save(d: SupplierDeal): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("sign in as supplier first");
  await store.put(d.n, d);
}

export function supplierPage(): HTMLElement {
  const root = h("div", { "data-wide": "true" });
  const refresh = (): void => {
    void render(root, refresh);
  };
  refresh();
  return root;
}

async function render(root: HTMLElement, refresh: () => void): Promise<void> {
  const store = account.current?.store;
  if (!store) return;
  // the store also keeps contacts ("contact:" ids); deals are stored under their N
  const deals = sortDeals((await store.list<SupplierDeal>()).filter((r) => HEX64.test(r.id)).map((r) => r.doc));
  const open = deals.find((d) => d.n === current) ?? null;
  const cards: HTMLElement[] = [mailboxCard({
      "invoice.signature": signatureFromInbox(refresh),
      "deal.decline": declineFromInbox(refresh),
      "deal.commitment_opening": fromFinancier(refresh, "Use this entry request", async (d, h) => {
        const b = h.body as { financier_pk: string; salt: string; discount?: number; tenor?: number; history_tag?: string };
        // HNK-26.T8: with the buyer's history checked, the entry must carry the certificate's tag
        const r = { n: d.n, financier_pk: b.financier_pk, salt: b.salt, ...(b.discount !== undefined ? { discount: b.discount, tenor: b.tenor } : {}), ...(b.history_tag ? { history_tag: b.history_tag } : {}) };
        const problems = entryRequestProblems(d, r);
        if (problems.length) throw new Error(problems.join("; "));
        await save({ ...d, entry_request: r });
        return `The financier checked the board: sign the entry for ${d.invoice_id} (Step 3).`;
      }),
      "deal.letter": fromFinancier(refresh, "Keep the letter", async (d, h, files) => {
        if (!files[0]) throw new Error("the letter came without its PDF");
        await save({ ...d, letter_in: { letter: String(h.body.letter), pdf: bytesToB64(files[0]), at: Date.now() } });
        return `The assignment letter for ${d.invoice_id} is here: read and seal it (Step 4).`;
      }),
      "deal.bundle": fromFinancier(refresh, "Keep the settlement bundle", async (d, h) => {
        const bundle = String(h.body.bundle);
        if (json<{ nullifier: string }>(wasm.verifyBundle(bundle)).nullifier !== d.n) throw new Error("this bundle is for another invoice");
        await save({ ...d, bundle });
        return `${d.invoice_id}: the buyer repaid and the financier posted the settled entry. The bundle proves the whole deal on the Verify page.`;
      }),
      "deal.advance": fromFinancier(refresh, "Note the advance", async (d, h) => {
        const b = h.body as { txid: string; advance_zat: number };
        await save({ ...d, advance_notice: { txid: b.txid, advance_zat: b.advance_zat, at: Date.now() } });
        return `The financier paid ${zatToZec(b.advance_zat)} ZEC in ${b.txid.slice(0, 10)}…: check it in your wallet (Step 5).`;
      }),
    }), dealsCard(deals, refresh), newInvoiceCard(deals, refresh)];
  if (!store.persistent) {
    cards.unshift(banner("warn", "Not saved", "This browser blocks local storage here (private window?). Deals stay only until the tab closes."));
  }
  if (open) cards.push(...dealCards(open, refresh));
  // The stage (HNK-30.T17): the open deal's 請求書 and its route along the counter rail.
  const GLYPH = { signature: "買", offer: "送", entry: "登", seal: "印", advance: "金" } as const;
  const stations = open
    ? timeline(open).map((s) => ({ glyph: GLYPH[s.key], label: s.label, state: s.state }))
    : STEPS.map((s) => ({ glyph: GLYPH[s.key], label: s.label, state: "later" as const }));
  const next = open ? nextAction(open) : null;
  const stage = h(
    "section",
    { class: "ds", "aria-label": "The open deal" },
    miniInvoice(
      open
        ? { id: open.invoice_id, amount: `${zatToZec(open.amount_zat)} ZEC`, due: daysToDate(open.due_date), n: open.n, sealed: !!open.buyer_signature, stamp: open.advance?.matches ? "済" : undefined }
        : null,
    ),
    route(stations, open ? (next ? `Next: ${next}.` : "Complete: the advance arrived as agreed.") : deals.length ? "Open a deal below to see where it stands." : "Issue your first invoice below."),
  );
  root.replaceChildren(deskPage({ glyph: "売", eyebrow: "Supplier's counter", title: "Supplier", lede: LEAD, stage, docs: cards }));
}

// ---------- deals and timeline (HNK-24.T9) ----------

function dealsCard(deals: SupplierDeal[], refresh: () => void): HTMLElement {
  const rows = deals.map((d) => {
    const next = nextAction(d);
    return h(
      "div",
      { class: d.n === current ? "deal open" : "deal" },
      h(
        "div",
        { class: "deal-head" },
        h("strong", {}, d.invoice_id),
        h("span", {}, `${zatToZec(d.amount_zat)} ZEC · due ${daysToDate(d.due_date)}`),
        button(d.n === current ? "Opened" : "Open", () => {
          current = d.n;
          refresh();
        }, true),
      ),
      h("ol", { class: "steps" }, ...timeline(d).map((s) => h("li", { class: `chip ${s.state}` }, s.label))),
      h("small", {}, next ? `Next: ${next}` : "Complete"),
      boardLine(d),
    );
  });
  // HNK-25.T7 (BL-D25-09): each offered deal against the live board, filled in when it loads
  if (deals.some((d) => d.buyer_signature && d.offer)) {
    void loadBoard((u, i) => fetch(u, i)).then(
      (b) => {
        for (const d of deals) {
          const el = document.getElementById(`board-${d.n}`);
          if (el) el.textContent = statusOnBoard(d, b.json) ?? "";
        }
      },
      () => undefined,
    );
  }
  return card(
    "Deals",
    "Your deals",
    "One line per invoice, newest first. Open a deal to do its next step.",
    rows.length ? h("div", { class: "deals" }, ...rows) : h("p", { class: "hint" }, "No deal yet. Create an invoice below."),
  );
}

/** The board line under a deal, filled once the board loads. */
function boardLine(d: SupplierDeal): HTMLElement | null {
  return d.buyer_signature && d.offer ? h("small", { id: `board-${d.n}`, class: "board-line" }, "") : null;
}

/** What the board says about this deal, from the bundle the financier sent or what this device holds. */
function statusOnBoard(d: SupplierDeal, boardJson: string): string | null {
  try {
    const bundle =
      d.bundle ??
      wasm.bundleBuild(
        JSON.stringify({
          invoice: d.invoice,
          buyer_signature: d.buyer_signature,
          ...(d.seal ? { assignment: d.seal.letter, seals: [d.seal.s0], with_settlement: true } : {}),
        }),
      );
    return `On the board: ${boardStatus(json<{ register: { status: string }; settled: { on_time: boolean } | null }>(wasm.bundleOnBoard(bundle, boardJson)))}`;
  } catch {
    return null;
  }
}

// ---------- new invoice (HNK-24.T2) ----------

function newInvoiceCard(deals: SupplierDeal[], refresh: () => void): HTMLElement {
  const id = field("Invoice number", { placeholder: "TES-INV-0007", help: "1–32 characters, never reused. Test data starts with TES-." });
  const buyer = field("Buyer key for this invoice", { placeholder: "64 hex characters from the buyer's screen" });
  const amount = field("Amount (ZEC)", { type: "number", placeholder: "0.0004" });
  const issue = field("Issue date", { type: "date" });
  const due = field("Due date", { type: "date" });
  const terms = fileField("Invoice document (PDF)", "Hashed in your browser with SHA-256. The file is never uploaded.");
  const out = new Out();
  return card(
    "New",
    "Create an invoice",
    "Its key is derived from your passkey, the invoice number and the buyer's key. The canonical invoice is what the buyer signs; its fingerprint N is what financiers look up on the board.",
    id.el,
    buyer.el,
    h("div", { class: "row" }, amount.el, issue.el, due.el),
    terms.el,
    actions(
      button("Create invoice", async () => {
        try {
          const invoiceId = id.value();
          if (invoiceId.length < 1 || invoiceId.length > 32) throw new Error("invoice number: 1–32 characters");
          if (invoiceIdTaken(deals, invoiceId)) throw new Error(`invoice number ${invoiceId} is already used on this device`);
          const buyerPk = hex64(buyer.value(), "buyer key");
          const file = terms.input.files?.[0];
          if (!file) throw new Error("choose the invoice document");
          const supplierPk = wasm.supplierInvoicePublicKeyBytes(await account.stamp(), invoiceId, buyerPk);
          const amountZat = zecToZat(amount.value());
          const dueDay = dateToDays(due.value());
          const code = wasm.invoiceEncode(
            JSON.stringify({
              invoice_id: invoiceId,
              supplier_pk: supplierPk,
              buyer_pk: buyerPk,
              amount_zat: amountZat,
              issue_date: dateToDays(issue.value()),
              due_date: dueDay,
              terms_hash: await fileHash(file),
            }),
          );
          const n = json<{ nullifier: string }>(wasm.invoiceDecode(code)).nullifier;
          await save({
            n,
            invoice_id: invoiceId,
            buyer_pk: buyerPk,
            supplier_pk: supplierPk,
            amount_zat: amountZat,
            due_date: dueDay,
            invoice: code,
            created_at: Date.now(),
          });
          current = n;
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

// ---------- one deal (HNK-24.T4 – T8) ----------

function dealCards(d: SupplierDeal, refresh: () => void): HTMLElement[] {
  const cards = [
    card(
      "Deal",
      d.invoice_id,
      "The invoice the buyer signs; its fingerprint N is what financiers look up on the board.",
      kv([
        ["Fingerprint N", d.n, true],
        ["Amount", `${zatToZec(d.amount_zat)} ZEC`],
        ["Due", daysToDate(d.due_date)],
        ["Your key for this invoice", d.supplier_pk, true],
        ["Buyer key", d.buyer_pk, true],
      ]),
      codeBlock("Invoice code", d.invoice, `${d.invoice_id}.invoice.txt`),
    ),
    signatureCard(d, refresh),
  ];
  if (d.buyer_signature) cards.push(offerCard(d, refresh));
  if (d.offer) cards.push(entryCard(d, refresh), sealCard(d, refresh));
  if (d.seal) cards.push(advanceCard(d, refresh));
  if (!nextStep(d)) cards.push(card("Done", "Deal complete", "The advance arrived as agreed. The buyer pays the financier at maturity."));
  return cards;
}

/** HNK-23.T7: a buyer's signature from the inbox, checked against its deal and kept. */
function signatureFromInbox(refresh: () => void) {
  return {
    label: "Check and keep",
    run: async (r: import("../lib/relay").Received): Promise<string> => {
      const n = r.message.header.n ?? "";
      const d = await account.current?.store?.get<SupplierDeal>(n);
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      const s = String(r.message.header.body.buyer_signature);
      wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
      await save({ ...d, buyer_signature: s });
      current = d.n;
      refresh();
      return `The buyer signed ${d.invoice_id}. Next: offer it to one financier.`;
    },
  };
}

const bytesToB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * HNK-26.T16: a message from the financier's node about one of this device's deals, accepted only
 * from the financier the invoice was offered to (its key signed the header).
 */
function fromFinancier(
  refresh: () => void,
  label: string,
  use: (d: SupplierDeal, h: import("../lib/relay-message").Header, files: Uint8Array[]) => Promise<string>,
) {
  return {
    label,
    run: async (r: import("../lib/relay").Received): Promise<string> => {
      const h = r.message.header;
      const d = await account.current?.store?.get<SupplierDeal>(h.n ?? "");
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("this message is not from the financier you offered this invoice to");
      const done = await use(d, h, r.message.attachments);
      current = d.n;
      refresh();
      return done;
    },
  };
}

/** HNK-26.T6: a financier declined the offer; the invoice is free to offer to another one. */
function declineFromInbox(refresh: () => void) {
  return {
    label: "Note and free the invoice",
    run: async (r: import("../lib/relay").Received): Promise<string> => {
      const h = r.message.header;
      const d = await account.current?.store?.get<SupplierDeal>(h.n ?? "");
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("this decline is not from the financier you offered this invoice to");
      if (d.entry_request || d.entry) throw new Error("this financier already moved the deal on; a late decline is ignored");
      const reason = String(h.body.reason ?? "");
      await save({ ...d, offer: undefined, declined: [...(d.declined ?? []), { financier_pk: d.offer.financier_pk, reason, at: Date.now() }] });
      current = d.n;
      refresh();
      return `Declined: ${reason} You can offer ${d.invoice_id} to another financier.`;
    },
  };
}

/** T4: check the buyer's signature before offering the invoice to anyone. */
function signatureCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.buyer_signature) {
    return card("Step 1", "Buyer signature", "Checked against the invoice.", banner("ok", "Signed by the buyer", "The buyer's per-invoice key signed exactly this invoice."));
  }
  const contact = field("Buyer's contact card", { area: true, placeholder: "jitsuin-contact-v1:…", help: "From the buyer. Compare its key fingerprint with the buyer before you send." });
  const pdf = fileField("Invoice document (PDF)", "The same file you created the invoice with; its hash must match. Sent sealed, only the buyer can open it.");
  const sendOut = new Out();
  if (d.sign_request) sendOut.show(banner("ok", "Sent to the buyer", `On ${new Date(d.sign_request.at).toLocaleString()}. The signature arrives in your inbox above.`));
  const sendBtn = button("Send to the buyer", async () => {
    try {
      const buyer = await useContact(contact.value(), "buyer");
      const file = pdf.input.files?.[0];
      if (!file) throw new Error("choose the invoice document");
      const terms = json<{ terms_hash: string }>(wasm.invoiceDecode(d.invoice)).terms_hash;
      if ((await fileHash(file)) !== terms) throw new Error("this PDF is not the invoice document: its hash differs from the invoice");
      const files = [{ name: file.name.endsWith(".pdf") ? file.name : `${d.invoice_id}.pdf`, mime: "application/pdf" as const, bytes: new Uint8Array(await file.arrayBuffer()) }];
      const me = myIdentity();
      const header = signInWasm(
        draft("invoice.sign_request", { role: "supplier", mailbox_pk: me.mailbox_pk }, buyer.mailbox_pk, relayDeps, { n: d.n, body: { invoice: d.invoice }, attachments: await describeFiles(files) }),
        d.supplier_pk,
        await secretFor(d),
        relayDeps,
      );
      await send(buyer.mailbox_pk, await encodeMessage(header, files), relayDeps);
      await save({ ...d, sign_request: { to: buyer.mailbox_pk, at: Date.now() } });
      refresh();
    } catch (e) {
      sendOut.error(e);
    }
  });
  const sig = field("Buyer signature", { placeholder: "128 hex characters from the buyer's screen" });
  const out = new Out();
  return card(
    "Step 1",
    "Get the buyer's signature",
    "Send the invoice and its document to the buyer's mailbox; the signature comes back to yours. A financier only looks at an invoice the buyer signed.",
    contact.el,
    pdf.el,
    actions(sendBtn),
    sendOut.el,
    h("p", { class: "hint" }, "Or paste a signature the buyer gave you another way; it is checked in your browser."),
    sig.el,
    actions(
      button("Check signature", async () => {
        try {
          const s = sig.value().toLowerCase();
          if (!/^[0-9a-f]{128}$/.test(s)) throw new Error("expected 128 hex characters");
          wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
          await save({ ...d, buyer_signature: s });
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

/** The signed financier directory, checked against the provider key and ranked for `d`. */
async function findFinanciers(d: SupplierDeal): Promise<Fit[]> {
  const r = await fetch("/directory.json", { credentials: "same-origin", cache: "no-cache" });
  if (!r.ok) throw new Error(`the directory answered ${r.status}`);
  const dir = (await r.json()) as Directory;
  if (!(await verifyDirectory(dir, PROVIDER.signer_pk))) throw new Error("its signature is not the node provider's");
  const today = Math.floor(Date.now() / 86_400_000);
  return rank(dir.financiers, d.amount_zat, Math.max(0, d.due_date - today));
}

/** T5: offer the invoice to one financier, with a fresh shielded address for this deal. */
function offerCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.offer) {
    const facts = kv([
      ["Financier key", d.offer.financier_pk, true],
      ["Advance asked", `${zatToZec(d.offer.advance_zat)} ZEC`],
      ["Your address for the advance", d.offer.supplier_address, true],
    ]);
    if (d.offer.sent) {
      return card(
        "Step 2",
        "Offer sent",
        "Offer this invoice to one financier only. A second offer gets caught on the board.",
        banner("ok", "In the financier's mailbox", `Sealed and signed on ${new Date(d.offer.sent.at).toLocaleString()}. The financier's node checks your signature and the buyer's before it answers.`),
        facts,
      );
    }
    const code = encodeOffer({ invoice: d.invoice, buyer_signature: d.buyer_signature!, ...d.offer });
    return card(
      "Step 2",
      "Offer sent",
      "Offer this invoice to one financier only. A second offer gets caught on the board.",
      facts,
      codeBlock("Offer code: send it to the financier", code, `${d.invoice_id}.offer.txt`),
    );
  }
  const contact = field("Financier's contact card", { area: true, placeholder: "jitsuin-contact-v1:…", help: "From the financier's console, under For suppliers." });
  const fin = field("Financier key", { placeholder: "64 hex characters from the same place", help: "Checked against the card's fingerprint before anything is sent." });
  const adv = field("Advance you ask (ZEC)", { type: "number", placeholder: "0.00038" });
  const addr = field("Your shielded address for this deal", { placeholder: NET.addressHint, help: "Use a new address for every deal, so deals cannot be linked by address." });
  const out = new Out();
  // HNK-30.T20 (D-47): the financiers that chose to be listed, matched to this invoice here, in
  // the browser. Picking one fills its contact card and key; nothing about the invoice is sent.
  const finder = h("div", { class: "fd" }, h("p", { class: "hint" }, "Reading the financier directory…"));
  void findFinanciers(d).then(
    (fits) => {
      if (!fits.length) {
        finder.replaceChildren(h("p", { class: "hint" }, "No financier is listed in the directory yet. Paste the contact card and key a financier gave you."));
        return;
      }
      finder.replaceChildren(
        h("p", { class: "fd-k" }, h("b", { lang: "ja" }, "名簿"), `Financier directory, matched to this invoice in your browser (${fits.filter((f) => f.fits).length} of ${fits.length} fit)`),
        h(
          "ol",
          { class: "fd-list" },
          ...fits.map((f) => {
            const m = f.listing.mandate;
            const use = h("button", { type: "button", class: f.fits ? undefined : "secondary" }, "Offer to this financier") as HTMLButtonElement;
            use.addEventListener("click", () => {
              contact.input.value = f.listing.contact;
              fin.input.value = f.listing.financier_pk;
              adv.input.focus();
            });
            return h(
              "li",
              { class: f.fits ? "fd-row is-fit" : "fd-row" },
              h("span", { class: "fd-mark", lang: "ja", "aria-hidden": "true" }, f.fits ? "適" : "否"),
              h("strong", {}, f.listing.name),
              h("span", { class: "fd-m" }, `${zatToZec(m.min_zat)} – ${zatToZec(m.max_zat)} ZEC · up to ${m.max_tenor_days} days${m.buyer_kyc ? " · buyers it knows from KYC" : ""}`),
              h("span", { class: "fd-why" }, f.fits ? "Fits this invoice." : f.misses.join("; ")),
              h("span", { class: f.listing.reputation ? "fd-rep is-attested" : "fd-rep" }, h("b", { lang: "ja", "aria-hidden": "true" }, "績"), recordLine(f.listing)),
              use,
            );
          }),
        ),
      );
    },
    (e) => finder.replaceChildren(h("p", { class: "hint" }, `The directory could not be read (${e instanceof Error ? e.message : String(e)}). Paste a contact card and key instead.`)),
  );
  return card(
    "Step 2",
    "Offer it to one financier",
    "Your offer goes sealed to the financier's mailbox, signed with this invoice's key. The financier checks the board for this invoice, then asks you for the board entry.",
    // HNK-26.T6: the last financier that declined; the invoice was never on the board, so it is free
    d.declined?.length ? banner("warn", "Declined", `${d.declined[d.declined.length - 1].reason} Offer it to another financier.`) : null,
    finder,
    contact.el,
    fin.el,
    h("div", { class: "row" }, adv.el, addr.el),
    actions(
      button("Send offer", async () => {
        try {
          const advanceZat = zecToZat(adv.value());
          if (advanceZat > d.amount_zat) throw new Error("the advance cannot be more than the invoice amount");
          if (!looksShielded(addr.value())) throw new Error(`use a shielded ${NET.noun} address (${NET.addressHint})`);
          const financierPk = hex64(fin.value(), "financier key");
          const c = await useContact(contact.value(), "financier");
          if ((await financierFingerprint(financierPk)) !== c.fingerprint) throw new Error("this key does not belong to that contact card: ask the financier again");
          const offer = { financier_pk: financierPk, advance_zat: advanceZat, supplier_address: addr.value().trim() };
          const me = myIdentity();
          const header = signInWasm(
            draft("deal.offer", { role: "supplier", mailbox_pk: me.mailbox_pk }, c.mailbox_pk, relayDeps, {
              n: d.n,
              // the buyer's mailbox (from the sign request) lets the node send the letter there too
              body: { invoice: d.invoice, buyer_signature: d.buyer_signature!, advance_zat: offer.advance_zat, supplier_address: offer.supplier_address, ...(d.sign_request ? { buyer_mailbox_pk: d.sign_request.to } : {}) },
            }),
            d.supplier_pk,
            await secretFor(d),
            relayDeps,
          );
          await send(c.mailbox_pk, await encodeMessage(header, []), relayDeps);
          await save({ ...d, offer: { ...offer, sent: { to: c.mailbox_pk, at: Date.now() } } });
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

/** T6: wait for the financier's entry request (SEQ-03 part 4), then sign the board entry for it. */
function entryCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.entry) {
    return card(
      "Step 3",
      "Board entry signed",
      "The financier posts it to the board. The first valid entry for N wins.",
      kv([
        ["Commitment", d.entry.commitment, true],
        ["Public index classes", d.entry.discount === 0 && d.entry.tenor === 0 ? "not disclosed" : `${d.entry.discount} / ${d.entry.tenor}`],
        ["Buyer history tag", d.entry.tagged ? "yes" : "no"],
      ]),
      codeBlock("Entry: send it to the financier", d.entry.memo, `${d.invoice_id}.entry.txt`),
    );
  }
  const out = new Out();
  const req = d.entry_request;
  if (!req) {
    const code = field("Entry request code (from the financier)", { area: true });
    return card(
      "Step 3",
      "Wait for the entry request",
      "The financier asks for the board entry only after it has checked the board for this invoice (and the buyer's history, if it needs it). Nothing to sign before that.",
      code.el,
      actions(
        button("Read request", async () => {
          try {
            const r = decodeEntryRequest(code.value());
            const problems = entryRequestProblems(d, r);
            if (problems.length) {
              out.show(banner("bad", "Not for this deal", problems.join("; ") + "."));
              return;
            }
            await save({ ...d, entry_request: r });
            refresh();
          } catch (e) {
            out.error(e);
          }
        }),
      ),
      out.el,
    );
  }
  const classes = req.discount === undefined ? "none" : `${req.discount} / ${req.tenor}`;
  // Classes stay out of the public rate index unless the supplier opts in (D-42, W-14): anyone
  // holding this invoice can find the entry by N and read them.
  const share = h("input", { type: "checkbox" }) as HTMLInputElement;
  const optIn =
    req.discount === undefined
      ? null
      : h(
          "label",
          { class: "field" },
          share,
          " add this deal's classes to the public rate index",
          h("small", {}, "Off by default. Anyone who holds this invoice, such as the buyer or a financier you showed it to, can then read your discount class on the board."),
        );
  return card(
    "Step 3",
    "Sign the board entry",
    "The financier checked the board and asks for your entry. The entry commits to that financier without naming it.",
    kv([
      ["Financier", req.financier_pk, true],
      ["Commitment salt", req.salt, true],
      ["Classes from the financier (discount / tenor)", classes],
      ["Buyer history tag", req.history_tag ?? "none", req.history_tag !== undefined],
    ]),
    ...(optIn ? [optIn] : []),
    actions(
      button("Sign entry", async () => {
        try {
          const [disc, ten] = share.checked ? [req.discount, req.tenor] : [undefined, undefined];
          const r = json<{ memo: string; commitment: string }>(
            req.history_tag
              ? wasm.supplierRegisterTaggedEntryBytes(await secretFor(d), d.invoice, req.financier_pk, req.salt, req.history_tag, disc, ten)
              : wasm.supplierRegisterEntryBytes(await secretFor(d), d.invoice, req.financier_pk, req.salt, disc, ten),
          );
          const entry = { memo: r.memo, commitment: r.commitment, tagged: req.history_tag !== undefined, discount: disc ?? 0, tenor: ten ?? 0 };
          await save({ ...d, entry });
          // HNK-26.T16: straight to the financier's node, which posts it to the board
          if (d.offer?.sent) {
            const hd = draft("deal.entry", { role: "supplier", mailbox_pk: myIdentity().mailbox_pk }, d.offer.sent.to, relayDeps, { n: d.n, body: { memo: r.memo } });
            await send(d.offer.sent.to, await encodeMessage(hd as import("../lib/relay-message").Header), relayDeps);
            await save({ ...d, entry: { ...entry, sent: Date.now() } });
          }
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

interface LetterFields {
  nullifier: string;
  amount_zat: number;
  due_date: number;
  financier_pk: string;
  financier_address: string;
  terms_hash: string;
  matches_invoice: boolean | null;
}

/** T7: read the assignment letter, check its PDF, then seal it. */
function sealCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.seal) {
    return card(
      "Step 4",
      "Letter sealed",
      "Send your seal to the buyer and the financier. The buyer seals next; the financier's seal arrives with the advance.",
      codeBlock("Your seal (s0)", d.seal.s0, `${d.invoice_id}.supplier.seal.txt`),
    );
  }
  const letter = field("Assignment letter code (from the financier)", { area: true, value: d.letter_in?.letter });
  const pdf = fileField("Assignment letter document (PDF)", d.letter_in ? "Already here: it came sealed with the letter. Hashed in your browser and compared with the letter." : "Hashed in your browser and compared with the letter. Never uploaded.");
  const out = new Out();
  return card(
    "Step 4",
    "Read and seal the assignment letter",
    "The letter assigns this invoice to the financier and names where the buyer pays. Read it before you seal: your seal says you agree.",
    letter.el,
    pdf.el,
    actions(
      button("Check letter", async () => {
        try {
          const code = letter.value();
          const f = json<LetterFields>(wasm.assignmentDecode(code, d.invoice));
          const arrived = d.letter_in && d.letter_in.letter === code ? new File([b64ToBytes(d.letter_in.pdf)], "letter.pdf", { type: "application/pdf" }) : undefined;
          const file = pdf.input.files?.[0] ?? arrived;
          const pdfOk = file ? (await fileHash(file)) === f.terms_hash : false;
          const finOk = f.financier_pk === d.offer!.financier_pk;
          const ok = f.matches_invoice === true && pdfOk && finOk;
          const problems = [
            f.matches_invoice === true ? null : "the letter is for another invoice (N, amount or due date differ)",
            finOk ? null : "the letter names another financier than the one you offered to",
            file ? (pdfOk ? null : "the PDF is not the letter's document") : "choose the letter's PDF",
          ].filter((p): p is string => p !== null);
          const fields = kv([
            ["Financier", f.financier_pk, true],
            ["Buyer pays to", f.financier_address, true],
            ["Amount the buyer pays", `${zatToZec(f.amount_zat)} ZEC`],
            ["Due", daysToDate(f.due_date)],
            ["Letter document hash", f.terms_hash, true],
          ]);
          if (!ok) {
            out.show(fields, banner("bad", "Do not seal", problems.join("; ") + "."));
            return;
          }
          out.show(
            fields,
            banner("ok", "Letter checks out", "Same invoice, same financier, and the PDF is the letter's document."),
            actions(
              button("Seal as supplier", async () => {
                try {
                  const s0 = wasm.supplierSealAssignmentBytes(await secretFor(d), d.invoice, code);
                  await save({ ...d, seal: { letter: code, s0 } });
                  // HNK-26.T16: the seal goes to the buyer (who seals next) and the financier
                  const to = [d.offer?.sent?.to, d.sign_request?.to].filter((x): x is string => !!x);
                  for (const t of to) {
                    const hd = draft("deal.seal", { role: "supplier", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n: d.n, body: { seal: s0, index: 0 } });
                    await send(t, await encodeMessage(hd as import("../lib/relay-message").Header), relayDeps);
                  }
                  if (to.length) await save({ ...d, seal: { letter: code, s0, sent: Date.now() } });
                  refresh();
                } catch (e) {
                  out.error(e);
                }
              }),
            ),
          );
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

/** T8: compare the advance received with the advance agreed in the offer. */
function advanceCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  const agreed = d.offer!.advance_zat;
  if (d.advance?.matches) {
    return card(
      "Step 5",
      "Advance received",
      "Matches the advance you asked for.",
      kv([
        ["Transaction", d.advance.txid, true],
        ["Received", `${zatToZec(d.advance.received_zat)} ZEC`],
      ]),
    );
  }
  const txid = field("Advance transaction id", { placeholder: "64 hex characters, from the financier or your wallet", value: d.advance_notice?.txid });
  const got = field("Amount your wallet received (ZEC)", { type: "number", placeholder: zatToZec(agreed) });
  const out = new Out();
  return card(
    "Step 5",
    "Check the advance",
    `You asked for ${zatToZec(agreed)} ZEC. Compare with what your wallet received in that transaction. The full check (receipt and the financier's seal in the same memo) runs with jitsuin on your own wallet.`,
    txid.el,
    got.el,
    d.advance && !d.advance.matches ? banner("bad", "Advance differs", `Received ${zatToZec(d.advance.received_zat)} ZEC instead of ${zatToZec(agreed)} ZEC.`) : null,
    actions(
      button("Record advance", async () => {
        try {
          const receivedZat = zecToZat(got.value());
          await save({ ...d, advance: { txid: hex64(txid.value(), "transaction id"), received_zat: receivedZat, matches: receivedZat === agreed } });
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}
