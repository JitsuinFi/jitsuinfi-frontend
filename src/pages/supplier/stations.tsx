// The work at each station of a deal (HNK-24.T4 – T8, HNK-26.T6, T16, T18, T20; IA port
// 2026-10-26). No master key stays in this tab: every action that needs the invoice's key is a
// stamp (one passkey touch, `account.stamp()`), and the jitsuin-wasm `*Bytes` call zeroes it.
//
// User feedback 2026-10-26 B: getting the buyer's signature needs no crypto knowledge. The buyer's
// key came through the relay in a letter that names the buyer's mailbox (and is signed by that
// key), so the deal keeps that mailbox and "Send to the buyer" uses it; the buyer signs in their
// inbox; the signature comes back to the supplier's inbox, and this page offers "Check and keep"
// as soon as it is there. Pasting by hand is a folded fallback ("No relay? Hand it over by hand").
// The copy says what a thing is, not its encoding: keys show as fingerprints.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Actions, Banner, Button, CodeBlock, Field, FileField, Kv, useOut } from "../../app/ui";
import { ScanButton } from "../../app/Scanner";
import { addressFromScan, routeScan } from "../../lib/scan";
import { Dock } from "../../app/Dock";
import { act, checkInbox, letGo, lettersFor } from "../../app/inbox";
import { useInbox } from "../../app/InboxPanel";
import { setDid } from "../../app/outcome";
import { useFormDraft } from "../../app/kept";
import { financierFingerprint } from "../../lib/account";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { account } from "../../lib/app-session";
import { daysToDate, fileHash, json, wasm, zatToZec, zecToZat } from "../../lib/core";
import { rank, recordLine, verifyDirectory, type Directory, type Fit } from "../../lib/directory";
import { knownMailbox } from "../../lib/key-match";
import { NET } from "../../lib/network";
import { readablePrint } from "../../lib/print";
import { PROVIDER } from "../../lib/provider";
import { draft, send, signInWasm } from "../../lib/relay";
import { describeFiles, encodeMessage, type Header } from "../../lib/relay-message";
import { DEFAULT_ADVANCE_RATIO, advanceSuggestion, advancePrefill, advanceRecord, decodeEntryRequest, encodeOffer, entryRequestProblems, looksShielded, type StationKey, type SupplierDeal } from "../../lib/supplier-deal";
import { handToVerify } from "../../lib/verify-handoff";
import { takeContact } from "../MailboxCard";
import { buyerName, STATION, Work, type Stations } from "./parts";
import { boardLine, lastAddress, pdfOf, rememberAddress, save, type Book, type Deal } from "./data";
import { addressProblem } from "../../lib/zaddr";

const HEX64 = /^[0-9a-f]{64}$/i;
const value = (r: { current: { value: string } | null }) => r.current!.value.trim();
const when = (t: number) => new Date(t).toLocaleString();
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** A 64-character id (a transaction id, a key) read from a field, with what it is named in the error. */
function id64(v: string, what: string): string {
  const x = v.trim().toLowerCase();
  if (!HEX64.test(x)) throw new Error(`${what}: copy it whole, 64 letters and digits as it is shown`);
  return x;
}

/** Per-invoice secret for `d` from one stamp; the supplier `*Bytes` function that receives it zeroes it. */
export async function secretFor(d: SupplierDeal): Promise<Uint8Array> {
  return wasm.supplierInvoiceSecretBytes(await account.stamp(), d.invoice_id, d.buyer_pk);
}

/** The financier's fingerprint, as its console and contact card show it. */
function useFinPrint(pk: string | undefined): string {
  const [p, setP] = useState("");
  useEffect(() => {
    if (pk) void financierFingerprint(pk).then(setP, () => setP(readablePrint(pk)));
  }, [pk]);
  return p;
}

export interface WorkProps {
  d: Deal;
  book: Book | null;
  /** The deal's page: an outcome set here shows on it. */
  path: string;
  /** The action is done: the page moves on to the deal's next station. */
  onDone: () => void;
}

/** Records the outcome on the deal's page and moves on. */
const did = (p: WorkProps, glyph: string, title: string, text: string, warn?: boolean) => {
  setDid({ at: p.path, glyph, title, text, ...(warn ? { warn } : {}) });
  p.onDone();
};

