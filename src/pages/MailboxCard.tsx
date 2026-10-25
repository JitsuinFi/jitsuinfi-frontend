// "Mailbox" part of a role screen (HNK-23.T7, HNK-22.T5 core, HNK-22.T6 core): this role's
// contact card, and the inbox of relay messages, each offered as an action of the screen that
// owns it. The relay only ever sees sealed bytes; opening and checking happen here.
// React since HNK-31.T8.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Actions, Banner, Button, Card, CodeBlock, TrustedSvg, useOut } from "../app/ui";
import { myIdentity, myMailbox, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { contactId, decodeContact, encodeContact, type Contact } from "../lib/contact";
import { wasm } from "../lib/core";
import { receive, remove, type Received } from "../lib/relay";
import type { MessageType } from "../lib/relay-message";

export interface InboxAction {
  label: string;
  /** Uses the message; returns what happened. Throwing keeps the message in the mailbox. */
  run: (r: Received) => Promise<string>;
  /** Leave the message in the mailbox after `run` (the screen removes it when it is done). */
  keep?: boolean;
  /** What accepting means, shown before the button is pressed (HNK-25.T2, BL-D26-02). */
  describe?: (r: Received) => Promise<string | null>;
}

const TYPE_LABEL: Partial<Record<MessageType, string>> = {
  "invoice.sign_request": "Invoice to sign",
  "invoice.signature": "Buyer's signature",
  "key.invoice_pk": "Buyer's invoice key",
  "deal.decline": "Offer declined",
  "deal.commitment_opening": "Entry request",
  "deal.letter": "Assignment letter",
  "deal.seal": "Seal on the letter",
  "deal.advance": "Advance paid",
  "deal.bundle": "Settlement bundle",
  "history.request": "History request",
};

/** This session's contact card, to hand to a counterparty. */
export function myContact(): Contact {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  return { v: 1, role: s.role, mailbox_pk: myIdentity().mailbox_pk, fingerprint: s.fingerprint };
}

/** Reads a pasted contact card, refuses one of the wrong role, and keeps it on this device. */
export async function takeContact(code: string, role: Contact["role"]): Promise<Contact> {
  const c = decodeContact(code);
  if (c.role !== role) throw new Error(`this is a ${c.role}'s contact card; ask the ${role} for theirs`);
  await account.current?.store?.put(contactId(c), c);
  return c;
}

type Got = Awaited<ReturnType<typeof receive>>;

// HNK-34 E2E (finding 7): the relay ids this tab acted on. An action redraws the screen, and the
// new mailbox part reads the inbox at once, while the used message is still being removed: it
// listed the message and then asked for it after the removal, a 404 in the console. Skipped here.
const used = new Set<string>();

/** One message of the inbox: what it is, who sent it, and the screen's action for it. */
function Message({ r, action, got }: { r: Received; action: InboxAction | undefined; got: Got }): ReactNode {
  const out = useOut();
  const [about, setAbout] = useState("");
  const t = r.message.header.type;
  useEffect(() => {
    if (action?.describe && r.signatureOk) void action.describe(r).then((x) => setAbout(x ?? ""), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="deal" data-type={t} data-sig={r.signatureOk ? "ok" : "bad"} data-act={action ? "yes" : "no"}>
      <div className="deal-head">
        <strong>{TYPE_LABEL[t] ?? t}</strong>
        <span>{`from a ${r.message.header.from.role} · ${new Date(r.receivedAt).toLocaleString()}`}</span>
        {action && r.signatureOk ? (
          <Button
            onClick={async () => {
              if (!action.keep) used.add(r.relayId);
              try {
                const done = await action.run(r);
                if (!action.keep) await remove(got.me, r.relayId, got.token, relayDeps);
                out.show(<Banner kind="ok" title="Done" text={done} />);
              } catch (e) {
                used.delete(r.relayId); // still in the mailbox: it shows again
                out.error(e);
              }
            }}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
      {!r.signatureOk ? <Banner kind="bad" title="Signature does not hold" text="This message was changed or forged. It is ignored." /> : !action ? <small>This screen has nothing to do with this message.</small> : null}
      <small className="deal-about">{about}</small>
      {out.el}
    </div>
  );
}

export function MailboxCard({ handlers }: { handlers: Partial<Record<MessageType, InboxAction>> }): ReactNode {
  const status = useOut();
  const inbox = useOut();
  const [contact, setContact] = useState("");
  const shown = useRef<string | null>(null); // the relay ids last drawn
  const live = useRef(true);

  const check = async (auto = false) => {
    try {
      await myMailbox();
      const s = account.current;
      if (!s) throw new Error("sign in first");
      const got = await receive(s.inbox, relayDeps, used);
      const ids = got.messages.map((m) => m.relayId).join(",") + `|${got.refused}`;
      if (auto && ids === shown.current) return;
      shown.current = ids;
      if (!live.current) return;
      inbox.show(
        <>
          {got.refused ? <Banner kind="warn" title={`${got.refused} message${got.refused > 1 ? "s" : ""} could not be opened`} text="Not sealed to your mailbox or not a JitsuinFi message; ignored." /> : null}
          {got.messages.length ? (
            <div className="deals" data-count={got.messages.length}>
              {got.messages.map((r) => (
                <Message key={r.relayId} r={r} action={handlers[r.message.header.type]} got={got} />
              ))}
            </div>
          ) : (
            <p className="hint">Nothing new.</p>
          )}
        </>,
      );
    } catch (e) {
      if (!auto && live.current) inbox.error(e);
    }
  };

  useEffect(() => {
    live.current = true;
    try {
      setContact(encodeContact(myContact()));
    } catch (e) {
      status.error(e);
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    myMailbox().then(
      () => {
        if (!live.current) return;
        status.show(<Banner kind="ok" title="Mailbox ready" text="Counterparties with your contact card can send you documents. Only you can open them." />);
        // HNK-22.T6 (BL-S00-02): the inbox opens on its own after sign-in, then every minute while
        // this screen is open and visible; a new message redraws the list, the same list does not
        void check(true);
        timer = setInterval(() => {
          if (document.visibilityState === "visible") void check(true);
        }, 60_000);
      },
      (e) => live.current && status.show(<Banner kind="warn" title="Mailbox not reachable" text={`${e instanceof Error ? e.message : String(e)}. Your documents stay on this device; try again later.`} />),
    );
    return () => {
      live.current = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card step="Mailbox" title="Contact card and inbox" hint="Give your contact card to the people you deal with; compare the key fingerprint with them by phone or in person. Documents they send arrive sealed to you.">
      {status.el}
      {/* HNK-34.T5: the contact card and the contacts fold away under one line (名刺); open by default */}
      <details className="mb-card" open>
        <summary>
          <b lang="ja">名刺</b> Contact card and contacts
        </summary>
        {contact ? <CodeBlock label="Your contact card" value={contact} filename="contact-card.txt" /> : null}
        {contact ? <QrToggle code={contact} /> : null}
        <ContactsBook />
      </details>
      <Actions>
        <Button secondary onClick={() => check()}>
          Check inbox
        </Button>
      </Actions>
      {inbox.el}
    </Card>
  );
}

/** HNK-22.T5: the contact card as a QR, for a phone across the table. */
function QrToggle({ code }: { code: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  return (
    <div>
      <Actions>
        <Button
          secondary
          onClick={() => {
            if (!svg) setSvg(wasm.qrSvg(code));
            setOpen((o) => !o);
          }}
        >
          {open ? "Hide the QR" : "Show as QR"}
        </Button>
      </Actions>
      <div className="contact-qr" hidden={!open}>
        {svg ? <TrustedSvg svg={svg} /> : null}
      </div>
    </div>
  );
}

interface Kept extends Contact {
  /** When the fingerprint was compared with the person, out of band. */
  verified_at?: number;
}

/**
 * HNK-22.T5: the people this role deals with, kept encrypted on this device. A card counts as
 * compared only after you read its fingerprint with the person by phone or in person: the relay
 * cannot vouch for whose card it is.
 */
function ContactsBook(): ReactNode {
  const [all, setAll] = useState<Kept[] | null>(null);
  const code = useRef<HTMLTextAreaElement>(null);
  const out = useOut();
  const store = account.current?.store;
  const draw = async () => {
    if (!store) return;
    setAll((await store.list<Kept>()).filter((x) => x.id.startsWith("contact:")).map((x) => x.doc));
  };
  useEffect(() => {
    void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="contacts">
      <p className="hint">Your contacts. Compare each fingerprint with the person, by phone or in person, before you send them a document.</p>
      <div className="deals">
        {!store ? (
          <p className="hint">This browser keeps nothing here, so contacts are not saved.</p>
        ) : all === null ? null : all.length ? (
          all.map((c) => (
            <div className="deal" key={contactId(c)}>
              <div className="deal-head">
                <strong>{`${c.username ? `@${c.username} · ` : ""}${c.role}`}</strong>
                <span className="is-mono">{c.fingerprint}</span>
                {c.verified_at ? (
                  <small>{`compared ${new Date(c.verified_at).toLocaleDateString()}`}</small>
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
              </div>
            </div>
          ))
        ) : (
          <p className="hint">No contact yet. Paste a card you were given.</p>
        )}
      </div>
      <textarea rows={2} spellCheck="false" placeholder="jitsuin-contact-v1:…" aria-label="A counterparty's contact card" ref={code} />
      <Actions>
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
      </Actions>
      {out.el}
    </div>
  );
}
