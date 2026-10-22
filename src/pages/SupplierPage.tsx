// Supplier screen (HNK-10.T2; HNK-24.T2, T4 – T9; HNK-22.T4): opens in a supplier session, keeps
// every deal in the encrypted device store, and walks each deal from invoice to advance.
//
// Keys: the per-invoice key comes from the supplier master (P-03, HNK-24.T1), so there is no secret
// to back up. No master stays in this tab: every action that needs a key is a stamp (one passkey
// touch, `account.stamp()`), and the jitsuin-wasm `*Bytes` call zeroes it. The invoice and its
// PDF go to the buyer through the relay, sealed to the buyer's mailbox, and the buyer's signature
// comes back the same way (HNK-23.T7); the financier's node answers through the relay too (HNK-26).
// React since HNK-31.T8. Every change redraws the page from the store (`refresh`), as before: the
// cards remount, so their fields and messages start clean.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Actions, Banner, Button, Card, CodeBlock, DeskPage, Field, FileField, Kv, MiniInvoice, Route, useOut } from "../app/ui";
import { financierFingerprint } from "../lib/account";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { loadBoard } from "../lib/board";
import { boardStatus } from "../lib/buyer-invoices";
import { dateToDays, daysToDate, fileHash, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { rank, recordLine, verifyDirectory, type Directory, type Fit } from "../lib/directory";
import { NET } from "../lib/network";
import { PROVIDER } from "../lib/provider";
import { draft, send, signInWasm, type Received } from "../lib/relay";
import { describeFiles, encodeMessage, type Header } from "../lib/relay-message";
import { decodeEntryRequest, encodeOffer, entryRequestProblems, invoiceIdTaken, looksShielded, nextAction, nextStep, sortDeals, STEPS, timeline, type SupplierDeal } from "../lib/supplier-deal";
import { MailboxCard, takeContact, type InboxAction } from "./MailboxCard";
import { Seikyusho, type SheetFields } from "./try/Seikyusho";

// The open deal, for this tab: survives moving between screens, gone when the tab closes.
let current: string | null = null;
// HNK-25.T2 (BL-D22-01): the buyer key that arrived through the mailbox, for the next invoice.
let arrivedBuyerKey: string | null = null;

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

const bytesToB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const value = (r: { current: { value: string } | null }) => r.current!.value.trim();

type Refresh = () => void;

export function SupplierPage(): ReactNode {
  const [ask, setAsk] = useState(0);
  const [view, setView] = useState<{ gen: number; deals: SupplierDeal[] } | null>(null);
  const refresh = () => setAsk((g) => g + 1);
  useEffect(() => {
    const store = account.current?.store;
    if (!store) return;
    let live = true;
    // the store also keeps contacts ("contact:" ids); deals are stored under their N
    void store.list<SupplierDeal>().then((all) => {
      if (live) setView({ gen: ask, deals: sortDeals(all.filter((r) => HEX64.test(r.id)).map((r) => r.doc)) });
    });
    return () => void (live = false);
  }, [ask]);
  if (!view) return null;
  return <SupplierDesk key={view.gen} deals={view.deals} refresh={refresh} />;
}

function SupplierDesk({ deals, refresh }: { deals: SupplierDeal[]; refresh: Refresh }): ReactNode {
  const store = account.current?.store;
  const open = deals.find((d) => d.n === current) ?? null;
  // The stage (HNK-30.T17): the open deal's 請求書 and its route along the counter rail.
  const GLYPH = { signature: "買", offer: "送", entry: "登", seal: "印", advance: "金" } as const;
  const stations = open ? timeline(open).map((s) => ({ glyph: GLYPH[s.key], label: s.label, state: s.state })) : STEPS.map((s) => ({ glyph: GLYPH[s.key], label: s.label, state: "later" as const }));
  const next = open ? nextAction(open) : null;
  const stage = (
    <section className="ds" aria-label="The open deal">
      <MiniInvoice o={open ? { id: open.invoice_id, amount: `${zatToZec(open.amount_zat)} ZEC`, due: daysToDate(open.due_date), n: open.n, sealed: !!open.buyer_signature, stamp: open.advance?.matches ? "済" : undefined } : null} />
      <Route stations={stations} caption={open ? (next ? `Next: ${next}.` : "Complete: the advance arrived as agreed.") : deals.length ? "Open a deal below to see where it stands." : "Issue your first invoice below."} />
    </section>
  );
  const handlers: Record<string, InboxAction> = {
    "invoice.signature": signatureFromInbox(refresh),
    "deal.decline": declineFromInbox(refresh),
    "key.invoice_pk": {
      label: "Use for my next invoice",
      run: async (r: Received): Promise<string> => {
        const k = String(r.message.header.body.invoice_pk);
        if (r.message.header.signer !== k) throw new Error("this key did not sign its own message");
        arrivedBuyerKey = k;
        refresh();
        return `The buyer's key ${k.slice(0, 10)}… is on your next invoice (Write an invoice).`;
      },
    },
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
  };
  return (
    <DeskPage wrapped glyph="売" eyebrow="Supplier's counter" title="Supplier" lede={LEAD} stage={stage}>
      {store && !store.persistent ? <Banner kind="warn" title="Not saved" text="This browser blocks local storage here (private window?). Deals stay only until the tab closes." /> : null}
      <MailboxCard handlers={handlers} />
      <DealsCard deals={deals} refresh={refresh} />
      <NewInvoiceCard deals={deals} refresh={refresh} />
      {open ? <DealCards d={open} refresh={refresh} /> : null}
    </DeskPage>
  );
}

// ---------- deals and timeline (HNK-24.T9) ----------

function DealsCard({ deals, refresh }: { deals: SupplierDeal[]; refresh: Refresh }): ReactNode {
  // HNK-25.T7 (BL-D25-09): each offered deal against the live board, filled in when it loads
  const [onBoard, setOnBoard] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!deals.some((d) => d.buyer_signature && d.offer)) return;
    void loadBoard((u, i) => fetch(u, i)).then(
      (b) => setOnBoard(Object.fromEntries(deals.map((d) => [d.n, statusOnBoard(d, b.json) ?? ""]))),
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card step="Deals" title="Your deals" hint="One line per invoice, newest first. Open a deal to do its next step.">
      {deals.length ? (
        <div className="deals">
          {deals.map((d) => {
            const next = nextAction(d);
            return (
              <div key={d.n} className={d.n === current ? "deal open" : "deal"}>
                <div className="deal-head">
                  <strong>{d.invoice_id}</strong>
                  <span>{`${zatToZec(d.amount_zat)} ZEC · due ${daysToDate(d.due_date)}`}</span>
                  <Button
                    secondary
                    onClick={() => {
                      current = d.n;
                      refresh();
                    }}
                  >
                    {d.n === current ? "Opened" : "Open"}
                  </Button>
                </div>
                <ol className="steps">
                  {timeline(d).map((s) => (
                    <li key={s.key} className={`chip ${s.state}`}>
                      {s.label}
                    </li>
                  ))}
                </ol>
                <small>{next ? `Next: ${next}` : "Complete"}</small>
                {d.buyer_signature && d.offer ? (
                  <small id={`board-${d.n}`} className="board-line">
                    {onBoard[d.n] ?? ""}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="hint">No deal yet. Create an invoice below.</p>
      )}
    </Card>
  );
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

function NewInvoiceCard({ deals, refresh }: { deals: SupplierDeal[]; refresh: Refresh }): ReactNode {
  // HNK-21.T2: the invoice is written on the 請求書 itself (the same sheet as /try); only the buyer's
  // key and the PDF sit below it. The buyer's seal box stays empty until the buyer signs.
  const today = useRef(new Date().toISOString().slice(0, 10)).current;
  const fields: SheetFields = { id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) };
  const buyer = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const terms = useRef<HTMLInputElement>(null);
  const [to, setTo] = useState(arrivedBuyerKey ? `${arrivedBuyerKey.slice(0, 10)}…${arrivedBuyerKey.slice(-6)}` : "the buyer's key, below");
  const out = useOut();
  useEffect(() => {
    const b = buyer.current!;
    const f = terms.current!;
    const onBuyer = () => {
      const v = b.value.trim();
      setTo(HEX64.test(v) ? `${v.slice(0, 10)}…${v.slice(-6)}` : "the buyer's key, below");
    };
    const onFile = async () => {
      const file = f.files?.[0];
      fields.terms.current!.value = file ? await fileHash(file) : "";
    };
    b.addEventListener("input", onBuyer);
    f.addEventListener("change", onFile);
    return () => {
      b.removeEventListener("input", onBuyer);
      f.removeEventListener("change", onFile);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card step="New" title="Write an invoice" hint="Its key is derived from your passkey, the invoice number and the buyer's key. The canonical invoice is what the buyer signs; its fingerprint N is what financiers look up on the board.">
      <div className="sk-desk">
        <Seikyusho
          o={{ id: "", amount: "", issued: today, due: "", terms: "", buyer: "", supplier: "", issuer: "You" }}
          fields={fields}
          changed={null}
          n={null}
          blank={{
            seal: "pending",
            to,
            by: "your key for this invoice, from your passkey",
            note: "The buyer's seal 買 goes in the box once the buyer signs these exact bytes.",
            n: "made when you create it: it needs your key for this invoice",
            placeholders: { id: "TES-INV-0007", amount: "0.0004", terms: "the PDF's SHA-256 appears here" },
            termsReadOnly: true,
          }}
        />
      </div>
      <Field label="Buyer key for this invoice" placeholder="64 hex characters from the buyer's screen" value={arrivedBuyerKey ?? undefined} inputRef={buyer} />
      <FileField label="Invoice document (PDF)" help="Hashed in your browser with SHA-256. The file is never uploaded." inputRef={terms} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const invoiceId = value(fields.id);
              if (invoiceId.length < 1 || invoiceId.length > 32) throw new Error("invoice number: 1–32 characters");
              if (invoiceIdTaken(deals, invoiceId)) throw new Error(`invoice number ${invoiceId} is already used on this device`);
              const buyerPk = hex64(value(buyer), "buyer key");
              const file = terms.current!.files?.[0];
              if (!file) throw new Error("choose the invoice document");
              if (!fields.due.current!.value) throw new Error("give the due date");
              const supplierPk = wasm.supplierInvoicePublicKeyBytes(await account.stamp(), invoiceId, buyerPk);
              const amountZat = zecToZat(value(fields.amount));
              const dueDay = dateToDays(fields.due.current!.value);
              const code = wasm.invoiceEncode(
                JSON.stringify({
                  invoice_id: invoiceId,
                  supplier_pk: supplierPk,
                  buyer_pk: buyerPk,
                  amount_zat: amountZat,
                  issue_date: dateToDays(fields.issued.current!.value),
                  due_date: dueDay,
                  terms_hash: await fileHash(file),
                }),
              );
              const n = json<{ nullifier: string }>(wasm.invoiceDecode(code)).nullifier;
              await save({ n, invoice_id: invoiceId, buyer_pk: buyerPk, supplier_pk: supplierPk, amount_zat: amountZat, due_date: dueDay, invoice: code, created_at: Date.now() });
              current = n;
              arrivedBuyerKey = null;
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Create invoice
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}

// ---------- one deal (HNK-24.T4 – T8) ----------

function DealCards({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  return (
    <>
      <Card step="Deal" title={d.invoice_id} hint="The invoice the buyer signs; its fingerprint N is what financiers look up on the board.">
        <Kv
          rows={[
            ["Fingerprint N", d.n, true],
            ["Amount", `${zatToZec(d.amount_zat)} ZEC`],
            ["Due", daysToDate(d.due_date)],
            ["Your key for this invoice", d.supplier_pk, true],
            ["Buyer key", d.buyer_pk, true],
          ]}
        />
        <CodeBlock label="Invoice code" value={d.invoice} filename={`${d.invoice_id}.invoice.txt`} />
      </Card>
      <SignatureCard d={d} refresh={refresh} />
      {d.buyer_signature ? <OfferCard d={d} refresh={refresh} /> : null}
      {d.offer ? (
        <>
          <EntryCard d={d} refresh={refresh} />
          <SealCard d={d} refresh={refresh} />
        </>
      ) : null}
      {d.seal ? <AdvanceCard d={d} refresh={refresh} /> : null}
      {!nextStep(d) ? <Card step="Done" title="Deal complete" hint="The advance arrived as agreed. The buyer pays the financier at maturity." /> : null}
    </>
  );
}

/** HNK-23.T7: a buyer's signature from the inbox, checked against its deal and kept. */
function signatureFromInbox(refresh: Refresh): InboxAction {
  return {
    label: "Check and keep",
    run: async (r) => {
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

/**
 * HNK-26.T16: a message from the financier's node about one of this device's deals, accepted only
 * from the financier the invoice was offered to (its key signed the header).
 */
function fromFinancier(refresh: Refresh, label: string, use: (d: SupplierDeal, h: Header, files: Uint8Array[]) => Promise<string>): InboxAction {
  return {
    label,
    run: async (r) => {
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
function declineFromInbox(refresh: Refresh): InboxAction {
  return {
    label: "Note and free the invoice",
    run: async (r) => {
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
function SignatureCard({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const contact = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const sig = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const sendOut = useOut();
  const out = useOut();
  useEffect(() => {
    if (d.sign_request) sendOut.show(<Banner kind="ok" title="Sent to the buyer" text={`On ${new Date(d.sign_request.at).toLocaleString()}. The signature arrives in your inbox above.`} />);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (d.buyer_signature) {
    return (
      <Card step="Step 1" title="Buyer signature" hint="Checked against the invoice.">
        <Banner kind="ok" title="Signed by the buyer" text="The buyer's per-invoice key signed exactly this invoice." />
      </Card>
    );
  }
  return (
    <Card step="Step 1" title="Get the buyer's signature" hint="Send the invoice and its document to the buyer's mailbox; the signature comes back to yours. A financier only looks at an invoice the buyer signed.">
      <Field label="Buyer's contact card" area placeholder="jitsuin-contact-v1:…" help="From the buyer. Compare its key fingerprint with the buyer before you send." inputRef={contact} />
      <FileField label="Invoice document (PDF)" help="The same file you created the invoice with; its hash must match. Sent sealed, only the buyer can open it." inputRef={pdf} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const buyer = await takeContact(value(contact), "buyer");
              const file = pdf.current!.files?.[0];
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
          }}
        >
          Send to the buyer
        </Button>
      </Actions>
      {sendOut.el}
      <p className="hint">Or paste a signature the buyer gave you another way; it is checked in your browser.</p>
      <Field label="Buyer signature" placeholder="128 hex characters from the buyer's screen" inputRef={sig} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const s = value(sig).toLowerCase();
              if (!/^[0-9a-f]{128}$/.test(s)) throw new Error("expected 128 hex characters");
              wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
              await save({ ...d, buyer_signature: s });
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Check signature
        </Button>
      </Actions>
      {out.el}
    </Card>
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
function OfferCard({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const contact = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const fin = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const adv = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const addr = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  // HNK-30.T20 (D-47): the financiers that chose to be listed, matched to this invoice here, in
  // the browser. Picking one fills its contact card and key; nothing about the invoice is sent.
  const [fits, setFits] = useState<Fit[] | string | null>(null);
  useEffect(() => {
    if (d.offer) return;
    void findFinanciers(d).then(setFits, (e) => setFits(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (d.offer) {
    const facts = (
      <Kv
        rows={[
          ["Financier key", d.offer.financier_pk, true],
          ["Advance asked", `${zatToZec(d.offer.advance_zat)} ZEC`],
          ["Your address for the advance", d.offer.supplier_address, true],
        ]}
      />
    );
    if (d.offer.sent) {
      return (
        <Card step="Step 2" title="Offer sent" hint="Offer this invoice to one financier only. A second offer gets caught on the board.">
          <Banner kind="ok" title="In the financier's mailbox" text={`Sealed and signed on ${new Date(d.offer.sent.at).toLocaleString()}. The financier's node checks your signature and the buyer's before it answers.`} />
          {facts}
        </Card>
      );
    }
    const code = encodeOffer({ invoice: d.invoice, buyer_signature: d.buyer_signature!, ...d.offer });
    return (
      <Card step="Step 2" title="Offer sent" hint="Offer this invoice to one financier only. A second offer gets caught on the board.">
        {facts}
        <CodeBlock label="Offer code: send it to the financier" value={code} filename={`${d.invoice_id}.offer.txt`} />
      </Card>
    );
  }
  const finder = (
    <div className="fd">
      {fits === null ? (
        <p className="hint">Reading the financier directory…</p>
      ) : typeof fits === "string" ? (
        <p className="hint">{`The directory could not be read (${fits}). Paste a contact card and key instead.`}</p>
      ) : !fits.length ? (
        <p className="hint">No financier is listed in the directory yet. Paste the contact card and key a financier gave you.</p>
      ) : (
        <>
          <p className="fd-k">
            <b lang="ja">名簿</b>
            {`Financier directory, matched to this invoice in your browser (${fits.filter((f) => f.fits).length} of ${fits.length} fit)`}
          </p>
          <ol className="fd-list">
            {fits.map((f) => {
              const m = f.listing.mandate;
              return (
                <li key={f.listing.financier_pk} className={f.fits ? "fd-row is-fit" : "fd-row"}>
                  <span className="fd-mark" lang="ja" aria-hidden="true">
                    {f.fits ? "適" : "否"}
                  </span>
                  <strong>{f.listing.name}</strong>
                  <span className="fd-m">{`${zatToZec(m.min_zat)} – ${zatToZec(m.max_zat)} ZEC · up to ${m.max_tenor_days} days${m.buyer_kyc ? " · buyers it knows from KYC" : ""}`}</span>
                  <span className="fd-why">{f.fits ? "Fits this invoice." : f.misses.join("; ")}</span>
                  <span className={f.listing.reputation ? "fd-rep is-attested" : "fd-rep"}>
                    <b lang="ja" aria-hidden="true">
                      績
                    </b>
                    {recordLine(f.listing)}
                  </span>
                  <button
                    type="button"
                    className={f.fits ? undefined : "secondary"}
                    onClick={() => {
                      contact.current!.value = f.listing.contact;
                      fin.current!.value = f.listing.financier_pk;
                      adv.current!.focus();
                    }}
                  >
                    Offer to this financier
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
  return (
    <Card step="Step 2" title="Offer it to one financier" hint="Your offer goes sealed to the financier's mailbox, signed with this invoice's key. The financier checks the board for this invoice, then asks you for the board entry.">
      {/* HNK-26.T6: the last financier that declined; the invoice was never on the board, so it is free */}
      {d.declined?.length ? <Banner kind="warn" title="Declined" text={`${d.declined[d.declined.length - 1].reason} Offer it to another financier.`} /> : null}
      {finder}
      <Field label="Financier's contact card" area placeholder="jitsuin-contact-v1:…" help="From the financier's console, under For suppliers." inputRef={contact} />
      <Field label="Financier key" placeholder="64 hex characters from the same place" help="Checked against the card's fingerprint before anything is sent." inputRef={fin} />
      <div className="row">
        <Field label="Advance you ask (ZEC)" type="number" placeholder="0.00038" inputRef={adv} />
        <Field label="Your shielded address for this deal" placeholder={NET.addressHint} help="Use a new address for every deal, so deals cannot be linked by address." inputRef={addr} />
      </div>
      <Actions>
        <Button
          onClick={async () => {
            try {
              const advanceZat = zecToZat(value(adv));
              if (advanceZat > d.amount_zat) throw new Error("the advance cannot be more than the invoice amount");
              if (!looksShielded(value(addr))) throw new Error(`use a shielded ${NET.noun} address (${NET.addressHint})`);
              const financierPk = hex64(value(fin), "financier key");
              const c = await takeContact(value(contact), "financier");
              if ((await financierFingerprint(financierPk)) !== c.fingerprint) throw new Error("this key does not belong to that contact card: ask the financier again");
              const offer = { financier_pk: financierPk, advance_zat: advanceZat, supplier_address: value(addr) };
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
          }}
        >
          Send offer
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}

/** T6: wait for the financier's entry request (SEQ-03 part 4), then sign the board entry for it. */
function EntryCard({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const out = useOut();
  const code = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const share = useRef<HTMLInputElement>(null);
  if (d.entry) {
    return (
      <Card step="Step 3" title="Board entry signed" hint="The financier posts it to the board. The first valid entry for N wins.">
        <Kv
          rows={[
            ["Commitment", d.entry.commitment, true],
            ["Public index classes", d.entry.discount === 0 && d.entry.tenor === 0 ? "not disclosed" : `${d.entry.discount} / ${d.entry.tenor}`],
            ["Buyer history tag", d.entry.tagged ? "yes" : "no"],
          ]}
        />
        <CodeBlock label="Entry: send it to the financier" value={d.entry.memo} filename={`${d.invoice_id}.entry.txt`} />
      </Card>
    );
  }
  const req = d.entry_request;
  if (!req) {
    return (
      <Card step="Step 3" title="Wait for the entry request" hint="The financier asks for the board entry only after it has checked the board for this invoice (and the buyer's history, if it needs it). Nothing to sign before that.">
        <Field label="Entry request code (from the financier)" area inputRef={code} />
        <Actions>
          <Button
            onClick={async () => {
              try {
                const r = decodeEntryRequest(value(code));
                const problems = entryRequestProblems(d, r);
                if (problems.length) {
                  out.show(<Banner kind="bad" title="Not for this deal" text={problems.join("; ") + "."} />);
                  return;
                }
                await save({ ...d, entry_request: r });
                refresh();
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Read request
          </Button>
        </Actions>
        {out.el}
      </Card>
    );
  }
  const classes = req.discount === undefined ? "none" : `${req.discount} / ${req.tenor}`;
  return (
    <Card step="Step 3" title="Sign the board entry" hint="The financier checked the board and asks for your entry. The entry commits to that financier without naming it.">
      <Kv
        rows={[
          ["Financier", req.financier_pk, true],
          ["Commitment salt", req.salt, true],
          ["Classes from the financier (discount / tenor)", classes],
          ["Buyer history tag", req.history_tag ?? "none", req.history_tag !== undefined],
        ]}
      />
      {/* Classes stay out of the public rate index unless the supplier opts in (D-42, W-14): anyone
          holding this invoice can find the entry by N and read them. */}
      {req.discount === undefined ? null : (
        <label className="field">
          <input type="checkbox" ref={share} /> add this deal's classes to the public rate index
          <small>Off by default. Anyone who holds this invoice, such as the buyer or a financier you showed it to, can then read your discount class on the board.</small>
        </label>
      )}
      <Actions>
        <Button
          onClick={async () => {
            try {
              const [disc, ten] = share.current?.checked ? [req.discount, req.tenor] : [undefined, undefined];
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
                await send(d.offer.sent.to, await encodeMessage(hd as Header), relayDeps);
                await save({ ...d, entry: { ...entry, sent: Date.now() } });
              }
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Sign entry
        </Button>
      </Actions>
      {out.el}
    </Card>
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
function SealCard({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const letter = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const out = useOut();
  if (d.seal) {
    return (
      <Card step="Step 4" title="Letter sealed" hint="Send your seal to the buyer and the financier. The buyer seals next; the financier's seal arrives with the advance.">
        <CodeBlock label="Your seal (s0)" value={d.seal.s0} filename={`${d.invoice_id}.supplier.seal.txt`} />
      </Card>
    );
  }
  const sealIt = (code: string) => async () => {
    try {
      const s0 = wasm.supplierSealAssignmentBytes(await secretFor(d), d.invoice, code);
      await save({ ...d, seal: { letter: code, s0 } });
      // HNK-26.T16: the seal goes to the buyer (who seals next) and the financier
      const to = [d.offer?.sent?.to, d.sign_request?.to].filter((x): x is string => !!x);
      for (const t of to) {
        const hd = draft("deal.seal", { role: "supplier", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n: d.n, body: { seal: s0, index: 0 } });
        await send(t, await encodeMessage(hd as Header), relayDeps);
      }
      if (to.length) await save({ ...d, seal: { letter: code, s0, sent: Date.now() } });
      refresh();
    } catch (e) {
      out.error(e);
    }
  };
  return (
    <Card step="Step 4" title="Read and seal the assignment letter" hint="The letter assigns this invoice to the financier and names where the buyer pays. Read it before you seal: your seal says you agree.">
      <Field label="Assignment letter code (from the financier)" area value={d.letter_in?.letter} inputRef={letter} />
      <FileField label="Assignment letter document (PDF)" help={d.letter_in ? "Already here: it came sealed with the letter. Hashed in your browser and compared with the letter." : "Hashed in your browser and compared with the letter. Never uploaded."} inputRef={pdf} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const code = value(letter);
              const f = json<LetterFields>(wasm.assignmentDecode(code, d.invoice));
              const arrived = d.letter_in && d.letter_in.letter === code ? new File([b64ToBytes(d.letter_in.pdf)], "letter.pdf", { type: "application/pdf" }) : undefined;
              const file = pdf.current!.files?.[0] ?? arrived;
              const pdfOk = file ? (await fileHash(file)) === f.terms_hash : false;
              const finOk = f.financier_pk === d.offer!.financier_pk;
              const ok = f.matches_invoice === true && pdfOk && finOk;
              const problems = [
                f.matches_invoice === true ? null : "the letter is for another invoice (N, amount or due date differ)",
                finOk ? null : "the letter names another financier than the one you offered to",
                file ? (pdfOk ? null : "the PDF is not the letter's document") : "choose the letter's PDF",
              ].filter((p): p is string => p !== null);
              const fields = (
                <Kv
                  rows={[
                    ["Financier", f.financier_pk, true],
                    ["Buyer pays to", f.financier_address, true],
                    ["Amount the buyer pays", `${zatToZec(f.amount_zat)} ZEC`],
                    ["Due", daysToDate(f.due_date)],
                    ["Letter document hash", f.terms_hash, true],
                  ]}
                />
              );
              if (!ok) {
                out.show(
                  <>
                    {fields}
                    <Banner kind="bad" title="Do not seal" text={problems.join("; ") + "."} />
                  </>,
                );
                return;
              }
              out.show(
                <>
                  {fields}
                  <Banner kind="ok" title="Letter checks out" text="Same invoice, same financier, and the PDF is the letter's document." />
                  <Actions>
                    <Button onClick={sealIt(code)}>Seal as supplier</Button>
                  </Actions>
                </>,
              );
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Check letter
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}

/** T8: compare the advance received with the advance agreed in the offer. */
function AdvanceCard({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const txid = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const got = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  const agreed = d.offer!.advance_zat;
  if (d.advance?.matches) {
    return (
      <Card step="Step 5" title="Advance received" hint="Matches the advance you asked for.">
        <Kv
          rows={[
            ["Transaction", d.advance.txid, true],
            ["Received", `${zatToZec(d.advance.received_zat)} ZEC`],
          ]}
        />
      </Card>
    );
  }
  return (
    <Card step="Step 5" title="Check the advance" hint={`You asked for ${zatToZec(agreed)} ZEC. Compare with what your wallet received in that transaction. The full check (receipt and the financier's seal in the same memo) runs with jitsuin on your own wallet.`}>
      <Field label="Advance transaction id" placeholder="64 hex characters, from the financier or your wallet" value={d.advance_notice?.txid} inputRef={txid} />
      <Field label="Amount your wallet received (ZEC)" type="number" placeholder={zatToZec(agreed)} inputRef={got} />
      {d.advance && !d.advance.matches ? <Banner kind="bad" title="Advance differs" text={`Received ${zatToZec(d.advance.received_zat)} ZEC instead of ${zatToZec(agreed)} ZEC.`} /> : null}
      <Actions>
        <Button
          onClick={async () => {
            try {
              const receivedZat = zecToZat(value(got));
              await save({ ...d, advance: { txid: hex64(value(txid), "transaction id"), received_zat: receivedZat, matches: receivedZat === agreed } });
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Record advance
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}
