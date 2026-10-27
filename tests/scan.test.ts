// The in-app scanner (2026-10-27): what it read goes through the paste field's reader; anything
// else, and every camera failure, is said in plain words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraTrouble, routeScan, scanScale, ScanRefused } from "../src/lib/scan.ts";
import { contactLink, encodeContact, type Contact } from "../src/lib/contact.ts";
import { encodeFundCard } from "../src/lib/fund-card.ts";

const card: Contact = { v: 1, role: "buyer", username: "tes-buyer", mailbox_pk: "cd".repeat(32), fingerprint: "DWLA-XGW7-FUVZ-S4WD" };

test("a contact link from any host, its card, or the card with spaces route to the contact", () => {
  for (const t of [contactLink("https://jitsuinfi.vercel.app", card), contactLink("http://localhost:5196", card), encodeContact(card), `  ${encodeContact(card)}\n`]) {
    const r = routeScan(t);
    assert.equal(r.kind, "contact");
    assert.deepEqual(r.contact, card);
  }
});

test("other codes are named for what they are", () => {
  const refused = (t: string, re: RegExp) => assert.throws(() => routeScan(t), (e: unknown) => e instanceof ScanRefused && re.test(e.message));
  refused("zcash:utest1abc?amount=0.0009", /Zcash payment request/);
  refused(encodeFundCard({ v: 1, fund_pk: "ab".repeat(32), mailbox_pk: "cd".repeat(32), deposit_address: "utest1abcdefghij" }), /fund card/);
  refused("jitsuin-offer-v1:abc", /not a contact/);
  refused("https://example.com/menu", /not a JitsuinFi code/);
  refused("   ", /empty/);
  // a damaged card keeps the reader's own words
  refused(encodeContact(card).slice(0, -6) + "AAAAAA", /contact card/);
});

test("camera failures in plain words", () => {
  assert.equal(cameraTrouble("NotAllowedError").title, "Camera blocked");
  assert.equal(cameraTrouble("SecurityError").title, "Camera blocked");
  assert.equal(cameraTrouble("NotFoundError").title, "No camera");
  assert.equal(cameraTrouble("NotReadableError").title, "Camera busy");
  assert.equal(cameraTrouble("NoMediaDevices").title, "No camera here");
  assert.match(cameraTrouble("Whatever").text, /photo/);
});

test("frames and photos are scaled down, never up, keeping their shape", () => {
  assert.deepEqual(scanScale(1920, 1080), { w: 720, h: 405 });
  assert.deepEqual(scanScale(4032, 3024, 1024), { w: 1024, h: 768 });
  assert.deepEqual(scanScale(320, 240), { w: 320, h: 240 });
});
