// Signed-in session (HNK-22.T2 – T4, P-07; SEQ-00 "Sesi dan stempel"): which role is active, its
// key fingerprint, its inbox key and its encrypted deal store. No master and no signing key stays
// in the tab: every signature is a stamp, one passkey touch that gives the role master as a
// `Uint8Array`, which the jitsuin-wasm `*Bytes` function zeroes. The session locks after 15
// minutes without input, and is gone when the tab closes.
//
// Demo mode (no passkey or no PRF on this device): a pasted test secret stands in for the PRF
// output and is kept in memory until lock. It is for TES- data only.
//
// Dependencies are passed in, so tests run this under Node without WebAuthn or wasm.

import { IDLE_LOCK_MS, credentialIds, findByUsername, fingerprint, normalizeUsername, readProfile, rememberAccount, rememberRole, signs, writeProfile, type KeyValue, type Role } from "./account.ts";
import type { PrfOutput } from "./passkey";
import type { DealStore } from "./store";

export interface KeySource {
  register(role: Role, known: string[], name?: string): Promise<{ credentialId: string; out: PrfOutput | null }>;
  evaluate(role: Role, allow: string[]): Promise<PrfOutput>;
}

export interface SessionDeps {
  keys: KeySource;
  profile: KeyValue | null;
  /** Opens the role's deal store from a copy of the master; must zero what it receives. */
  openStore?: (role: "supplier" | "buyer", master: Uint8Array) => Promise<DealStore>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export interface Session {
  role: Role;
  /** `null` in demo mode. */
  credentialId: string | null;
  fingerprint: string;
  /** PRF `second`: seed of the inbox key (HNK-23.T2). Zeroed on lock. */
  inbox: Uint8Array;
  store: DealStore | null;
  demo: boolean;
}

const enc = new TextEncoder();

async function hmac(key: Uint8Array, label: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const raw = new Uint8Array(key);
  try {
    const k = await subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("HMAC", k, enc.encode(label)));
  } finally {
    raw.fill(0);
  }
}

export class Account {
  private readonly deps: SessionDeps;
  private session: Session | null = null;
  private demoSecret: Uint8Array | null = null;
  private timer: unknown = null;
  private readonly listeners = new Set<() => void>();

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  get current(): Session | null {
    return this.session;
  }

  /** Called on lock and on every new session. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Credentials this browser remembers (empty on a new device or with blocked storage). */
  knownCredentials(): string[] {
    return credentialIds(readProfile(this.deps.profile));
  }

  /** The role this browser used last, for the first sign-in screen; `null` when unknown. */
  lastRole(): Role | null {
    const p = readProfile(this.deps.profile);
    return p.credentials.at(-1)?.roles.at(-1) ?? null;
  }

  /**
   * Creates the person's one passkey and signs in to `role` with it. `who` (sign-up details) names
   * the passkey after the username and is kept in the local profile.
   */
  async register(role: Role, who?: { username: string; email?: string }): Promise<Session> {
    const username = who ? normalizeUsername(who.username) : undefined;
    const { credentialId, out } = await this.deps.keys.register(role, this.knownCredentials(), username);
    const prf = out ?? (await this.deps.keys.evaluate(role, [credentialId]));
    // Written before the session starts: the session's first render reads the username.
    if (username) writeProfile(this.deps.profile, rememberAccount(readProfile(this.deps.profile), credentialId, { username, email: who!.email?.trim() }, this.now()));
    return this.start(role, prf, false);
  }

  /**
   * Signs in by username: the passkey this browser knows under that name, or, on a new device, any
   * passkey the user picks (then remembered under that name). Opens `role`, else the last role.
   */
  async signInAs(username: string, role?: Role): Promise<Session> {
    const u = normalizeUsername(username);
    const known = findByUsername(readProfile(this.deps.profile), u);
    const r = role ?? known?.roles.at(-1) ?? "supplier";
    const prf = await this.deps.keys.evaluate(r, known ? [known.id] : []);
    if (!known) {
      const owner = readProfile(this.deps.profile).credentials.find((c) => c.id === prf.credentialId);
      if (owner && owner.label !== "JitsuinFi" && owner.label !== u) {
        prf.first.fill(0);
        prf.second.fill(0);
        throw new Error(`this passkey belongs to @${owner.label}; log in as @${owner.label}`);
      }
      writeProfile(this.deps.profile, rememberAccount(readProfile(this.deps.profile), prf.credentialId, { username: u }, this.now()));
    }
    return this.start(r, prf, false);
  }

