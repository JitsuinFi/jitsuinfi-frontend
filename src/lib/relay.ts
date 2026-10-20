// The app's relay client (HNK-23.T7, P-04): registers this role's mailbox, sends sealed relay
// messages to a counterparty's mailbox, and reads its own. The relay sees only sealed bytes; the
// mailbox key comes from the session's inbox PRF output (never stored), sealing and opening run in
// jitsuin-wasm, and messages are checked here with relay-message.ts.
//
// The relay is reached as /api/* on the app's own origin (Vercel rewrite in production, Vite proxy
// in development), so the CSP stays connect-src 'self'.
import { decodeMessage, headerProblems, signingBytes, verifyHeader, type Header, type Message } from "./relay-message.ts";

export interface MailboxWasm {
  mailboxKeysBytes(prf: Uint8Array): string;
  mailboxProofBytes(prf: Uint8Array, purpose: string, ephPk: string, nonce: string): string;
  mailboxOpenBytes(prf: Uint8Array, sealed: Uint8Array): Uint8Array;
  mailboxSeal(recipientPk: string, eph: Uint8Array, message: Uint8Array): Uint8Array;
  mailboxId(pk: string): string;
  messageSignBytes(secret: Uint8Array, signingBytes: Uint8Array): string;
}

export interface RelayDeps {
  wasm: MailboxWasm;
  fetch?: typeof fetch;
  random?: (n: number) => Uint8Array;
  base?: string;
}

export interface MailboxIdentity {
  mailbox_pk: string;
  mailbox_id: string;
}

export interface Received {
  /** The relay's id, to remove it after use. */
  relayId: string;
  receivedAt: string;
  message: Message;
  /** The header signature holds (or the type needs none); the expected signer is checked by the screen. */
  signatureOk: boolean;
}

export class RelayError extends Error {}

const fetchOf = (d: RelayDeps) => d.fetch ?? globalThis.fetch.bind(globalThis);
const rnd = (d: RelayDeps, n: number) => (d.random ? d.random(n) : globalThis.crypto.getRandomValues(new Uint8Array(n)));

