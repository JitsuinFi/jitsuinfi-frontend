// Account = one passkey per person (HNK-22, P-01, P-02; SEQ-00): roles, PRF salts, the
// non-secret local profile, the WebAuthn relying party id and the key fingerprint.
// Pure data and WebCrypto, no wasm and no DOM: tests run it under Node (`npm test`).

export type Role = "supplier" | "buyer" | "member";

export const ROLES: ReadonlyArray<{ role: Role; label: string; signs: boolean }> = [
  { role: "supplier", label: "Supplier", signs: true },
  { role: "buyer", label: "Buyer", signs: true },
  // A fund member holds no signing key, only an inbox key (BL-D21-06).
  { role: "member", label: "Fund member", signs: false },
];

export function roleLabel(role: Role): string {
  return ROLES.find((r) => r.role === role)!.label;
}

export function signs(role: Role): boolean {
  return ROLES.find((r) => r.role === role)!.signs;
}

export function isRole(x: unknown): x is Role {
  return ROLES.some((r) => r.role === x);
}

const enc = new TextEncoder();

async function sha256(text: string): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.digest("SHA-256", enc.encode(text));
}

/** PRF `first`: the role master. The buyer keeps `jitsuin/buyer/master/v1`, so old buyer keys stay. */
export function masterSalt(role: Role): Promise<ArrayBuffer> {
  return sha256(`jitsuin/${role}/master/v1`);
}

/** PRF `second`: the role's inbox key seed (X25519 mailbox key, HNK-23.T2). */
export function inboxSalt(role: Role): Promise<ArrayBuffer> {
  return sha256(`jitsuin/${role}/inbox/v1`);
}

// ---------- relying party id (BL-D21-18) ----------

/**
 * The production site. Passkeys are bound to it explicitly; preview deployments and localhost get
 * their own passkeys and keys (vercel.app is on the Public Suffix List, so they cannot share one).
 */
export const PRODUCTION_RP_ID = "jitsuinfi.vercel.app";

export function rpIdFor(hostname: string): string {
  return hostname === PRODUCTION_RP_ID ? PRODUCTION_RP_ID : hostname;
}

/** True when keys made here are not the production keys (preview, localhost). */
export function isNonProductionHost(hostname: string): boolean {
  return rpIdFor(hostname) !== PRODUCTION_RP_ID;
}

// ---------- local profile (BL-D21-03) ----------

/**
 * Non-secret: which credential and which roles this browser has used, and the account details
 * typed at sign-up (`label` is the username, also the passkey's name). Allowed to vanish. Until
 * the account server exists (relay HNK-23, D-34) this is the only place the email is kept.
 */
export interface Profile {
  v: 1;
  credentials: Array<{ id: string; roles: Role[]; label: string; created_at: number; email?: string }>;
}

export const PROFILE_KEY = "jitsuinfi-profile";

/** The subset of `Storage` the profile needs; `localStorage` in the browser. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyProfile(): Profile {
  return { v: 1, credentials: [] };
}

/** Reads the profile; an empty, blocked or damaged storage gives an empty profile. */
export function readProfile(kv: KeyValue | null): Profile {
  try {
    const raw = kv?.getItem(PROFILE_KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw) as Partial<Profile>;
    if (p.v !== 1 || !Array.isArray(p.credentials)) return emptyProfile();
    const credentials = p.credentials
      .filter((c) => c && typeof c.id === "string" && c.id.length > 0)
      .map((c) => ({
        id: c.id,
        roles: Array.isArray(c.roles) ? c.roles.filter(isRole) : [],
        label: typeof c.label === "string" ? c.label : "JitsuinFi",
        created_at: Number(c.created_at) || 0,
        ...(typeof c.email === "string" && c.email ? { email: c.email } : {}),
      }));
    return { v: 1, credentials };
  } catch {
    return emptyProfile();
  }
}