  /** Username and email of the signed-in passkey, from the local profile. */
  who(): { username: string; email?: string } | null {
    const id = this.session?.credentialId;
    if (!id) return null;
    const c = readProfile(this.deps.profile).credentials.find((x) => x.id === id);
    return c && c.label !== "JitsuinFi" ? { username: c.label, email: c.email } : null;
  }

  /** Whether this browser already has an account under `username`. */
  usernameKnown(username: string): boolean {
    return findByUsername(readProfile(this.deps.profile), username) !== undefined;
  }

  /** Signs in to `role`. `anyPasskey` lets the user pick a passkey this browser does not know. */
  async signIn(role: Role, anyPasskey = false): Promise<Session> {
    return this.start(role, await this.deps.keys.evaluate(role, anyPasskey ? [] : this.knownCredentials()), false);
  }

  /** Adds or switches to another role with the same passkey (never a second passkey). */
  async switchRole(role: Role): Promise<Session> {
    const s = this.session;
    if (!s) throw new Error("sign in first");
    if (s.demo) {
      const secret = this.demoSecret!.slice();
      this.lock();
      return this.signInDemo(role, secret);
    }
    return this.start(role, await this.deps.keys.evaluate(role, [s.credentialId!]), false);
  }

  /** Demo mode: `secret` (32 bytes) stands in for the PRF output. It is zeroed by `lock`. */
  async signInDemo(role: Role, secret: Uint8Array): Promise<Session> {
    if (secret.length !== 32) {
      secret.fill(0);
      throw new Error("a test secret is 64 hex characters");
    }
    this.lock();
    this.demoSecret = secret.slice();
    const second = await hmac(secret, `jitsuin/${role}/inbox/v1`);
    const out = { credentialId: "", first: secret, second };
    return this.start(role, out, true);
  }

  private async start(role: Role, out: PrfOutput, demo: boolean): Promise<Session> {
    try {
      this.lock(demo);
      const fp = await fingerprint(role, out.first);
      const store = role !== "member" && this.deps.openStore ? await this.deps.openStore(role, out.first.slice()) : null;
      if (!demo) writeProfile(this.deps.profile, rememberRole(readProfile(this.deps.profile), out.credentialId, role, this.now()));
      this.session = { role, credentialId: demo ? null : out.credentialId, fingerprint: fp, inbox: out.second, store, demo };
      this.touch();
      this.emit();
      return this.session;
    } catch (e) {
      out.second.fill(0);
      throw e;
    } finally {
      out.first.fill(0);
    }
  }

  /**
   * A stamp: the role master for one signature, as a fresh `Uint8Array` the caller passes to a
   * jitsuin-wasm `*Bytes` function (which zeroes it). With a passkey this is one touch; a passkey
   * other than the session's one is refused.
   */
  async stamp(): Promise<Uint8Array> {
    const s = this.session;
    if (!s) throw new Error("sign in first");
    if (!signs(s.role)) throw new Error("a fund member does not sign anything");
    this.touch();
    if (s.demo) return this.demoSecret!.slice();
    const out = await this.deps.keys.evaluate(s.role, [s.credentialId!]);
    out.second.fill(0);
    if ((await fingerprint(s.role, out.first)) !== s.fingerprint) {
      out.first.fill(0);
      throw new Error("another passkey was used; sign in again with the passkey of this session");
    }
    return out.first;
  }

  /** Forgets every key of the session. `quiet` skips the change notice (used before a restart). */
  lock(quiet = false): void {
    if (this.timer !== null) (this.deps.clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
    this.timer = null;
    const had = this.session !== null;
    this.session?.inbox.fill(0);
    this.session = null;
    if (!quiet) {
      this.demoSecret?.fill(0);
      this.demoSecret = null;
    }
    if (had && !quiet) this.emit();
  }

  /** User input: restarts the 15 minute idle lock. */
  touch(): void {
    if (!this.session) return;
    if (this.timer !== null) (this.deps.clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
    this.timer = (this.deps.setTimer ?? setTimeout)(() => this.lock(), IDLE_LOCK_MS);
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
