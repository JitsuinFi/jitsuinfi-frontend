// HNK-23.T7: the app's relay client, with the real jitsuin-wasm and a fake relay that follows the
// relay's rules (jitsuinfi-backend), run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as w from "../src/wasm/jitsuin_wasm.js";
import { decodeContact, encodeContact } from "../src/lib/contact.ts";
import { draft, ensureMailbox, identity, loadState, receive, remove, saveState, send, signInWasm, type RelayDeps } from "../src/lib/relay.ts";
import { describeFiles, encodeMessage, verifyHeader } from "../src/lib/relay-message.ts";

w.initSync({ module: readFileSync(new URL("../src/wasm/jitsuin_wasm_bg.wasm", import.meta.url)) });

/** A relay in memory with the backend's checks (ownership proof, owner-only reading). */
function fakeRelay() {
  const boxes = new Map<string, Map<string, Uint8Array>>();
  const challenges = new Map<string, { pk: string; purpose: string; e: ReturnType<typeof generateKeyPairSync>; nonce: Buffer }>();
  const tokens = new Map<string, string>();
  const states = new Map<string, Uint8Array>();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const raw = (pk: string) => createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(pk, "hex").toString("base64url") }, format: "jwk" });
  const id = (pk: string) => createHash("blake2b512").update("JitsuinMailboxId_v1\n").update(Buffer.from(pk, "hex")).digest().subarray(0, 32).toString("hex");
  const check = (b: { challenge_id: string; proof: string }, purpose: string) => {
    const c = challenges.get(b.challenge_id);
    challenges.delete(b.challenge_id);
    if (!c || c.purpose !== purpose) return null;
    const shared = diffieHellman({ privateKey: c.e.privateKey, publicKey: raw(c.pk) });
    const tag = createHash("blake2b512").update("JitsuinMailboxProof_v1\n").update(purpose).update(Buffer.of(0)).update(shared).update(c.nonce).update(Buffer.from(c.pk, "hex")).digest().subarray(0, 32).toString("hex");
    return tag === b.proof ? c.pk : null;
  };
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = String(url);
    const m = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (m === "POST" && path === "/api/mailbox/challenge") {
      const e = generateKeyPairSync("x25519");
      const cid = randomUUID();
      const nonce = Buffer.alloc(32, 0x5a);
      challenges.set(cid, { pk: body.mailbox_pk, purpose: body.purpose, e, nonce });
      const eph = Buffer.from(e.publicKey.export({ format: "jwk" }).x as string, "base64url").toString("hex");
      return json(200, { challenge_id: cid, eph_pk: eph, nonce: nonce.toString("hex") });
    }
    if (m === "POST" && path === "/api/mailbox") {
      const pk = check(body, "register");
      if (pk !== body.mailbox_pk) return json(403, { error: "the proof does not match" });
      if (boxes.has(id(pk))) return json(200, { mailbox_id: id(pk), created: false });
      boxes.set(id(pk), new Map());
      return json(201, { mailbox_id: id(pk), created: true });
    }
    let r = /^\/api\/mailbox\/([0-9a-f]{64})\/read$/.exec(path);
    if (r && m === "POST") {
      const pk = check(body, "read");
      if (!pk || id(pk) !== r[1]) return json(403, { error: "proof" });
      const t = randomUUID();
      tokens.set(t, r[1]);
      return json(200, { token: t });
    }
    r = /^\/api\/mailbox\/([0-9a-f]{64})\/state$/.exec(path);
    if (r) {
      const auth = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
      if (!auth || tokens.get(auth) !== r[1]) return json(401, { error: "reading a mailbox needs a read token from its owner" });
      if (m === "PUT") {
        states.set(r[1], new Uint8Array(await (init!.body as Blob).arrayBuffer()));
        return json(200, { updated_at: "2026-10-22T10:00:00Z" });
      }
      const st = states.get(r[1]);
      return st ? new Response(new Uint8Array(st), { status: 200 }) : json(404, { error: "this mailbox has no saved state" });
    }
    r = /^\/api\/mailbox\/([0-9a-f]{64})\/messages(?:\/([0-9a-f-]{36}))?$/.exec(path);
    if (!r) return json(404, { error: "no such endpoint" });
    const box = boxes.get(r[1]);
    if (!box) return json(404, { error: "no mailbox with this id" });
    if (m === "POST") {
      const mid = randomUUID();
      box.set(mid, new Uint8Array(await (init!.body as Blob).arrayBuffer()));
      return json(202, { message_id: mid });
    }
    const auth = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
    if (!auth || tokens.get(auth) !== r[1]) return json(401, { error: "reading a mailbox needs a read token from its owner" });
    if (!r[2]) return json(200, { messages: [...box.keys()].map((k) => ({ id: k, size: box.get(k)!.length, received_at: "2026-10-20T10:00:00Z" })) });
    if (m === "DELETE") return box.delete(r[2]) ? new Response(null, { status: 204 }) : json(404, { error: "gone" });
    const msg = box.get(r[2]);
    return msg ? new Response(new Uint8Array(msg), { status: 200 }) : json(404, { error: "gone" });
  };
  return { fetch: fetch as typeof globalThis.fetch, boxes, states };
}