/** Saves the profile; returns false when storage is blocked (sign-in still works without it). */
export function writeProfile(kv: KeyValue | null, p: Profile): boolean {
  try {
    if (!kv) return false;
    kv.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** Records that credential `id` was used for `role`; the most recent role is last. */
export function rememberRole(p: Profile, id: string, role: Role, now: number): Profile {
  const credentials = p.credentials.map((c) => ({ ...c, roles: [...c.roles] }));
  let c = credentials.find((x) => x.id === id);
  if (!c) {
    c = { id, roles: [], label: "JitsuinFi", created_at: now };
    credentials.push(c);
  }
  c.roles = [...c.roles.filter((r) => r !== role), role];
  return { v: 1, credentials };
}

/** Stores the sign-up details for credential `id`. */
export function rememberAccount(p: Profile, id: string, who: { username: string; email?: string }, now: number): Profile {
  const credentials = p.credentials.map((c) => ({ ...c, roles: [...c.roles] }));
  let c = credentials.find((x) => x.id === id);
  if (!c) {
    c = { id, roles: [], label: who.username, created_at: now };
    credentials.push(c);
  }
  c.label = who.username;
  if (who.email) c.email = who.email;
  return { v: 1, credentials };
}

/** The credential this browser knows under `username`, if any. */
export function findByUsername(p: Profile, username: string): Profile["credentials"][number] | undefined {
  const u = normalizeUsername(username);
  return p.credentials.find((c) => c.label === u);
}

/** Usernames: 3 – 20 characters, lowercase letters, digits, dot and underscore, starting with a letter or digit. */
export function normalizeUsername(s: string): string {
  return s.trim().replace(/^@/, "").toLowerCase();
}

export function usernameProblem(s: string): string | null {
  const u = normalizeUsername(s);
  if (u.length < 3 || u.length > 20) return "Use 3 to 20 characters.";
  if (!/^[a-z0-9][a-z0-9._]*$/.test(u)) return "Use letters, digits, dot or underscore, and start with a letter or digit.";
  return null;
}

export function emailProblem(s: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) ? null : "Enter an email address like name@example.com.";
}

/** Credential ids for `excludeCredentials` (register) and `allowCredentials` (sign in). */
export function credentialIds(p: Profile): string[] {
  return p.credentials.map((c) => c.id);
}

// ---------- fingerprint (BL-D21-05) ----------

/**
 * Short fingerprint of a role's keys, so the user sees which passkey was picked: the same passkey
 * gives the same fingerprint on every synced device, another passkey gives another one.
 * HMAC-SHA-256(key = role master, "jitsuin-fingerprint-v1:<role>"), first 10 bytes, in base32
 * groups. The supplier has no single role public key (one key per invoice, P-03), so the
 * fingerprint is keyed on the master for every role; it reveals nothing about the master.
 * `master` is not zeroed here; the caller owns it.
 */
export async function fingerprint(role: Role, master: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const raw = new Uint8Array(master);
  let key: CryptoKey;
  try {
    key = await subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } finally {
    raw.fill(0);
  }
  const mac = new Uint8Array(await subtle.sign("HMAC", key, enc.encode(`jitsuin-fingerprint-v1:${role}`)));
  return base32(mac.slice(0, 10)).match(/.{4}/g)!.join("-");
}

/**
 * Fingerprint of a financier node's public key, as its contact card carries it (jitsuinfi-node
 * `relay::fingerprint`): SHA-256("jitsuin-fingerprint-v1:financier:" ‖ financier_pk), first 10
 * bytes, in base32 groups. A node has one public financier key, so anyone holding the key can
 * check the card.
 */
export async function financierFingerprint(financierPkHex: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(financierPkHex)) throw new Error("the financier key must be 64 hex characters");
  const pk = Uint8Array.from(financierPkHex.match(/../g)!, (b) => parseInt(b, 16));
  const prefix = enc.encode("jitsuin-fingerprint-v1:financier:");
  const msg = new Uint8Array(prefix.length + 32);
  msg.set(prefix);
  msg.set(pk, prefix.length);
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", msg));
  return base32(d.slice(0, 10)).match(/.{4}/g)!.join("-");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// ---------- session timing (BL-D21-12) ----------

/** The session locks after this much time without input. */
export const IDLE_LOCK_MS = 15 * 60 * 1000;

// ---------- base64url for credential ids ----------

export function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
