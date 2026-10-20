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