test("registration says whether it created the mailbox; a state that is not there reads as null, 404 or 204 (judge run 2026-10-26)", async () => {
  const relay = fakeRelay();
  let reads = 0;
  const d: RelayDeps = { wasm: w, fetch: async (u, i) => (String(u).endsWith("/state") && (i?.method ?? "GET") === "GET" && reads++, relay.fetch(u, i)) };
  const buyerInbox = new Uint8Array(32).fill(0x0b);
  const first = await ensureMailbox(buyerInbox, d);
  assert.equal(first.created, true, "a new mailbox: the screen knows no state can be there and skips the read");
  const again = await ensureMailbox(buyerInbox, d);
  assert.equal(again.created, false, "an existing mailbox: its state may have been saved by another device");
  assert.equal(again.mailbox_id, first.mailbox_id);
  assert.equal(await loadState(buyerInbox, d), null, "404: no state yet");
  assert.equal(reads, 1);
  // a relay that answers 204 for "nothing stored" reads the same
  const empty: RelayDeps = { ...d, fetch: async (u, i) => (String(u).endsWith("/state") && (i?.method ?? "GET") === "GET" ? new Response(null, { status: 204 }) : relay.fetch(u, i)) };
  assert.equal(await loadState(buyerInbox, empty), null, "204: no state yet");
});

test("a supplier's signed sign request with its PDF reaches only the buyer, intact", async () => {
  const relay = fakeRelay();
  const d: RelayDeps = { wasm: w, fetch: relay.fetch };
  const supplierInbox = new Uint8Array(32).fill(0x0a);
  const buyerInbox = new Uint8Array(32).fill(0x0b);
  const sup = await ensureMailbox(supplierInbox, d);
  const buy = await ensureMailbox(buyerInbox, d);
  assert.equal(sup.mailbox_id, w.mailboxId(sup.mailbox_pk));
  assert.deepEqual(supplierInbox, new Uint8Array(32).fill(0x0a), "the session's inbox output is not consumed");

  // the supplier signs with its per-invoice key inside wasm
  const secret = new Uint8Array(32).fill(0x42);
  const supplierPk = JSON.parse(w.messageSignBytes(new Uint8Array(32).fill(0x42), new TextEncoder().encode("JitsuinMsgSig_v1\n{}"))).signer as string;
  const pdf = [{ name: "terms.pdf", mime: "application/pdf" as const, bytes: new TextEncoder().encode("%PDF-1.7 TES-INV-R1") }];
  const h = signInWasm(
    draft("invoice.sign_request", { role: "supplier", mailbox_pk: sup.mailbox_pk }, buy.mailbox_pk, d, { n: "ab".repeat(32), body: { invoice: "SlRTSQ" }, attachments: await describeFiles(pdf) }),
    supplierPk,
    secret,
    d,
  );
  assert.deepEqual(secret, new Uint8Array(32), "the per-invoice key is wiped");
  await send(buy.mailbox_pk, await encodeMessage(h, pdf), d);
  // garbage dropped in the buyer's box by anyone
  await send(buy.mailbox_pk, new TextEncoder().encode("not a relay message"), d);

  // the supplier cannot read the buyer's mailbox
  await assert.rejects(receive(supplierInbox, { ...d, fetch: async (u, i) => relay.fetch(String(u).replace(sup.mailbox_id, buy.mailbox_id), i) }), /proof|token/);

  const got = await receive(buyerInbox, d);
  assert.equal(got.refused, 1);
  assert.equal(got.messages.length, 1);
  const m = got.messages[0];
  assert.equal(m.message.header.type, "invoice.sign_request");
  assert.equal(m.signatureOk, true);
  assert.ok(await verifyHeader(m.message.header, supplierPk));
  assert.deepEqual(m.message.attachments[0], pdf[0].bytes);
  assert.equal(m.message.header.from.mailbox_pk, sup.mailbox_pk);
  await remove(got.me, m.relayId, got.token, d);
  assert.equal(relay.boxes.get(buy.mailbox_id)!.size, 1);
  assert.equal(identity(buyerInbox, d).mailbox_id, buy.mailbox_id);
});