async function call(d: RelayDeps, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetchOf(d)((d.base ?? "") + path, {
      method,
      headers: body instanceof Uint8Array ? { "Content-Type": "application/octet-stream", ...headers } : body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RelayError("the relay cannot be reached; check your connection and try again");
  }
  if (!r.ok) {
    let msg = `the relay answered ${r.status}`;
    try {
      const j = (await r.json()) as { error?: string };
      if (j.error) msg = `relay: ${j.error}`;
    } catch {
      /* not JSON */
    }
    throw new RelayError(msg);
  }
  return r;
}

/** This role's mailbox key and id; the inbox output is copied, the copy wiped by wasm. */
export function identity(inbox: Uint8Array, d: RelayDeps): MailboxIdentity {
  return JSON.parse(d.wasm.mailboxKeysBytes(inbox.slice())) as MailboxIdentity;
}

async function proven(inbox: Uint8Array, d: RelayDeps, me: MailboxIdentity, purpose: "register" | "read") {
  const ch = (await (await call(d, "POST", "/api/mailbox/challenge", { mailbox_pk: me.mailbox_pk, purpose })).json()) as { challenge_id: string; eph_pk: string; nonce: string };
  return { challenge_id: ch.challenge_id, proof: d.wasm.mailboxProofBytes(inbox.slice(), purpose, ch.eph_pk, ch.nonce) };
}

/** Registers this role's mailbox at the relay (harmless when it exists). */
export async function ensureMailbox(inbox: Uint8Array, d: RelayDeps): Promise<MailboxIdentity> {
  const me = identity(inbox, d);
  const r = (await (await call(d, "POST", "/api/mailbox", { mailbox_pk: me.mailbox_pk, ...(await proven(inbox, d, me, "register")) })).json()) as { mailbox_id: string };
  if (r.mailbox_id !== me.mailbox_id) throw new RelayError("the relay computed another mailbox id; do not use it");
  return me;
}

/** Seals `plaintext` (an encoded relay message) to `toPk` and drops it in that mailbox. */
export async function send(toPk: string, plaintext: Uint8Array, d: RelayDeps): Promise<string> {
  const sealed = d.wasm.mailboxSeal(toPk, rnd(d, 32), plaintext);
  const r = (await (await call(d, "POST", `/api/mailbox/${d.wasm.mailboxId(toPk)}/messages`, sealed)).json()) as { message_id: string };
  return r.message_id;
}

async function token(inbox: Uint8Array, d: RelayDeps, me: MailboxIdentity): Promise<string> {
  const r = (await (await call(d, "POST", `/api/mailbox/${me.mailbox_id}/read`, await proven(inbox, d, me, "read"))).json()) as { token: string };
  return r.token;
}

/**
 * Every message in this role's mailbox, opened and checked. A message that does not open, is
 * malformed or is addressed to another mailbox is skipped and counted in `refused`.
 */
export async function receive(inbox: Uint8Array, d: RelayDeps): Promise<{ messages: Received[]; refused: number; token: string; me: MailboxIdentity }> {
  const me = identity(inbox, d);
  const t = await token(inbox, d, me);
  const auth = { Authorization: `Bearer ${t}` };
  const list = ((await (await call(d, "GET", `/api/mailbox/${me.mailbox_id}/messages`, undefined, auth)).json()) as { messages: Array<{ id: string; received_at: string }> }).messages;
  const messages: Received[] = [];
  let refused = 0;
  for (const m of list) {
    const sealed = new Uint8Array(await (await call(d, "GET", `/api/mailbox/${me.mailbox_id}/messages/${m.id}`, undefined, auth)).arrayBuffer());
    try {
      const message = await decodeMessage(d.wasm.mailboxOpenBytes(inbox.slice(), sealed), me.mailbox_id);
      messages.push({ relayId: m.id, receivedAt: m.received_at, message, signatureOk: await verifyHeader(message.header) });
    } catch {
      refused++;
    }
  }
  return { messages, refused, token: t, me };
}

/** Removes a message after it was used. */
export async function remove(me: MailboxIdentity, relayId: string, readToken: string, d: RelayDeps): Promise<void> {
  await call(d, "DELETE", `/api/mailbox/${me.mailbox_id}/messages/${relayId}`, undefined, { Authorization: `Bearer ${readToken}` });
}

/** Removes a message with a fresh read token (when the token from `receive` is gone). */
export async function discard(inbox: Uint8Array, relayId: string, d: RelayDeps): Promise<void> {
  const me = identity(inbox, d);
  await remove(me, relayId, await token(inbox, d, me), d);
}

/** A header ready to sign: the common fields of a message from this role to `toPk`. */
export function draft(type: Header["type"], from: { role: Header["from"]["role"]; mailbox_pk: string }, toPk: string, d: RelayDeps, extra: Pick<Header, "body"> & Partial<Pick<Header, "n" | "attachments">>): Omit<Header, "sig" | "signer"> {
  const h = {
    v: 1 as const,
    id: Array.from(rnd(d, 16), (b) => b.toString(16).padStart(2, "0")).join(""),
    type,
    to: d.wasm.mailboxId(toPk),
    from,
    sent_at: Math.floor(Date.now() / 1000),
    ...(extra.n ? { n: extra.n } : {}),
    body: extra.body,
    attachments: extra.attachments ?? [],
  };
  return h;
}

/**
 * Signs a header with a party key inside wasm (the supplier's per-invoice key): the key never
 * becomes a JS CryptoKey or string. `secret` is wiped by wasm.
 */
export function signInWasm(h: Omit<Header, "sig" | "signer">, publicKeyHex: string, secret: Uint8Array, d: RelayDeps): Header {
  const withSigner = { ...h, signer: publicKeyHex } as Header;
  const r = JSON.parse(d.wasm.messageSignBytes(secret, signingBytes(withSigner))) as { signer: string; sig: string };
  if (r.signer !== publicKeyHex) throw new Error("this key is not the expected signer");
  return { ...withSigner, sig: r.sig };
}

export { headerProblems };
