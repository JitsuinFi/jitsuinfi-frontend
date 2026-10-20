// HNK-22.T1 – T4: account profile, salts, fingerprint, and the session with stamps, run with
// `npm test`. A fake authenticator stands in for WebAuthn: PRF = HMAC(credential secret, salt).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  credentialIds,
  emptyProfile,
  fingerprint,
  fromB64url,
  inboxSalt,
  isNonProductionHost,
  masterSalt,
  PROFILE_KEY,
  readProfile,
  rememberRole,
  rpIdFor,
  toB64url,
  writeProfile,
  type KeyValue,
  type Role,
} from "../src/lib/account.ts";
import { Account, type KeySource } from "../src/lib/session.ts";
import { DealStore, MemoryBackend } from "../src/lib/store.ts";

const hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("hex");

class MapStorage implements KeyValue {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const blocked: KeyValue = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
};

/** One fake authenticator holding passkeys (id -> secret). */
class FakeAuthenticator implements KeySource {
  passkeys = new Map<string, Uint8Array>();
  /** Which passkey the user picks when the prompt allows several. */
  pick: string | null = null;
  prompts = 0;
  givenOut: Uint8Array[] = [];

  async prf(id: string, salt: ArrayBuffer): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey("raw", this.passkeys.get(id)!, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, salt));
  }
  async register(_role: Role, known: string[]) {
    if (known.some((id) => this.passkeys.has(id))) throw new Error("this device already has your JitsuinFi passkey: sign in with it instead");
    const id = toB64url(crypto.getRandomValues(new Uint8Array(16)));
    this.passkeys.set(id, crypto.getRandomValues(new Uint8Array(32)));
    this.pick ??= id;
    return { credentialId: id, out: null };
  }
  async evaluate(role: Role, allow: string[]) {
    this.prompts++;
    const id = allow.length === 1 ? allow[0] : this.pick!;
    if (!this.passkeys.has(id)) throw new Error("the passkey prompt was cancelled or timed out");
    const out = { credentialId: id, first: await this.prf(id, await masterSalt(role)), second: await this.prf(id, await inboxSalt(role)) };
    this.givenOut.push(out.first);
    return out;
  }
}

function setup(profile: KeyValue | null = new MapStorage()) {
  const auth = new FakeAuthenticator();
  let timer: (() => void) | null = null;
  const backend = new MemoryBackend();
  const opened: Uint8Array[] = [];
  const acct = new Account({
    keys: auth,
    profile,
    openStore: async (role, master) => {
      opened.push(master);
      const k = new Uint8Array(64);
      k.set(master.slice(0, 32));
      master.fill(0); // as jitsuin-wasm storageKeysBytes does
      return DealStore.open(role, k, backend);
    },
    now: () => 1_000,
    setTimer: (fn) => (timer = fn),
    clearTimer: () => (timer = null),
  });
  return { auth, acct, idle: () => timer?.(), opened };
}

test("salts: the buyer keeps its old master salt; roles and inbox differ", async () => {
  const enc = new TextEncoder();
  assert.equal(hex(await masterSalt("buyer")), hex(await crypto.subtle.digest("SHA-256", enc.encode("jitsuin/buyer/master/v1"))));
  const all = await Promise.all((["supplier", "buyer", "member"] as Role[]).flatMap((r) => [masterSalt(r), inboxSalt(r)]));
  assert.equal(new Set(all.map(hex)).size, 6);
});

test("rp.id is explicit for production; other hosts get their own", () => {
  assert.equal(rpIdFor("jitsuinfi.vercel.app"), "jitsuinfi.vercel.app");
  assert.equal(rpIdFor("localhost"), "localhost");
  assert.ok(!isNonProductionHost("jitsuinfi.vercel.app"));
  assert.ok(isNonProductionHost("jitsuinfi-git-x.vercel.app"));
});

test("the profile survives a roundtrip and empty, damaged or blocked storage", () => {
  const kv = new MapStorage();
  const p = rememberRole(rememberRole(emptyProfile(), "abc", "supplier", 5), "abc", "buyer", 6);
  assert.ok(writeProfile(kv, p));
  assert.deepEqual(readProfile(kv), { v: 1, credentials: [{ id: "abc", roles: ["supplier", "buyer"], label: "JitsuinFi", created_at: 5 }] });
  assert.deepEqual(credentialIds(readProfile(kv)), ["abc"]);
  kv.setItem(PROFILE_KEY, "{not json");
  assert.deepEqual(readProfile(kv), emptyProfile());
  assert.deepEqual(readProfile(blocked), emptyProfile());
  assert.equal(writeProfile(blocked, p), false);
  assert.deepEqual(readProfile(null), emptyProfile());
});

test("credential ids roundtrip as base64url", () => {
  const b = Uint8Array.from({ length: 40 }, (_, i) => i * 7);
  assert.deepEqual(fromB64url(toB64url(b)), b);
});