export function StationWork(p: WorkProps & { station: StationKey; stations: Stations }): ReactNode {
  const { d, station, stations } = p;
  const st = stations.find((s) => s.key === station)!;
  if (st.state === "later") {
    const now = stations.find((s) => s.state === "next" || s.state === "wait");
    const ix = stations.indexOf(st) + 1;
    return <Work glyph={STATION[station].glyph} step={station === "settled" ? "Settled" : `Step ${ix}`} title={STATION[station].label} hint={`Not yet. This station opens after “${now ? STATION[now.key].label.toLowerCase() : "the earlier steps"}”.`} />;
  }
  switch (station) {
    case "signature":
      return <SignatureWork {...p} />;
    case "offer":
      return <OfferWork {...p} />;
    case "entry":
      return <EntryWork {...p} />;
    case "seal":
      return <SealWork {...p} />;
    case "advance":
      return <AdvanceWork {...p} />;
    case "settled": {
      const board = boardLine(d);
      return d.bundle || st.state === "done" ? (
        <Work glyph="済" step="Settled" title="Repaid and settled" hint="The buyer repaid and the financier posted the settled entry. The settlement bundle proves the whole deal on the Verify page.">
          <Kv
            rows={[
              ["On the board", board ? board.replace(/^On the board: /, "") : "not read yet"],
              ...(d.advance ? [["Advance", `${zatToZec(d.advance.received_zat)} ZEC${d.advance.matches ? ", as agreed" : ""}`] as [string, string]] : []),
            ]}
          />
          {d.bundle ? (
            <details className="sp-fold">
              <summary>Details: the settlement bundle</summary>
              <div className="sp-fold-body">
                <CodeBlock label="Settlement bundle" value={d.bundle} filename={`${d.invoice_id}.bundle.txt`} />
              </div>
            </details>
          ) : null}
          <Actions>
            {/* the bundle goes along to Verify's in-tray, in memory (never in the address) */}
            <Dock label="Check">
              <a className="sp-ink" href="/verify" onClick={() => d.bundle && handToVerify(d.bundle)}>
                Check it on Verify
              </a>
            </Dock>
          </Actions>
        </Work>
      ) : (
        <Work glyph="済" step="Waiting" title="Waiting for the buyer to pay" hint={`Your advance arrived as agreed. The buyer pays the financier at maturity, due ${daysToDate(d.due_date)}; the financier then posts the settled entry and the settlement bundle arrives in your inbox. Nothing to do until then.`} />
      );
    }
  }
}

/** A folded fallback for working without the relay. */
function ByHand({ title = "No relay? Hand it over by hand", children }: { title?: string; children: ReactNode }): ReactNode {
  return (
    <details className="sp-fold">
      <summary>{title}</summary>
      <div className="sp-fold-body">{children}</div>
    </details>
  );
}

