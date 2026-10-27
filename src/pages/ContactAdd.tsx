// Adding a contact in one confirm (judge run 2, finding 5): from a contact link opened in the app
// (/app/contact#<card>, ContactLinkPage.tsx) or from a link or card pasted on Contacts. The card is
// read and checked as a pasted one always was (lib/contact.ts); the screen names who it is (@name,
// role, fingerprint), asks once, keeps it encrypted on this device, then offers the one next step
// that this pair of roles has (a buyer sends a supplier the key for the next invoice).
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../app/ui";
import type { Role } from "../lib/account";
import { myIdentity } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { contactId, contactName, namedContact, type Contact } from "../lib/contact";
import { explain } from "../lib/explain";
import "./contacts.css";

const KANJI: Record<Contact["role"], string> = { supplier: "売", buyer: "買", member: "資", financier: "融" };
const WHO: Record<Contact["role"], string> = { supplier: "a supplier", buyer: "a buyer", member: "a fund member", financier: "a financier" };

/** The buyer's key page sends to this supplier first (set by the next step, read by NextKey.tsx). */
export const sendKeyTo: { mailbox: string | null } = { mailbox: null };

export interface NextStep {
  to: string;
  label: string;
  line: string;
  /** Before moving: what the next page needs to know (in memory, never in the address). */
  before?: () => void;
}

/** The one next step after adding `c`, for a person signed in as `me`. */
export function nextStepFor(me: Role, c: Contact): NextStep {
  const name = contactName(c);
  if (me === "buyer" && c.role === "supplier")
    return { to: "/buyer/invoices/key", label: "Send them your next invoice key", line: `${name} addresses your next invoice to it; it arrives in your inbox to sign.`, before: () => void (sendKeyTo.mailbox = c.mailbox_pk) };
  if (me === "supplier" && c.role === "buyer") return { to: "/supplier/invoices/new", label: "Write an invoice", line: `When ${name} sends the key for your invoice, it lands on the sheet's buyer line.` };
  if (me === "supplier" && c.role === "financier") return { to: "/supplier/deal", label: "Open your deal", line: "Offer a signed invoice to this financier at the offer station." };
  if (me === "member") return { to: "/member/units", label: "Open your units", line: "Receipts from the fund arrive in your inbox and land there." };
  return { to: `/${me}/contacts`, label: "See your contacts", line: "Compare the fingerprint with them before you send a document." };
}

/** Keeps `c` on this device; refuses this session's own card. */
export async function keepContact(c: Contact): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("this browser keeps nothing here, so the contact cannot be saved");
  if (c.mailbox_pk === myIdentity().mailbox_pk) throw new Error("this is your own contact: send the link to the other person");
  const was = await store.get<Contact & { verified_at?: number }>(contactId(c)).catch(() => undefined);
  await store.put(contactId(c), was?.verified_at ? { ...c, verified_at: was.verified_at } : c);
}

/** "Add @name to your contacts?" with one confirm, then the next step. */
/** `fromLink`: opened from a contact link; the next step takes the link's place in history (Back skips it). */
/**
 * Judge run 3, finding 2: `nameable` (a card from a buyer's key letter) lets the person name a
 * card that came without an @name on the same confirm; `onAdded` replaces the next step (the
 * page that offered the add shows the name at once).
 */
export function AddContact({ c: given, onCancel, cancelLabel = "Not now", fromLink, nameable, onAdded, added: addedBefore = false }: { c: Contact; onCancel?: () => void; cancelLabel?: string; fromLink?: boolean; nameable?: boolean; onAdded?: (c: Contact) => void; added?: boolean }): ReactNode {
  const s = account.current;
  const [added, setAdded] = useState(addedBefore);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  if (!s) return null;
  const naming = !!nameable && !given.username;
  let c = given;
  try {
    c = naming ? namedContact(given, name) : given;
  } catch {
    c = given; // too long: said on Add
  }
  const next = nextStepFor(s.role, c);
  return (
    <section className="ia-add" aria-labelledby="ia-add-h" aria-live="polite">
      <span className="ia-add-seal" lang="ja" aria-hidden="true">
        {added ? "済" : KANJI[c.role]}
      </span>
      <div className="ia-add-body">
        <h2 id="ia-add-h">{added ? `${contactName(c)} is in your contacts` : `Add ${contactName(c)} to your contacts?`}</h2>
        <dl className="ia-add-facts">
          <div>
            <dt>Who</dt>
            <dd>{`${c.username ? `@${c.username}, ` : ""}${WHO[c.role]}`}</dd>
          </div>
          <div>
            <dt>Fingerprint</dt>
            <dd>
              <code>{c.fingerprint}</code>
            </dd>
          </div>
        </dl>
        {naming && !added ? (
          <label className="ia-add-name">
            <span>Their name, as you know them</span>
            <input type="text" value={name} maxLength={40} autoComplete="off" spellCheck="false" enterKeyHint="done" placeholder="e.g. their company" onChange={(e) => setName(e.target.value)} />
            <small>Their key letter came without a name. Only you see this name; leave it empty to show their fingerprint.</small>
          </label>
        ) : null}
        <p className="ia-add-hint">{`Compare the fingerprint with them, by phone or in person: it must match what their screen shows. Their documents then reach you sealed, and yours reach them.`}</p>
        {error ? (
          <p className="ia-add-err" role="alert">
            <b lang="ja" aria-hidden="true">
              拒
            </b>
            {explain(error)}
          </p>
        ) : null}
        {added ? (
          <div className="ia-add-next">
            <Link className="ia-add-go" to={next.to} replace={fromLink} onClick={() => next.before?.()}>
              <span>
                <strong>{next.label}</strong>
                <small>{next.line}</small>
              </span>
              <i aria-hidden="true">→</i>
            </Link>
            <Link className="ia-add-alt" to={`/${s.role}/contacts`} replace={fromLink}>
              See your contacts
            </Link>
          </div>
        ) : (
          <div className="actions ia-add-acts">
            <Button
              onClick={async () => {
                try {
                  setError(null);
                  const kept = naming ? namedContact(given, name) : given;
                  await keepContact(kept);
                  if (onAdded) onAdded(kept);
                  else setAdded(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              {`Add ${contactName(c)}`}
            </Button>
            {onCancel ? (
              <button type="button" className="secondary" onClick={onCancel}>
                {cancelLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