test("contact cards round-trip and refuse damage", () => {
  const c = { v: 1 as const, role: "buyer" as const, username: "tes_buyer", mailbox_pk: "cd".repeat(32), fingerprint: "ABCD-1234" };
  const code = encodeContact(c);
  assert.ok(code.startsWith("jitsuin-contact-v1:"));
  assert.deepEqual(decodeContact(` ${code}\n`), c);
  assert.throws(() => decodeContact("hello"), /starts with/);
  assert.throws(() => decodeContact(code.slice(0, -4)), /damaged|not valid/);
  assert.throws(() => encodeContact({ ...c, mailbox_pk: "xyz" }), /64 hex/);
});

test("the mailbox state is sealed to its owner and read back only by the owner (HNK-25.T2)", async () => {
  const relay = fakeRelay();
  const d: RelayDeps = { wasm: w, fetch: relay.fetch };
  const buyerInbox = new Uint8Array(32).fill(0x0b);
  const other = new Uint8Array(32).fill(0x0c);
  const me = await ensureMailbox(buyerInbox, d);
  await ensureMailbox(other, d);
  assert.equal(await loadState(buyerInbox, d), null);
  const plain = new TextEncoder().encode('{"v":1,"certs":["c0"]}');
  await saveState(buyerInbox, plain, d);
  const kept = relay.states.get(me.mailbox_id)!;
  assert.ok(kept.length > plain.length && !Buffer.from(kept).includes(Buffer.from("certs")), "the relay holds only sealed bytes");
  assert.deepEqual(await loadState(buyerInbox, d), plain);
  // another mailbox owner cannot read it
  await assert.rejects(loadState(other, { ...d, fetch: async (u, i) => relay.fetch(String(u).replace(/[0-9a-f]{64}\/state/, `${me.mailbox_id}/state`), i) }), /token/);
});

test("an inbox read right after an action skips the used message and one removed meanwhile (HNK-34 E2E)", async () => {
  const relay = fakeRelay();
  const d: RelayDeps = { wasm: w, fetch: relay.fetch };
  const sup = await ensureMailbox(new Uint8Array(32).fill(0x0a), d);
  const buyerInbox = new Uint8Array(32).fill(0x0b);
  const buy = await ensureMailbox(buyerInbox, d);
  const supplierPk = JSON.parse(w.messageSignBytes(new Uint8Array(32).fill(0x42), new TextEncoder().encode("JitsuinMsgSig_v1\n{}"))).signer as string;
  const msg = async (i: number) => {
    const pdf = [{ name: "terms.pdf", mime: "application/pdf" as const, bytes: new TextEncoder().encode(`%PDF-1.7 TES-INV-R${i}`) }];
    const h = draft("invoice.sign_request", { role: "supplier", mailbox_pk: sup.mailbox_pk }, buy.mailbox_pk, d, { n: String(i).repeat(64), body: { invoice: "SlRTSQ" }, attachments: await describeFiles(pdf) });
    await send(buy.mailbox_pk, await encodeMessage(signInWasm(h, supplierPk, new Uint8Array(32).fill(0x42), d), pdf), d);
  };
  await msg(1);
  await msg(2);
  await msg(3);
  const box = relay.boxes.get(buy.mailbox_id)!;
  const [used, gone, kept] = [...box.keys()];
  // the third message's fetch finds it removed by another read (a 404), as on the relay
  const fetched: string[] = [];
  const racing: RelayDeps = {
    ...d,
    fetch: async (u, i) => {
      const path = String(u);
      if (path.endsWith(`/messages/${gone}`)) box.delete(gone);
      if (/\/messages\/[0-9a-f-]{36}$/.test(path)) fetched.push(path.slice(-36));
      return relay.fetch(u, i);
    },
  };
  const got = await receive(buyerInbox, racing, new Set([used]));
  assert.deepEqual(fetched, [gone, kept], "the used message is not asked for");
  assert.deepEqual(got.messages.map((m) => m.relayId), [kept]);
  assert.equal(got.refused, 0);
});
