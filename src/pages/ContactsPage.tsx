// Contacts (IA port 2026-10-26, approved prototype ia-supplier-contacts; HNK-22.T5): a section for
// every role. The 名刺: this role's contact card as a card of paper (the role's seal, the key
// fingerprint, the mailbox), to copy, download or show as a QR across the table; and the contacts
// book, kept encrypted on this device. A card counts as compared only after the fingerprint was
// read with the person by phone or in person: the relay cannot vouch for whose card it is.
// Every role mounts it (`counter`, the role's root class for its stylesheet): the supplier's
// .sp, the buyer's and the fund member's .rp (IA port part 2). Styles: src/pages/contacts.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Page, usePhone } from "../app/AppShell";
import { useInbox } from "../app/InboxPanel";
import { Banner, Button, TrustedSvg, useOut } from "../app/ui";
import { roleLabel, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { contactId, decodeContact, encodeContact, type Contact } from "../lib/contact";
import { wasm } from "../lib/core";
import { download } from "../lib/download";
import { readablePrint } from "../lib/print";
import { myContact } from "./MailboxCard";
import "./contacts.css";

const KANJI: Record<Contact["role"], string> = { supplier: "売", buyer: "買", member: "資", financier: "融" };

interface Kept extends Contact {
  /** When the fingerprint was compared with the person, out of band. */
  verified_at?: number;
}

const WHO: Record<Role, string> = {
  supplier: "Buyers send you their key and signatures; financiers send entry requests, letters and the advance notice.",
  buyer: "Suppliers send you invoices to sign; financiers send letters, reminders and history requests.",
  member: "The fund sends you receipts and the paths of your units.",
};

export function ContactsPage({ rootClass, counter }: { rootClass: string; counter: string }): ReactNode {
  const phone = usePhone();
  const s = account.current;
  const store = s?.store;
  const inbox = useInbox();
  const [all, setAll] = useState<Kept[] | null>(null);
  const [card, setCard] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = useRef<HTMLTextAreaElement>(null);
  const out = useOut();
  const cardOut = useOut();
  const draw = async () => {
    if (!store) return setAll([]);
    setAll((await store.list<Kept>()).filter((x) => x.id.startsWith("contact:")).map((x) => x.doc));
  };
  useEffect(() => {
    void draw();
    try {
      setCard(encodeContact(myContact()));
    } catch (e) {
      cardOut.error(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s) return null;
  const compared = all?.filter((c) => c.verified_at).length ?? 0;
  const mine = (() => {
    try {
      return myContact();
    } catch {
      return null;
    }
  })();
  const mailbox = inbox.role ? (inbox.mailbox === "ready" ? "ready" : inbox.mailbox === "unreachable" ? "not reachable" : "opening") : "on your page";
  return (
    <Page wide>
      <div className={`${rootClass} ia-ct`} data-wide="true">
        <div className="ia-ct-desk">
          <section className="ia-ct-cap" aria-labelledby="ct-h1">
            <p className="sp-tag">
              <b lang="ja">名</b>
              {counter}
              <i className="ia-dot" aria-hidden="true">
                ·
              </i>
              <span className="ia-sec">Contacts</span>
            </p>
            <h1 id="ct-h1">Contacts</h1>
            {/* a phone: the first screen says what to do; the rest is the 名刺 and the list below (DS-MOB P4) */}
            <p className="ia-ct-lede">{phone ? "Give your card to the people you deal with, and compare its fingerprint with them." : "Give your contact card to the people you deal with; compare the key fingerprint with them by phone or in person. Documents they send arrive sealed to you."}</p>
            <p className="ia-ct-who">{WHO[s.role]}</p>
            <dl className="ia-ct-nums">
              <div>
                <dt>contacts</dt>
                <dd>{all?.length ?? 0}</dd>
              </div>
              <div>
                <dt>fingerprints compared</dt>
                <dd>
                  {compared}
                  <small>{` / ${all?.length ?? 0}`}</small>
                </dd>
              </div>
              <div>
                <dt>mailbox</dt>
                <dd className="is-word">{mailbox}</dd>
              </div>
            </dl>
          </section>
          <section className="ia-ct-vis" aria-label="Your card and your contacts">
            <div className="ia-meishi-row">
              <div className="ia-meishi-stack">
                <article className="ia-meishi" aria-label="Your contact card (名刺)">
                  <p className="ia-meishi-k">
                    <b lang="ja">名刺</b>
                    <span>{`JitsuinFi · ${roleLabel(s.role)}`}</span>
                  </p>
                  <svg className="ia-meishi-seal" viewBox="0 0 96 96" aria-hidden="true">
                    <circle cx="48" cy="48" r="44" strokeWidth="4" />
                    <circle cx="48" cy="48" r="37" strokeWidth="1.5" />
                    <text x="48" y="64" textAnchor="middle">
                      {KANJI[s.role]}
                    </text>
                  </svg>
                  <div className="ia-meishi-main">
                    <small>Key fingerprint · compare it with them</small>
                    <strong>{s.fingerprint}</strong>
                    <span>{mine ? `mailbox ${readablePrint(mine.mailbox_pk)}` : ""}</span>
                  </div>
                  <code className="ia-meishi-code" title={card}>
                    {card}
                  </code>
                </article>
              </div>
              <div className="ia-meishi-acts">
                <h2>Your contact card</h2>
                <p>The card carries your mailbox and your key fingerprint, nothing else. Hand it over by hand, by message or as a QR across the table.</p>
                <div className="actions">
                  <Button
                    secondary
                    onClick={async () => {
                      await navigator.clipboard.writeText(card);
                      setCopied(true);
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button secondary onClick={() => download("contact-card.txt", card)}>
                    Download
                  </Button>
                  <Button
                    secondary
                    onClick={() => {
                      if (!qr && card) setQr(wasm.qrSvg(card));
                      setShowQr((o) => !o);
                    }}
                  >
                    {showQr ? "Hide the QR" : "Show as QR"}
                  </Button>
                </div>
                <div className="ia-qr" hidden={!showQr}>
                  {qr ? <TrustedSvg svg={qr} /> : null}
                </div>
                {cardOut.el}
              </div>
            </div>
            <div className="ia-ct-book">
              <div className="ia-ct-book-h">
                <h2>Your contacts</h2>
                <small>kept encrypted on this device</small>
              </div>
              {!store ? (
                <p className="ia-ct-none">This browser keeps nothing here, so contacts are not saved.</p>
              ) : all === null ? null : all.length ? (
                <ul className="ia-contacts">
                  {all.map((c) => (
                    <li key={contactId(c)}>
                      <span className="room-k" lang="ja" aria-hidden="true">
                        {KANJI[c.role]}
                      </span>
                      <strong>{`${c.username ? `@${c.username} · ` : ""}${c.role}`}</strong>
                      <code>{c.fingerprint}</code>
                      {c.verified_at ? (
                        <span className="ia-cmp">
                          <i lang="ja" aria-hidden="true">
                            照
                          </i>
                          {`compared ${new Date(c.verified_at).toLocaleDateString()}`}
                        </span>
                      ) : (
                        <Button
                          secondary
                          onClick={async () => {
                            await store.put(contactId(c), { ...c, verified_at: Date.now() });
                            await draw();
                          }}
                        >
                          I read this fingerprint with them
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ia-ct-none">{`No contact yet. Paste a card you were given below.${s.role === "supplier" ? " A buyer who sends you their key through the relay needs no card: their mailbox comes with the key." : ""}`}</p>
              )}
              <div className="ia-ct-add">
                <label className="field">
                  <span>A counterparty's contact card</span>
                  <textarea rows={2} spellCheck="false" placeholder="jitsuin-contact-v1:…" ref={code} />
                  <small>Compare each fingerprint with the person, by phone or in person, before you send them a document.</small>
                </label>
                <div className="actions">
                  <Button
                    secondary
                    onClick={async () => {
                      try {
                        const c = decodeContact(code.current!.value);
                        await account.current?.store?.put(contactId(c), c);
                        code.current!.value = "";
                        out.show(<Banner kind="warn" title={`Fingerprint ${c.fingerprint}`} text="Read it with them now; mark it compared only if it matches what they see on their screen." />);
                        await draw();
                      } catch (e) {
                        out.error(e);
                      }
                    }}
                  >
                    Keep this contact
                  </Button>
                </div>
                {out.el}
              </div>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}
