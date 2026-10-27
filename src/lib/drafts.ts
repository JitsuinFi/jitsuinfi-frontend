// Reload-safe forms (finding F10): a screen's draft (lib/kept.ts) is also kept in this tab's
// sessionStorage, sealed, so a reload, or the 15 minute lock, does not lose what was being
// written. After the reload the person signs in again; the drafts of that account and role open
// and the forms fill again. They go when the form's action succeeds, when the person starts over,
// when they sign out, and when the tab closes (sessionStorage).
//
// Sealed with AES-256-GCM under HMAC-SHA-256(inbox PRF output, "jitsuin/<role>/drafts/v1"), a
// non-extractable key that exists only while that account is signed in, with the screen as
// associated data, so nothing typed sits in plaintext in storage and a draft cannot be moved to
// another screen. A chosen File cannot survive a reload: only its name, size and SHA-256 are kept,
// and the form asks for the file again. Values that are not JSON (a File, a Blob) are left out.
//
// Item: "jitsuin.draft.v1:<owner tag>:<screen>" → base64( iv (12) | ciphertext ), where the owner
// tag is the first 16 hex of SHA-256(role + ":" + key fingerprint). Pure WebCrypto with the
// storage passed in: tests run it under Node.
import type { Draft } from "./kept.ts";
import type { Role } from "./store.ts";

export const DRAFT_PREFIX = "jitsuin.draft.v1:";

/** The part of Storage this uses (sessionStorage in the app, a Map in tests). */
export interface DraftStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

/** A chosen file as a draft keeps it: what to ask for again after a reload. */
export interface FileMeta {
  name: string;
  bytes: number;
  sha256: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const hexOf = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The drafts key of a session: from a copy of its inbox output (the caller's bytes are not changed). */
export async function draftKey(inbox: Uint8Array, role: Role): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const raw = new Uint8Array(inbox);
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    const h = await subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    bytes = new Uint8Array(await subtle.sign("HMAC", h, enc.encode(`jitsuin/${role}/drafts/v1`)));
    return await subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
    bytes?.fill(0);
  }
}

/** The owner tag of `owner` ("<role>:<fingerprint>", as lib/kept.ts scopes are named). */
export async function ownerTag(owner: string): Promise<string> {
  return hexOf(await globalThis.crypto.subtle.digest("SHA-256", enc.encode(owner))).slice(0, 16);
}

/** The part of a draft that can be written down: JSON values only (no File, no Blob). */
export function writable(d: Draft): Draft {
  const out: Draft = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || (typeof Blob !== "undefined" && v instanceof Blob)) continue;
    try {
      JSON.stringify(v);
      out[k] = v;
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/** Writes (or, when empty, removes) the draft of `screen`. */
export async function saveDraft(storage: DraftStorage, key: CryptoKey, tag: string, screen: string, draft: Draft): Promise<void> {
  const item = `${DRAFT_PREFIX}${tag}:${screen}`;
  const d = writable(draft);
  if (!Object.keys(d).length) {
    storage.removeItem(item);
    return;
  }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(screen) }, key, enc.encode(JSON.stringify(d))));
  const all = new Uint8Array(12 + ct.length);
  all.set(iv);
  all.set(ct, 12);
  storage.setItem(item, b64(all));
}

/** Every draft of this owner tag that opens with `key`, by screen; one that does not is dropped. */
export async function loadDrafts(storage: DraftStorage, key: CryptoKey, tag: string): Promise<Map<string, Draft>> {
  const head = `${DRAFT_PREFIX}${tag}:`;
  const out = new Map<string, Draft>();
  const items: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(head)) items.push(k);
  }
  for (const item of items) {
    const screen = item.slice(head.length);
    try {
      const all = unb64(storage.getItem(item) ?? "");
      const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: enc.encode(screen) }, key, all.slice(12));
      out.set(screen, JSON.parse(dec.decode(plain)) as Draft);
    } catch {
      storage.removeItem(item); // another key's, or altered
    }
  }
  return out;
}

/** Removes every draft of this owner tag (on sign-out). */
export function dropDrafts(storage: DraftStorage, tag: string): void {
  const head = `${DRAFT_PREFIX}${tag}:`;
  const items: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(head)) items.push(k);
  }
  items.forEach((k) => storage.removeItem(k));
}

/** A chosen file's name, size and SHA-256. */
export async function fileMeta(f: Blob & { name: string }): Promise<FileMeta> {
  return { name: f.name, bytes: f.size, sha256: hexOf(await globalThis.crypto.subtle.digest("SHA-256", await f.arrayBuffer())) };
}
