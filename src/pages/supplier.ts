// Supplier screen (HNK-10.T2; HNK-24.T2, T4 – T9): unlock with the supplier passkey, keep every
// deal in the encrypted device store, and walk each deal from invoice to advance.
//
// Keys: the per-invoice key comes from the supplier master (P-03, HNK-24.T1), so there is no secret
// to back up. The master stays in this tab's memory while unlocked; every jitsuin-wasm `*Bytes`
// call gets a copy and zeroes it. Documents travel by copy-paste until the relay exists (HNK-23);
// the financier is chosen by pasting its key until contacts exist (HNK-22).
import { dateToDays, daysToDate, fileHash, json, openDealStore, wasm, zatToZec, zecToZat } from "../lib/core";
import { createPasskey, masterBytesFromPasskey, passkeysAvailable } from "../lib/passkey";
import type { DealStore } from "../lib/store";
import {
  actionOf,
  encodeOffer,
  invoiceIdTaken,
  looksShielded,
  nextStep,
  sortDeals,
  timeline,
  type SupplierDeal,
} from "../lib/supplier-deal";
import { actions, banner, button, card, codeBlock, field, fileField, h, kv, Out, page } from "../lib/ui";

// In memory only, for this tab: survives moving between screens, gone when the tab closes.
let master: Uint8Array | null = null;
let store: DealStore | null = null;
let current: string | null = null;

const HEX64 = /^[0-9a-f]{64}$/i;
const LEAD = "Issue an invoice, have the buyer sign it, offer it to one financier, sign its board entry, seal the letter and receive the advance.";

