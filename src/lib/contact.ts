// Contact card (HNK-22.T5 core, BL-D21-11): what a party hands to a counterparty so they can
// reach its mailbox. `jitsuin-contact-v1:` ‖ base64url(JSON). It carries the mailbox key and the
// role key fingerprint, which the counterparty compares out of band (a call, in person). Pure
// data, no wasm: tests run it under Node.
import type { Role } from "./account.ts";

export const CONTACT_PREFIX = "jitsuin-contact-v1:";

export interface Contact {
  v: 1;
  role: Role | "financier";
  /** Shown to the counterparty; not checked by anyone. */
  username?: string;
  mailbox_pk: string;
  /** Role key fingerprint (account.ts `fingerprint`), compared out of band. */
  fingerprint: string;
}

const ROLES = ["supplier", "buyer", "member", "financier"];
const HEX32 = /^[0-9a-f]{64}$/;

function b64urlEncode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function contactProblems(c: unknown): string[] {
  const p: string[] = [];
  if (typeof c !== "object" || c === null) return ["not a contact card"];
  const x = c as Record<string, unknown>;
  if (x.v !== 1) p.push("unsupported contact card version");
  if (!ROLES.includes(x.role as string)) p.push("unknown role");
  if (typeof x.mailbox_pk !== "string" || !HEX32.test(x.mailbox_pk)) p.push("mailbox_pk must be 64 hex characters");
  if (typeof x.fingerprint !== "string" || x.fingerprint.length < 4 || x.fingerprint.length > 64) p.push("missing key fingerprint");
  if (x.username !== undefined && (typeof x.username !== "string" || x.username.length > 32)) p.push("username too long");
  for (const k of Object.keys(x)) if (!["v", "role", "username", "mailbox_pk", "fingerprint"].includes(k)) p.push(`unknown field "${k}"`);
  return p;
}

export function encodeContact(c: Contact): string {
  const p = contactProblems(c);
  if (p.length) throw new Error(p.join("; "));
  return CONTACT_PREFIX + b64urlEncode(JSON.stringify(c));
}

export function decodeContact(code: string): Contact {
  const t = code.trim();
  if (!t.startsWith(CONTACT_PREFIX)) throw new Error(`a contact card starts with ${CONTACT_PREFIX}`);
  let c: unknown;
  try {
    c = JSON.parse(b64urlDecode(t.slice(CONTACT_PREFIX.length)));
  } catch {
    throw new Error("this contact card is damaged");
  }
  const p = contactProblems(c);
  if (p.length) throw new Error(`this contact card is not valid: ${p.join("; ")}`);
  return c as Contact;
}

/** Store id of a saved contact (encrypted deal store), by its mailbox key. */
export function contactId(c: Contact): string {
  return `contact:${c.mailbox_pk}`;
}

// ---------- the contact link (judge run 2, finding 5) ----------
// A first contact needs no pasting: "Share my contact" makes a link to this app's /app/contact
// with the card in the fragment (after #), so the card never reaches a server: browsers do not
// send the fragment, and the page reads it in the browser. The same link is drawn as a QR. The
// card inside is checked as a pasted one is; its fingerprint is still compared with the person.

export const CONTACT_PATH = "/app/contact";

/** The link that adds `c` to whoever opens it in the app. */
export function contactLink(origin: string, c: Contact): string {
  return `${origin.replace(/\/+$/, "")}${CONTACT_PATH}#${encodeContact(c)}`;
}

/**
 * A contact from what a person pasted or opened: a contact link (from this app, any host), a
 * link's fragment, or the card itself. Throws a plain sentence when it is none of them.
 */
export function readContact(text: string): Contact {
  let t = text.trim();
  if (!t) throw new Error("Paste the contact card or link they sent you.");
  const hash = t.indexOf("#");
  if (hash >= 0) t = t.slice(hash + 1);
  try {
    t = decodeURIComponent(t);
  } catch {
    /* not percent-encoded */
  }
  t = t.trim();
  if (!t.startsWith(CONTACT_PREFIX)) throw new Error("This is not a JitsuinFi contact card or link. Ask them to share their contact card again.");
  return decodeContact(t);
}

/** How a contact is named on screen: @name, else its fingerprint. */
export function contactName(c: Pick<Contact, "username" | "fingerprint">): string {
  return c.username ? `@${c.username}` : c.fingerprint;
}

// ---------- the buyer's card from its key letter (judge run 3, finding 2) ----------
// A buyer who added the supplier from a contact link sends its next invoice key at once
// (`key.invoice_pk`). That letter is signed by the invoice key, and the signed part names the
// buyer's mailbox and, since this change, its role key fingerprint and @name. The supplier's app
// reads the card from a letter it already accepted (signature checked, key signed by itself) and
// offers "Add @name to your contacts" with one confirm, as a contact link does: the fingerprint
// is still compared with the buyer out of band. A letter without a fingerprint offers nothing.

/** The fields of a key letter's header that make the card. */
export interface KeyLetterFrom {
  from: { role: string; mailbox_pk: string };
  body: Record<string, unknown>;
}

/** The buyer's contact card a key letter carries, or null when it carries none that holds. */
export function cardFromKeyLetter(h: KeyLetterFrom): Contact | null {
  if (h.from.role !== "buyer") return null;
  const { fingerprint, username } = h.body;
  if (typeof fingerprint !== "string") return null;
  const c: Contact = { v: 1, role: "buyer", ...(typeof username === "string" && username ? { username } : {}), mailbox_pk: h.from.mailbox_pk, fingerprint };
  return contactProblems(c).length ? null : c;
}

/**
 * `c` with the name the person gave them on the confirm (a card without an @name). A leading @
 * and spaces at the ends are dropped; an empty name keeps the card as it is.
 */
export function namedContact(c: Contact, name: string): Contact {
  if (c.username) return c;
  const n = name.trim().replace(/^@+/, "").trim();
  if (!n) return c;
  if (n.length > 32) throw new Error("a name is at most 32 characters");
  return { ...c, username: n };
}