/** T4 + HNK-23.T7: send the invoice to the buyer's inbox; keep the signature that comes back. */
function SignatureWork(p: WorkProps): ReactNode {
  const { d, book } = p;
  const inbox = useInbox();
  const pdf = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const sig = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [to, setTo] = useState<string>("");
  const sendOut = useOut();
  const keepOut = useOut();
  const handOut = useOut();
  const buyers = (book?.contacts ?? []).filter((c) => c.role === "buyer");
  const who = buyerName(book, d);
  const held = pdfOf(d.n);
  const back = lettersFor(inbox, d.n, "invoice.signature")[0];

  if (d.buyer_signature) {
    return (
      <Work glyph="照" step="Step 1" title="Signed by the buyer" hint="Checked in your browser against exactly this invoice.">
        <Banner kind="ok" title="Signed by the buyer" text="The buyer's key for this invoice signed exactly these bytes. Next: offer it to one financier." />
      </Work>
    );
  }

  const keepSig = async (s: string, inboxed: boolean) => {
    wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
    await save({ ...d, buyer_signature: s });
    setDid({ at: p.path, glyph: "照", title: "Signed by the buyer", text: "The buyer's signature holds for exactly this invoice. Next: offer it to one financier.", ...(inboxed ? { inbox: true } : {}) });
    p.onDone();
  };

  const sendToBuyer = async () => {
    try {
      let mailbox = d.buyer_mailbox ?? to;
      if (!mailbox && card.current?.value.trim()) mailbox = (await takeContact(card.current.value, "buyer")).mailbox_pk;
      if (!mailbox) throw new Error("Choose the buyer to send it to: from your contacts, or paste their contact card.");
      // user test 2026-10-27: a key that came in another buyer's letter never goes to this mailbox
      const other = d.buyer_mailbox ? null : knownMailbox(d.buyer_pk, mailbox, book?.keys ?? []);
      if (other) throw new Error(`This invoice is for key ${readablePrint(d.buyer_pk)}, which came from the mailbox ${readablePrint(other)}, not this buyer's: they could not open it. Send it to the buyer who sent that key.`);
      const file = held ?? pdf.current?.files?.[0];
      if (!file) throw new Error("Choose the invoice PDF: the same file you wrote the invoice with.");
      const terms = json<{ terms_hash: string }>(wasm.invoiceDecode(d.invoice)).terms_hash;
      if ((await fileHash(file)) !== terms) throw new Error("This PDF is not the invoice's document: it differs from the one the invoice was written with.");
      const files = [{ name: file.name.endsWith(".pdf") ? file.name : `${d.invoice_id}.pdf`, mime: "application/pdf" as const, bytes: new Uint8Array(await file.arrayBuffer()) }];
      const me = myIdentity();
      const header = signInWasm(
        draft("invoice.sign_request", { role: "supplier", mailbox_pk: me.mailbox_pk }, mailbox, relayDeps, { n: d.n, body: { invoice: d.invoice }, attachments: await describeFiles(files) }),
        d.supplier_pk,
        await secretFor(d),
        relayDeps,
      );
      await send(mailbox, await encodeMessage(header, files), relayDeps);
      const at = Date.now();
      await save({ ...d, buyer_mailbox: mailbox, sign_request: { to: mailbox, at } });
      const name = buyerName(book, { ...d, buyer_mailbox: mailbox }).name;
      did(p, "照", "Sent to the buyer", `${d.invoice_id} and its PDF went sealed to ${name === "The buyer" || name.startsWith("A buyer") ? "the buyer's" : `${name}'s`} inbox on ${when(at)}. They sign it there; the signature comes back to your inbox.`);
    } catch (e) {
      sendOut.error(e);
    }
  };

  const handFold = (
    <ByHand>
      <p className="sp-or">Give the buyer the invoice as code (under "Details: the invoice as code", below the sheet) and its PDF. They sign it on their screen and give you back their signature.</p>
      <Field label="The buyer's signature, from their screen" placeholder="paste it whole" inputRef={sig} />
      <Actions>
        <Button
          secondary
          onClick={async () => {
            try {
              const s = value(sig).toLowerCase();
              if (!/^[0-9a-f]{128}$/.test(s)) throw new Error("This is not a whole signature: copy it again from the buyer's screen.");
              await keepSig(s, false);
            } catch (e) {
              handOut.error(e);
            }
          }}
        >
          Check and keep
        </Button>
      </Actions>
      {handOut.el}
    </ByHand>
  );

  // the signature is back in the inbox: keep it here
  if (back) {
    return (
      <Work glyph="照" step="Step 1" title="The buyer signed: keep it" hint="The buyer's signature came back to your inbox. It is checked against exactly this invoice before it is kept.">
        <p className="sp-line">
          <b lang="ja" aria-hidden="true">
            買
          </b>
          <span>{`From ${who.name}, ${new Date(back.r.receivedAt).toLocaleString()}.`}</span>
        </p>
        <Actions>
          <Button
            onClick={async () => {
              const done = await act(back);
              if (!done) {
                keepOut.error(new Error("The signature did not check out for this invoice; it stays in your inbox."));
                return;
              }
              letGo(back);
              if (done.did) setDid({ ...done.did, at: p.path, inbox: true });
              p.onDone();
            }}
          >
            Check and keep
          </Button>
        </Actions>
        {keepOut.el}
      </Work>
    );
  }

  if (d.sign_request) {
    return (
      <Work glyph="照" step="Step 1" title="Waiting for the buyer's signature" hint={`Sent to ${who.name === "The buyer" ? "the buyer" : who.name} on ${when(d.sign_request.at)}. The buyer signs it in their inbox; the signature comes back to yours and shows here, ready to keep.`}>
        <p className="sp-line">
          <b lang="ja" aria-hidden="true">
            待
          </b>
          <span>{inbox.checking ? "Checking your inbox…" : "Your inbox checks itself every minute."}</span>
        </p>
        <Actions>
          <Button secondary onClick={() => checkInbox()}>
            Check inbox now
          </Button>
          <button type="button" className="sp-ink" onClick={() => void sendToBuyer()}>
            Send it again
          </button>
        </Actions>
        {sendOut.el}
        {handFold}
      </Work>
    );
  }

  return (
    <Work glyph="照" step="Step 1" title="Get the buyer's signature" hint="Send the invoice and its PDF to the buyer. They sign it in their inbox; the signature comes back to yours. A financier only looks at an invoice the buyer signed.">
      <dl className="sp-sendto">
        <div>
          <dt>To</dt>
          <dd>
            {d.buyer_mailbox ? (
              <>
                <strong>{who.name}</strong>
                <code>{who.print}</code>
                <small>The buyer's key came from this mailbox: the invoice goes back to it.</small>
              </>
            ) : buyers.length ? (
              <>
                <select aria-label="The buyer to send it to" value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Choose a buyer from your contacts</option>
                  {buyers.map((c) => (
                    <option key={c.mailbox_pk} value={c.mailbox_pk}>
                      {`${c.username ? `@${c.username}` : "Buyer"} · ${c.fingerprint}${c.verified_at ? "" : " (not compared yet)"}`}
                    </option>
                  ))}
                </select>
                <small>{`This invoice is for key ${readablePrint(d.buyer_pk)}, written by hand. Send it only to the buyer who showed you that key: compare it with Invoices → Your next invoice key on their screen.`}</small>
              </>
            ) : (
              <small>No buyer in your contacts yet: paste their contact card below.</small>
            )}
          </dd>
        </div>
        <div>
          <dt>With</dt>
          <dd>{held ? <span>{`${held.name}, the PDF you wrote it with`}</span> : <FileField label="The invoice PDF, the same file you wrote it with" help="Sent sealed: only the buyer can open it." inputRef={pdf} />}</dd>
        </div>
      </dl>
      {!d.buyer_mailbox ? (
        <details className="sp-fold" open={!buyers.length}>
          <summary>Paste the buyer's contact link or card</summary>
          <div className="sp-fold-body">
            <Field label="The buyer's contact link or card" area placeholder="https://…/app/contact#… or jitsuin-contact-v1:…" help="Compare its fingerprint with the buyer before you send. It is kept in your contacts." inputRef={card} />
            {/* a scanned contact QR fills the field; sending stays the person's own press */}
            <div className="actions">
              <ScanButton
                what="the buyer's contact QR"
                onPaste={() => card.current?.focus()}
                onRead={(t) => {
                  routeScan(t);
                  card.current!.value = t;
                }}
              />
            </div>
          </div>
        </details>
      ) : null}
      <Actions>
        <Dock label="Send">
          <Button onClick={sendToBuyer}>Send to the buyer</Button>
        </Dock>
      </Actions>
      {sendOut.el}
      {handFold}
    </Work>
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
function OfferWork(p: WorkProps): ReactNode {
  const { d } = p;
  const contact = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const fin = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const adv = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const addr = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const manual = useRef<HTMLDetailsElement>(null);
  const out = useOut();
  // finding F10: the offer's fields survive a reload (sealed in this tab)
  const kept = useFormDraft<HTMLDivElement>(`supplier/deal/${d.ref}/offer`);
  /** A value put in by a tap is kept like a typed one. */
  const put = (el: HTMLInputElement | HTMLTextAreaElement | null, v: string) => {
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const finPrint = useFinPrint(d.offer?.financier_pk);
  // HNK-30.T20 (D-47): the financiers that chose to be listed, matched to this invoice here, in
  // the browser. Picking one fills its contact card and key; nothing about the invoice is sent.
  const [fits, setFits] = useState<Fit[] | string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // judge run 2, finding 7: the address is checked as it is pasted; the last one used here is offered
  const [addrSay, setAddrSay] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<string | null>(null);
  useEffect(() => {
    if (d.offer) return;
    void findFinanciers(d).then(setFits, (e) => setFits(e instanceof Error ? e.message : String(e)));
    void lastAddress().then(setSuggest, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const checkAddr = () => {
    const a = value(addr);
    setAddrSay(a ? addressProblem(a) : null);
  };

  if (d.offer) {
    const facts = (
      <Kv
        rows={[
          ["Financier", finPrint || "…"],
          ["Advance asked", `${zatToZec(d.offer.advance_zat)} ZEC`],
          ["Your address for the advance", d.offer.supplier_address, true],
        ]}
      />
    );
    const hint = "Offer this invoice to one financier only. A second offer gets caught on the board.";
    if (d.offer.sent) {
      return (
        <Work glyph="署" step="Step 2" title="Offer sent" hint={hint}>
          <Banner kind="ok" title="In the financier's inbox" text={`Sealed and signed on ${when(d.offer.sent.at)}. The financier's node checks your signature and the buyer's before it answers.`} />
          {facts}
        </Work>
      );
    }
    const code = encodeOffer({ invoice: d.invoice, buyer_signature: d.buyer_signature!, ...d.offer });
    return (
      <Work glyph="署" step="Step 2" title="Offer written" hint={hint}>
        {facts}
        <CodeBlock label="Offer code: hand it to the financier" value={code} filename={`${d.invoice_id}.offer.txt`} />
      </Work>
    );
  }
  const finder =
    fits === null ? (
      <p className="fd-k">Reading the financier directory…</p>
    ) : typeof fits === "string" ? (
      <p className="fd-k">{`The directory could not be read (${fits}). Paste the financier's contact card below instead.`}</p>
    ) : !fits.length ? (
      <p className="fd-k">
        <b lang="ja">名簿</b>No financier is listed in the directory yet. Paste the contact card a financier gave you.
      </p>
    ) : (
      <div className="fd">
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
                <button
                  type="button"
                  className="sp-pill"
                  aria-pressed={picked === f.listing.financier_pk}
                  onClick={() => {
                    put(contact.current, f.listing.contact);
                    put(fin.current, f.listing.financier_pk);
                    setPicked(f.listing.financier_pk);
                    // its typical advance, or the default share of the invoice; the supplier can change it
                    put(adv.current, zatToZec(advanceSuggestion(d.amount_zat, f.listing.mandate)));
                  }}
                >
                  {picked === f.listing.financier_pk ? "Chosen" : "Offer to this financier"}
                </button>
                <span className="fd-m">{`${zatToZec(m.min_zat)} – ${zatToZec(m.max_zat)} ZEC · up to ${m.max_tenor_days} days${m.buyer_kyc ? " · buyers it knows from KYC" : ""}`}</span>
                <span className="fd-why">{f.fits ? "Fits this invoice." : f.misses.join("; ")}</span>
                <span className={f.listing.reputation ? "fd-rep is-attested" : "fd-rep"}>
                  <b lang="ja" aria-hidden="true">
                    績
                  </b>
                  {recordLine(f.listing)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  const noDirectory = fits !== null && (typeof fits === "string" || !fits.length);
  return (
    <Work glyph="署" step="Step 2" title="Offer it to one financier" hint="Your offer goes sealed to the financier's inbox, signed with this invoice's key. The financier checks the board for this invoice, then asks you for the board entry.">
      {/* HNK-26.T6: the last financier that declined; the invoice was never on the board, so it is free */}
      {d.declined?.length ? <Banner kind="warn" title="Declined" text={`${d.declined[d.declined.length - 1].reason} Offer it to another financier.`} /> : null}
      {finder}
      {kept.note}
      <div className="ia-draft-area" ref={kept.ref}>
      <details className="sp-fold" open={noDirectory || kept.restoredAny} ref={manual}>
        <summary>{picked ? "The chosen financier's card" : "Not in the directory? Paste the financier's card"}</summary>
        <div className="sp-fold-body">
          <Field label="The financier's contact card" area placeholder="jitsuin-contact-v1:…" help="From the financier's console, under For suppliers." inputRef={contact} />
          <Field label="The financier's node key, from the same place" placeholder="paste it whole" help="Checked against the card before anything is sent." inputRef={fin} />
        </div>
      </details>
      <div className="sp-row2">
        <Field label="Advance you ask (ZEC)" inputMode="decimal" value={zatToZec(advanceSuggestion(d.amount_zat))} help={`Prefilled at ${Math.round(DEFAULT_ADVANCE_RATIO * 100)} % of the invoice (${zatToZec(d.amount_zat)} ZEC), or the chosen financier's usual share. Change it if you agreed otherwise.`} inputRef={adv} />
        <div className="field sp-addr">
          <label className="sp-addr-lab" htmlFor="sp-addr-in">Where you want the advance paid</label>
          {/* mobile E2E 2026-10-27, finding 7: the saved address in one tap, or a scan of the wallet's receive QR */}
          <span className="sp-addr-quick">
            {suggest ? (
              <button
                type="button"
                className="sp-pill sp-addr-last"
                onClick={() => {
                  put(addr.current, suggest);
                  setAddrSay(addressProblem(suggest));
                }}
              >
                Use my saved address
                <small>{`${suggest.slice(0, 10)}…${suggest.slice(-6)}`}</small>
              </button>
            ) : null}
            <ScanButton
              what="your wallet's receive QR"
              label="Scan my wallet's QR"
              onPaste={() => addr.current?.focus()}
              onRead={(t) => {
                const a = addressFromScan(t, addressProblem);
                put(addr.current, a);
                setAddrSay(null);
              }}
            />
          </span>
          <input id="sp-addr-in" type="text" inputMode="text" spellCheck="false" autoComplete="off" autoCapitalize="none" autoCorrect="off" enterKeyHint="done" placeholder={`${NET.addressHint} from your wallet app`} aria-invalid={addrSay ? true : undefined} aria-describedby="sp-addr-say" ref={addr} onBlur={checkAddr} onInput={() => addrSay && setAddrSay(null)} />
          <small id="sp-addr-say" className={addrSay ? "is-bad" : undefined} role={addrSay ? "alert" : undefined}>
            {addrSay ?? `Your Zcash shielded address, from your wallet app (it starts with ${NET.addressHint}). This app does not hold your wallet, so paste it here. A new address for every deal keeps your deals apart.`}
          </small>
        </div>
      </div>
      </div>
      <Actions>
        <Dock label="Offer">
        <Button
          onClick={async () => {
            try {
              const advanceZat = zecToZat(value(adv));
              if (advanceZat > d.amount_zat) throw new Error("the advance cannot be more than the invoice amount");
              const addrProblem = addressProblem(value(addr));
              if (addrProblem) {
                setAddrSay(addrProblem);
                addr.current?.focus();
                throw new Error(addrProblem);
              }
              if (!looksShielded(value(addr))) throw new Error(`use a shielded ${NET.noun} address (${NET.addressHint})`);
              if (!value(contact)) {
                if (manual.current) manual.current.open = true;
                throw new Error("Choose a financier from the directory, or paste the card a financier gave you.");
              }
              const financierPk = id64(value(fin), "the financier's node key");
              const c = await takeContact(value(contact), "financier");
              if ((await financierFingerprint(financierPk)) !== c.fingerprint) throw new Error("this key does not belong to that contact card: ask the financier again");
              const offer = { financier_pk: financierPk, advance_zat: advanceZat, supplier_address: value(addr) };
              const me = myIdentity();
              const header = signInWasm(
                draft("deal.offer", { role: "supplier", mailbox_pk: me.mailbox_pk }, c.mailbox_pk, relayDeps, {
                  n: d.n,
                  // the buyer's mailbox lets the node send the letter there too
                  body: { invoice: d.invoice, buyer_signature: d.buyer_signature!, advance_zat: offer.advance_zat, supplier_address: offer.supplier_address, ...((d.sign_request?.to ?? d.buyer_mailbox) ? { buyer_mailbox_pk: d.sign_request?.to ?? d.buyer_mailbox } : {}) },
                }),
                d.supplier_pk,
                await secretFor(d),
                relayDeps,
              );
              await send(c.mailbox_pk, await encodeMessage(header, []), relayDeps);
              const at = Date.now();
              await save({ ...d, offer: { ...offer, sent: { to: c.mailbox_pk, at } } });
              await rememberAddress(offer.supplier_address).catch(() => undefined);
              kept.clear();
              did(p, "署", "Offer sent: in the financier's inbox", `Sealed and signed on ${when(at)}, asking ${zatToZec(advanceZat)} ZEC. The financier's node checks your signature and the buyer's, then asks you for the board entry.`);
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Send offer
        </Button>
        </Dock>
      </Actions>
      {out.el}
    </Work>
  );
}

/** T6: wait for the financier's entry request (SEQ-03 part 4), then sign the board entry for it. */
function EntryWork(p: WorkProps): ReactNode {
  const { d } = p;
  const out = useOut();
  const code = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const share = useRef<HTMLInputElement>(null);
  const finPrint = useFinPrint(d.entry_request?.financier_pk ?? d.offer?.financier_pk);
  if (d.entry) {
    return (
      <Work glyph="登" step="Step 3" title="Board entry signed" hint="The financier posts it to the board. The first valid entry for this invoice wins.">
        {d.entry.sent ? <Banner kind="ok" title="Sent to the financier's node" text={`On ${when(d.entry.sent)}. It posts the entry to the board; the assignment letter comes next.`} /> : null}
        <Kv
          rows={[
            ["Rate classes on the public index", d.entry.discount === 0 && d.entry.tenor === 0 ? "not disclosed" : `${d.entry.discount} / ${d.entry.tenor}`],
            ["Buyer's history checked", d.entry.tagged ? "yes" : "no"],
          ]}
        />
        {d.entry.sent ? null : <CodeBlock label="The entry: hand it to the financier" value={d.entry.memo} filename={`${d.invoice_id}.entry.txt`} />}
      </Work>
    );
  }
  const req = d.entry_request;
  if (!req) {
    return (
      <Work glyph="登" step="Step 3" title="Wait for the entry request" hint="The financier asks for the board entry only after it has checked the board for this invoice (and the buyer's history, if it needs it). The request arrives in your inbox. Nothing to sign before that.">
        <ByHand title="No relay? Paste the request the financier gave you">
          <Field label="Entry request (from the financier)" area placeholder="jitsuin-entry-request-v1:…" inputRef={code} />
          <Actions>
            <Button
              secondary
              onClick={async () => {
                try {
                  const r = decodeEntryRequest(value(code));
                  const problems = entryRequestProblems(d, r);
                  if (problems.length) {
                    out.show(<Banner kind="bad" title="Not for this deal" text={problems.join("; ") + "."} />);
                    return;
                  }
                  await save({ ...d, entry_request: r });
                  did(p, "登", "Entry request read", "It is for this invoice, from the financier you offered it to. Sign the board entry next.");
                } catch (e) {
                  out.error(e);
                }
              }}
            >
              Read request
            </Button>
          </Actions>
          {out.el}
        </ByHand>
      </Work>
    );
  }
  const classes = req.discount === undefined ? "none" : `${req.discount} / ${req.tenor}`;
  return (
    <Work glyph="登" step="Step 3" title="Sign the board entry" hint="The financier checked the board and asks for your entry. The entry commits to that financier without naming it.">
      <Kv
        rows={[
          ["Financier", finPrint || "…"],
          ["Rate classes it gave (discount / tenor)", classes],
          ["Buyer's history checked", req.history_tag ? "yes" : "no"],
        ]}
      />
      {/* Classes stay out of the public rate index unless the supplier opts in (D-42, W-14): anyone
          holding this invoice can find the entry by N and read them. */}
      {req.discount === undefined ? null : (
        <label className="field is-check">
          <input type="checkbox" ref={share} />
          <span>Add this deal's classes to the public rate index</span>
          <small>Off by default. Anyone who holds this invoice, such as the buyer or a financier you showed it to, can then read your discount class on the board.</small>
        </label>
      )}
      <Actions>
        <Dock label="Sign">
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
                const at = Date.now();
                await save({ ...d, entry: { ...entry, sent: at } });
                did(p, "登", "Entry signed and sent to the financier's node", `On ${when(at)}. The node posts it to the board; the first valid entry for this invoice wins. The assignment letter comes next.`);
              } else did(p, "登", "Board entry signed", "Hand the entry under 登 to the financier: its node posts it to the board.");
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Sign entry
        </Button>
        </Dock>
      </Actions>
      {out.el}
    </Work>
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
function SealWork(p: WorkProps): ReactNode {
  const { d } = p;
  const letter = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const out = useOut();
  const [letterOk, setLetterOk] = useState(false);
  if (d.seal) {
    return (
      <Work glyph="印" step="Step 4" title="Letter sealed" hint="Your seal goes to the buyer and the financier. The buyer seals next; the financier's seal arrives with the advance.">
        {d.seal.sent ? <Banner kind="ok" title="Sent to the buyer and the financier" text={`On ${when(d.seal.sent)}.`} /> : <CodeBlock label="Your seal: hand it to the buyer and the financier" value={d.seal.s0} filename={`${d.invoice_id}.supplier.seal.txt`} />}
      </Work>
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
      const at = Date.now();
      if (to.length) await save({ ...d, seal: { letter: code, s0, sent: at } });
      did(p, "印", to.length ? "Letter sealed and sent" : "Letter sealed", to.length ? `Your seal went to the buyer and the financier on ${when(at)}. The buyer seals next; the financier's seal arrives with the advance.` : "Hand your seal under 印 to the buyer and the financier.");
    } catch (e) {
      out.error(e);
    }
  };
  const check = async () => {
    try {
      const code = value(letter);
      const f = json<LetterFields>(wasm.assignmentDecode(code, d.invoice));
      const arrived = d.letter_in?.pdf && d.letter_in.letter === code ? new File([b64ToBytes(d.letter_in.pdf)], "letter.pdf", { type: "application/pdf" }) : undefined;
      const file = pdf.current?.files?.[0] ?? arrived;
      const pdfOk = file ? (await fileHash(file)) === f.terms_hash : false;
      const finOk = f.financier_pk === d.offer!.financier_pk;
      const ok = f.matches_invoice === true && pdfOk && finOk;
      const problems = [
        f.matches_invoice === true ? null : "the letter is for another invoice (number, amount or due date differ)",
        finOk ? null : "the letter names another financier than the one you offered to",
        file ? (pdfOk ? null : "the PDF is not the letter's document") : "choose the letter's PDF",
      ].filter((x): x is string => x !== null);
      const fields = (
        <Kv
          rows={[
            ["Financier", await financierFingerprint(f.financier_pk).catch(() => readablePrint(f.financier_pk))],
            ["Buyer pays to", f.financier_address, true],
            ["Amount the buyer pays", `${zatToZec(f.amount_zat)} ZEC`],
            ["Due", daysToDate(f.due_date)],
            ["The letter's PDF", pdfOk ? "matches the letter" : file ? "does not match" : "not chosen"],
          ]}
        />
      );
      setLetterOk(ok);
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
            <Dock label="Seal">
              <Button onClick={sealIt(code)}>Seal as supplier</Button>
            </Dock>
          </Actions>
        </>,
      );
    } catch (e) {
      out.error(e);
    }
  };
  return (
    <Work glyph="印" step="Step 4" title="Read and seal the assignment letter" hint="The letter assigns this invoice to the financier and names where the buyer pays. Read it before you seal: your seal says you agree.">
      {d.letter_in ? (
        <p className="sp-line">
          <b lang="ja" aria-hidden="true">
            印
          </b>
          <span>{`The letter and its PDF came to your inbox on ${when(d.letter_in.at)}. Check it, then seal.`}</span>
        </p>
      ) : (
        <p className="sp-line is-wait">
          <b lang="ja" aria-hidden="true">
            待
          </b>
          <span>The letter arrives in your inbox from the financier's node, with its PDF.</span>
        </p>
      )}
      <details className="sp-fold" open={!d.letter_in}>
        <summary>{d.letter_in ? "The letter as it came" : "No relay? Paste the letter the financier gave you"}</summary>
        <div className="sp-fold-body">
          <Field label="Assignment letter (from the financier)" area value={d.letter_in?.letter} inputRef={letter} />
          <FileField label="The letter's PDF" help={d.letter_in?.pdf ? "Already here: it came sealed with the letter. Choose a file only to check another one." : d.letter_in?.pdf_away ? "PDF on your other device: it came there with the letter. Choose it here to check it, or seal on that device." : "Compared with the letter in your browser. Never uploaded."} inputRef={pdf} />
        </div>
      </details>
      <Actions>
        {/* once the letter checks out, Seal is the screen's primary and Check steps back (mobile E2E 2026-10-27, finding 4) */}
        {letterOk ? (
          <Button secondary onClick={check}>
            Check again
          </Button>
        ) : (
          <Dock label="Check">
            <Button onClick={check}>Check letter</Button>
          </Dock>
        )}
      </Actions>
      {out.el}
    </Work>
  );
}

/**
 * T8: compare the advance received with the advance agreed in the offer. Judge run 2, finding 6:
 * the financier's notice names the amount and the transaction, so the supplier only confirms what
 * the wallet shows; "Different amount" (folded) records another amount, and the deal says so.
 */
function AdvanceWork(p: WorkProps): ReactNode {
  const { d } = p;
  const txid = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const got = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  // finding F10: what was typed for the advance survives a reload (sealed in this tab)
  const kept = useFormDraft<HTMLDivElement>(`supplier/deal/${d.ref}/advance`);
  const agreed = d.offer!.advance_zat;
  const pre = advancePrefill(d);
  if (d.advance?.matches) {
    return (
      <Work glyph="金" step="Step 5" title="Advance received" hint="Matches the advance you asked for.">
        <Kv rows={[["Received", `${zatToZec(d.advance.received_zat)} ZEC`]]} />
        <details className="sp-fold">
          <summary>Details</summary>
          <div className="sp-fold-body">
            <Kv rows={[["Transaction", d.advance.txid, true]]} />
          </div>
        </details>
      </Work>
    );
  }
  const record = async (receivedZat: number, tx: string) => {
    const a = advanceRecord(d, receivedZat, id64(tx, "the transaction id"));
    await save({ ...d, advance: a });
    kept.clear();
    if (a.matches) did(p, "金", "Advance received as agreed", `${zatToZec(a.received_zat)} ZEC arrived in your wallet. The buyer pays the financier at maturity, due ${daysToDate(d.due_date)}; the settlement bundle arrives in your inbox then.`);
    else out.show(<Banner kind="bad" title="Advance differs" text={`Your wallet received ${zatToZec(a.received_zat)} ZEC instead of the ${zatToZec(agreed)} ZEC you asked for. Tell the financier before anything else.`} />);
  };
  const byHand = (
    <div className="ia-draft-area" ref={kept.ref}>
      {kept.note}
      <Field label="Amount your wallet received (ZEC)" inputMode="decimal" placeholder={zatToZec(pre?.zat ?? agreed)} inputRef={got} />
      <Field label="The transaction it came in" placeholder="from the financier's letter or your wallet" value={pre?.txid} help="Your wallet app shows it with the payment." inputRef={txid} />
      <Actions>
        <Button
          secondary={!!pre}
          onClick={async () => {
            try {
              await record(zecToZat(value(got)), value(txid));
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Record what my wallet received
        </Button>
      </Actions>
    </div>
  );
  return (
    <Work glyph="金" step="Step 5" title="Check the advance" hint={pre ? `The financier says it paid the advance on ${when(pre.at)}. Open your wallet app and compare.` : `You asked for ${zatToZec(agreed)} ZEC. The financier's notice arrives in your inbox when it pays; or record what your wallet received by hand.`}>
      {d.advance && !d.advance.matches ? <Banner kind="bad" title="Advance differs" text={`Received ${zatToZec(d.advance.received_zat)} ZEC instead of ${zatToZec(agreed)} ZEC.`} /> : null}
      {pre ? (
        <>
          <p className="sp-ask">
            <span>{"Your wallet received "}</span>
            <b>{`${zatToZec(pre.zat)} ZEC`}</b>
            <span>?</span>
          </p>
          {pre.asAgreed ? null : <Banner kind="warn" title="Not the amount you asked for" text={`The financier names ${zatToZec(pre.zat)} ZEC; your offer asked ${zatToZec(agreed)} ZEC. Confirm only what your wallet shows.`} />}
          <Actions>
            <Dock label="Confirm">
            <Button
              onClick={async () => {
                try {
                  await record(pre.zat, pre.txid);
                } catch (e) {
                  out.error(e);
                }
              }}
            >
              {`Confirm: ${zatToZec(pre.zat)} ZEC received`}
            </Button>
            </Dock>
          </Actions>
          <details className="sp-fold">
            <summary>Different amount</summary>
            <div className="sp-fold-body">{byHand}</div>
          </details>
        </>
      ) : (
        byHand
      )}
      {out.el}
    </Work>
  );
}