function bytesFromHex(s: string): Uint8Array {
  if (!HEX64.test(s)) throw new Error("expected 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

function hex64(value: string, what: string): string {
  const v = value.trim().toLowerCase();
  if (!HEX64.test(v)) throw new Error(`${what}: expected 64 hex characters`);
  return v;
}

/** Fresh per-invoice secret for `d`; the supplier `*Bytes` function that receives it zeroes it. */
function secretFor(d: SupplierDeal): Uint8Array {
  if (!master) throw new Error("unlock with your passkey first");
  return wasm.supplierInvoiceSecretBytes(master.slice(), d.invoice_id, d.buyer_pk);
}

async function save(d: SupplierDeal): Promise<void> {
  if (!store) throw new Error("unlock with your passkey first");
  await store.put(d.n, d);
}

async function unlock(bytes: Uint8Array): Promise<void> {
  master = bytes.slice();
  store = await openDealStore("supplier", bytes);
}

function lock(): void {
  master?.fill(0);
  master = null;
  store = null;
  current = null;
}

export function supplierPage(): HTMLElement {
  const root = h("div");
  const refresh = (): void => {
    void render(root, refresh);
  };
  refresh();
  return root;
}

async function render(root: HTMLElement, refresh: () => void): Promise<void> {
  if (!master || !store) {
    root.replaceChildren(page("Supplier", LEAD, unlockCard(refresh)));
    return;
  }
  const deals = sortDeals((await store.list<SupplierDeal>()).map((r) => r.doc));
  const open = deals.find((d) => d.n === current) ?? null;
  const cards = [sessionCard(deals.length, refresh), dealsCard(deals, refresh), newInvoiceCard(deals, refresh)];
  if (open) cards.push(...dealCards(open, refresh));
  root.replaceChildren(page("Supplier", LEAD, ...cards));
}

// ---------- unlock (HNK-24.T2) ----------

function unlockCard(refresh: () => void): HTMLElement {
  const out = new Out();
  const test = field("Or use a test secret", {
    placeholder: "64 hex characters",
    help: "Demo only, for TES- data on a device without passkeys. Anyone with it can act as this supplier.",
  });
  const viaPasskey = passkeysAvailable()
    ? actions(
        button("Unlock with passkey", async () => {
          try {
            await unlock(await masterBytesFromPasskey("supplier"));
            refresh();
          } catch (e) {
            out.error(e);
          }
        }),
        button("Create a passkey", async () => {
          try {
            await createPasskey();
            out.show(banner("ok", "Passkey created", "Now unlock with it. The same passkey also unlocks the buyer screen with separate keys."));
          } catch (e) {
            out.error(e);
          }
        }, true),
      )
    : banner("warn", "No passkeys here", "This browser or connection does not support passkeys. Use a test secret for TES- data.");
  return card(
    "Sign in",
    "Unlock your supplier keys",
    "Your keys come from a passkey: every invoice gets its own key derived from it, so there is nothing to back up and nobody can link your invoices.",
    viaPasskey,
    test.el,
    actions(
      button("Use test secret", async () => {
        try {
          await unlock(bytesFromHex(test.value()));
          refresh();
        } catch (e) {
          out.error(e);
        }
      }, true),
    ),
    out.el,
  );
}

function sessionCard(count: number, refresh: () => void): HTMLElement {
  return card(
    "Session",
    "Unlocked",
    "Your deals are encrypted on this device with a key from your passkey.",
    kv([["Deals on this device", String(count)]]),
    store && !store.persistent
      ? banner("warn", "Not saved", "This browser blocks local storage here (private window?). Deals stay only until the tab closes.")
      : null,
    actions(
      button("Lock", () => {
        lock();
        refresh();
      }, true),
    ),
  );
}

// ---------- deals and timeline (HNK-24.T9) ----------

function dealsCard(deals: SupplierDeal[], refresh: () => void): HTMLElement {
  const rows = deals.map((d) => {
    const next = nextStep(d);
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
      h("small", {}, next ? `Next: ${actionOf(next)}` : "Complete"),
    );
  });
  return card(
    "Deals",
    "Your deals",
    "One line per invoice, newest first. Open a deal to do its next step.",
    rows.length ? h("div", { class: "deals" }, ...rows) : h("p", { class: "hint" }, "No deal yet. Create an invoice below."),
  );
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
          if (!master) throw new Error("unlock with your passkey first");
          const supplierPk = wasm.supplierInvoicePublicKeyBytes(master.slice(), invoiceId, buyerPk);
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
      "Send the invoice code and the invoice document to the buyer to sign.",
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

/** T4: check the buyer's signature before offering the invoice to anyone. */
function signatureCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.buyer_signature) {
    return card("Step 1", "Buyer signature", "Checked against the invoice.", banner("ok", "Signed by the buyer", "The buyer's per-invoice key signed exactly this invoice."));
  }
  const sig = field("Buyer signature", { placeholder: "128 hex characters from the buyer's screen" });
  const out = new Out();
  return card(
    "Step 1",
    "Check the buyer's signature",
    "A financier only looks at an invoice the buyer signed. The check runs in your browser.",
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

/** T5: offer the invoice to one financier, with a fresh shielded address for this deal. */
function offerCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.offer) {
    const code = encodeOffer({ invoice: d.invoice, buyer_signature: d.buyer_signature!, ...d.offer });
    return card(
      "Step 2",
      "Offer sent",
      "Offer this invoice to one financier only. A second offer gets caught on the board.",
      kv([
        ["Financier key", d.offer.financier_pk, true],
        ["Advance asked", `${zatToZec(d.offer.advance_zat)} ZEC`],
        ["Your address for the advance", d.offer.supplier_address, true],
      ]),
      codeBlock("Offer code: send it to the financier", code, `${d.invoice_id}.offer.txt`),
    );
  }
  const fin = field("Financier key", { placeholder: "64 hex characters from the financier" });
  const adv = field("Advance you ask (ZEC)", { type: "number", placeholder: "0.00038" });
  const addr = field("Your shielded address for this deal", { placeholder: "utest1… / u1…", help: "Use a new address for every deal, so deals cannot be linked by address." });
  const out = new Out();
  return card(
    "Step 2",
    "Offer it to one financier",
    "The financier checks the board for this invoice, then sends you its commitment opening and the assignment letter.",
    fin.el,
    h("div", { class: "row" }, adv.el, addr.el),
    actions(
      button("Make offer", async () => {
        try {
          const advanceZat = zecToZat(adv.value());
          if (advanceZat > d.amount_zat) throw new Error("the advance cannot be more than the invoice amount");
          if (!looksShielded(addr.value())) throw new Error("use a shielded address (u1… / utest1…)");
          await save({ ...d, offer: { financier_pk: hex64(fin.value(), "financier key"), advance_zat: advanceZat, supplier_address: addr.value() } });
          refresh();
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

function optionalClass(value: string, what: string): number | undefined {
  if (value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 7) throw new Error(`${what}: a class from 0 to 7`);
  return n;
}

/** T6: sign the board entry for the financier's commitment, with the classes it sent. */
function entryCard(d: SupplierDeal, refresh: () => void): HTMLElement {
  if (d.entry) {
    return card(
      "Step 3",
      "Board entry signed",
      "The financier posts it to the board. The first valid entry for N wins.",
      kv([
        ["Commitment", d.entry.commitment, true],
        ["Classes (discount / tenor)", `${d.entry.discount} / ${d.entry.tenor}`],
        ["Buyer history tag", d.entry.tagged ? "yes" : "no"],
      ]),
      codeBlock("Entry: send it to the financier", d.entry.memo, `${d.invoice_id}.entry.txt`),
    );
  }
  const salt = field("Commitment salt from the financier", { placeholder: "64 hex characters" });
  const disc = field("Discount class", { type: "number", placeholder: "from the financier" });
  const tenor = field("Tenor class", { type: "number", placeholder: "from the financier" });
  const tag = field("Buyer history tag (if the buyer shares its history)", { placeholder: "64 hex characters, optional" });
  const out = new Out();
  return card(
    "Step 3",
    "Sign the board entry",
    "Sign only after the financier asks for it: it has checked the board and the buyer's history. The entry commits to that financier without naming it.",
    salt.el,
    h("div", { class: "row" }, disc.el, tenor.el),
    tag.el,
    actions(
      button("Sign entry", async () => {
        try {
          const s = hex64(salt.value(), "salt");
          const dc = optionalClass(disc.value(), "discount class");
          const tc = optionalClass(tenor.value(), "tenor class");
          if ((dc === undefined) !== (tc === undefined)) throw new Error("give both classes, or neither");
          const t = tag.value() ? hex64(tag.value(), "history tag") : "";
          const fin = d.offer!.financier_pk;
          const r = json<{ memo: string; commitment: string }>(
            t
              ? wasm.supplierRegisterTaggedEntryBytes(secretFor(d), d.invoice, fin, s, t, dc, tc)
              : wasm.supplierRegisterEntryBytes(secretFor(d), d.invoice, fin, s, dc, tc),
          );
          await save({ ...d, entry: { memo: r.memo, commitment: r.commitment, tagged: t !== "", discount: dc ?? 0, tenor: tc ?? 0 } });
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
  const letter = field("Assignment letter code (from the financier)", { area: true });
  const pdf = fileField("Assignment letter document (PDF)", "Hashed in your browser and compared with the letter. Never uploaded.");
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
          const file = pdf.input.files?.[0];
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
                  const s0 = wasm.supplierSealAssignmentBytes(secretFor(d), d.invoice, code);
                  await save({ ...d, seal: { letter: code, s0 } });
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
  const txid = field("Advance transaction id", { placeholder: "64 hex characters, from the financier or your wallet" });
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