test("fingerprint: stable per master and role, different otherwise, master left intact", async () => {
  const m = new Uint8Array(32).fill(1);
  const f = await fingerprint("supplier", m);
  assert.match(f, /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.equal(await fingerprint("supplier", m), f);
  assert.notEqual(await fingerprint("buyer", m), f);
  assert.notEqual(await fingerprint("supplier", new Uint8Array(32).fill(2)), f);
  assert.ok(m.every((x) => x === 1));
});

test("one passkey per person: registering twice is refused, roles are added with the same passkey", async () => {
  const { auth, acct } = setup();
  const s = await acct.register("supplier");
  await assert.rejects(acct.register("buyer"), /already has your JitsuinFi passkey/);
  const b = await acct.switchRole("buyer");
  assert.equal(auth.passkeys.size, 1);
  assert.equal(b.credentialId, s.credentialId);
  assert.notEqual(b.fingerprint, s.fingerprint);
});

test("a new device (empty storage) with the synced passkey gives the same fingerprint", async () => {
  const first = setup();
  const s = await first.acct.register("supplier");
  const other = setup(blocked); // stateless: no profile at all
  other.auth.passkeys = first.auth.passkeys; // synced passkey
  other.auth.pick = s.credentialId;
  assert.equal(other.acct.knownCredentials().length, 0);
  assert.equal((await other.acct.signIn("supplier", true)).fingerprint, s.fingerprint);
  const third = setup();
  await third.acct.register("supplier"); // another passkey
  assert.notEqual(third.acct.current!.fingerprint, s.fingerprint);
});

test("no master stays after sign-in or a stamp; every stamp is one passkey touch", async () => {
  const { auth, acct, opened } = setup();
  await acct.register("supplier");
  assert.ok(auth.givenOut.every((b) => b.every((x) => x === 0)), "PRF output zeroed after sign-in");
  assert.ok(opened.every((b) => b.every((x) => x === 0)), "store copy zeroed");
  const before = auth.prompts;
  const m = await acct.stamp();
  assert.equal(auth.prompts, before + 1);
  assert.ok(m.some((x) => x !== 0));
  m.fill(0); // the jitsuin-wasm *Bytes call does this
  assert.ok(auth.givenOut.every((b) => b.every((x) => x === 0)));
  assert.equal(Object.values(acct.current!).filter((v) => v instanceof Uint8Array).length, 1, "only the inbox key in the session");
});

test("a stamp from another passkey is refused", async () => {
  const { auth, acct } = setup();
  const s = await acct.register("supplier");
  auth.passkeys.set(s.credentialId!, crypto.getRandomValues(new Uint8Array(32))); // the prompt answered by a different key
  await assert.rejects(acct.stamp(), /another passkey was used/);
});

test("a fund member never signs", async () => {
  const { acct } = setup();
  const s = await acct.register("member");
  assert.equal(s.store, null);
  await assert.rejects(acct.stamp(), /fund member does not sign/);
});

test("the session locks after 15 minutes idle and zeroes its inbox key", async () => {
  const { acct, idle } = setup();
  let changes = 0;
  acct.onChange(() => changes++);
  const s = await acct.register("buyer");
  const inbox = s.inbox;
  idle();
  assert.equal(acct.current, null);
  assert.ok(inbox.every((x) => x === 0));
  assert.equal(changes, 2);
  await assert.rejects(acct.stamp(), /sign in first/);
});

test("demo mode: the test secret is the master, switching roles keeps it, lock wipes it", async () => {
  const { acct } = setup();
  const secret = new Uint8Array(32).fill(0x5a);
  const s = await acct.signInDemo("supplier", secret.slice());
  assert.ok(s.demo);
  assert.equal(s.fingerprint, await fingerprint("supplier", secret));
  assert.deepEqual(await acct.stamp(), secret);
  const b = await acct.switchRole("buyer");
  assert.equal(b.fingerprint, await fingerprint("buyer", secret));
  assert.deepEqual(await acct.stamp(), secret);
  acct.lock();
  await assert.rejects(acct.stamp(), /sign in first/);
  await assert.rejects(acct.signInDemo("buyer", new Uint8Array(16)), /64 hex/);
});

test("the profile records the roles used", async () => {
  const kv = new MapStorage();
  const { acct } = setup(kv);
  const s = await acct.register("supplier");
  await acct.switchRole("member");
  assert.deepEqual(readProfile(kv).credentials, [{ id: s.credentialId!, roles: ["supplier", "member"], label: "JitsuinFi", created_at: 1_000 }]);
  assert.equal(acct.lastRole(), "member");
  await acct.switchRole("supplier");
  assert.equal(acct.lastRole(), "supplier");
  assert.deepEqual(readProfile(kv).credentials[0].roles, ["member", "supplier"]);
});
