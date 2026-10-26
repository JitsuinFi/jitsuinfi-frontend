// Judge run 2, finding 5: the contact link and QR, the card in the fragment, checked as a pasted card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTACT_PATH, CONTACT_PREFIX, contactLink, contactName, decodeContact, encodeContact, readContact, type Contact } from "../src/lib/contact.ts";

const card: Contact = { v: 1, role: "supplier", username: "tes-supplier", mailbox_pk: "ab".repeat(32), fingerprint: "DWLA-XGW7-FUVZ-S4WD" };

test("the link carries the card in the fragment only, under /app/contact", () => {
  const link = contactLink("https://jitsuinfi.vercel.app/", card);
  const u = new URL(link);
  assert.equal(u.origin, "https://jitsuinfi.vercel.app");
  assert.equal(u.pathname, CONTACT_PATH);
  assert.equal(u.search, "");
  assert.ok(u.hash.startsWith(`#${CONTACT_PREFIX}`));
  // what a server would see: the path without the fragment
  assert.ok(!(u.origin + u.pathname + u.search).includes(card.mailbox_pk));
});

test("a link, its fragment, a percent-encoded link and the bare card all read back to the card", () => {
  const link = contactLink("http://localhost:5192", card);
  assert.deepEqual(readContact(link), card);
  assert.deepEqual(readContact(link.slice(link.indexOf("#"))), card);
  assert.deepEqual(readContact(`  ${encodeURI(link)}\n`), card);
  assert.deepEqual(readContact(encodeContact(card)), card);
});

test("anything else is refused in plain words", () => {
  assert.throws(() => readContact(""), /paste the contact link/);
  assert.throws(() => readContact("https://example.com/app/contact#hello"), /not a JitsuinFi contact/);
  const bad = encodeContact(card).slice(0, -6) + "AAAAAA";
  assert.throws(() => readContact(bad), /contact card/);
});

test("a changed card is refused as a pasted one is", () => {
  const forged = CONTACT_PREFIX + btoa(JSON.stringify({ ...card, mailbox_pk: "zz" })).replace(/=+$/, "");
  assert.throws(() => readContact(forged), /not valid/);
  const extra = CONTACT_PREFIX + btoa(JSON.stringify({ ...card, evil: 1 })).replace(/=+$/, "");
  assert.throws(() => decodeContact(extra), /unknown field/);
});

test("a contact is named by its @name, else its fingerprint", () => {
  assert.equal(contactName(card), "@tes-supplier");
  assert.equal(contactName({ fingerprint: "AAAA-BBBB" }), "AAAA-BBBB");
});
