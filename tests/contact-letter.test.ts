// Judge run 3, finding 2: the supplier adds the buyer back from the buyer's key letter. The card
// (fingerprint, @name) rides in the part the invoice key signs, next to the buyer's mailbox; the
// supplier's app takes it only from a letter whose signature holds, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardFromKeyLetter, contactId, contactName, encodeContact, decodeContact, namedContact, type Contact } from "../src/lib/contact.ts";
import { decodeMessage, encodeMessage, headerProblems, newMessageId, signHeader, verifyHeader, type Header } from "../src/lib/relay-message.ts";

const SUPPLIER_BOX = "a".repeat(64);
const BUYER_BOX = "c".repeat(64);
const buyer: Contact = { v: 1, role: "buyer", username: "tes-buyer", mailbox_pk: BUYER_BOX, fingerprint: "NBIA-454Z-AFN5-HAFO" };

async function invoiceKey() {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  return { priv: k.privateKey, pub: Buffer.from(raw).toString("hex") };
}

/** The key letter as NextKey.tsx sends it: the invoice key, the buyer's card, signed by that key. */
async function keyLetter(card: Partial<Pick<Contact, "fingerprint" | "username">>, role: Header["from"]["role"] = "buyer") {
  const k = await invoiceKey();
  const h = { v: 1 as const, id: newMessageId(), type: "key.invoice_pk" as const, to: SUPPLIER_BOX, from: { role, mailbox_pk: BUYER_BOX }, sent_at: 1_792_400_000, body: { invoice_pk: k.pub, ...card }, attachments: [] };
  return { k, h: await signHeader(h, k.priv, k.pub) };
}

test("the key letter carries the buyer's card under the key's signature, and the supplier adds it", async () => {
  const { k, h } = await keyLetter({ fingerprint: buyer.fingerprint, username: buyer.username });
  const got = (await decodeMessage(await encodeMessage(h), SUPPLIER_BOX)).header;
  assert.deepEqual(headerProblems(got), []);
  // the supplier's checks are unchanged: the signature holds and the key signed its own letter
  assert.ok(await verifyHeader(got));
  assert.equal(got.signer, k.pub);
  assert.equal(got.signer, got.body.invoice_pk);
  const c = cardFromKeyLetter(got);
  assert.deepEqual(c, buyer);
  // the card is a contact card like a link's: it encodes, and it is kept under the buyer's mailbox
  assert.deepEqual(decodeContact(encodeContact(c!)), buyer);
  assert.equal(contactId(c!), `contact:${BUYER_BOX}`);
  assert.equal(contactName(c!), "@tes-buyer");
});

test("a changed name or fingerprint breaks the key's signature", async () => {
  const { h } = await keyLetter({ fingerprint: buyer.fingerprint, username: buyer.username });
  assert.equal(await verifyHeader({ ...h, body: { ...h.body, username: "someone-else" } }), false);
  assert.equal(await verifyHeader({ ...h, body: { ...h.body, fingerprint: "AAAA-BBBB-CCCC-DDDD" } }), false);
  assert.equal(await verifyHeader({ ...h, from: { ...h.from, mailbox_pk: "d".repeat(64) } }), false);
});

test("a key letter without a name is named on the confirm; one without a fingerprint offers nothing", async () => {
  const nameless = cardFromKeyLetter((await keyLetter({ fingerprint: buyer.fingerprint })).h);
  assert.deepEqual(nameless, { v: 1, role: "buyer", mailbox_pk: BUYER_BOX, fingerprint: buyer.fingerprint });
  assert.equal(namedContact(nameless!, "  @PT Maju Jaya ").username, "PT Maju Jaya");
  assert.deepEqual(namedContact(nameless!, "   "), nameless, "an empty name keeps the fingerprint as the name");
  assert.throws(() => namedContact(nameless!, "x".repeat(33)), /at most 32/);
  assert.equal(namedContact(buyer, "other").username, "tes-buyer", "a card with an @name keeps it");
  // an older letter (the key only) is still a valid key letter, with no card in it
  const old = (await keyLetter({})).h;
  assert.deepEqual(headerProblems(old), []);
  assert.equal(cardFromKeyLetter(old), null);
  // a fingerprint no card could hold gives no card
  assert.equal(cardFromKeyLetter((await keyLetter({ fingerprint: "AB" })).h), null);
});

test("the schema still refuses what is not a buyer's key letter", async () => {
  const { h } = await keyLetter({ fingerprint: buyer.fingerprint, username: buyer.username });
  assert.ok(headerProblems({ ...h, body: { ...h.body, role: "supplier" } }).some((p) => p.includes('unknown key.invoice_pk body field "role"')));
  assert.ok(headerProblems({ ...h, body: { ...h.body, username: "x".repeat(33) } }).some((p) => p.includes('"username" is not valid')));
  assert.ok(headerProblems({ ...h, from: { ...h.from, role: "supplier" } }).length > 0);
  assert.equal(cardFromKeyLetter({ ...h, from: { ...h.from, role: "supplier" } }), null);
});
