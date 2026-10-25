// HNK-23.T1: relay message schema (framing, limits, types, signatures), run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  decodeMessage,
  describeFiles,
  encodeMessage,
  headerProblems,
  MAX_ATTACHMENT,
  newMessageId,
  signHeader,
  TYPES,
  verifyHeader,
  type Header,
} from "../src/lib/relay-message.ts";

const H = (c: string) => c.repeat(64);
const MAILBOX = H("a");
const PDF = new TextEncoder().encode("%PDF-1.7 TES-INV-0001 terms");

async function keypair() {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  return { priv: k.privateKey, pub: Buffer.from(raw).toString("hex") };
}

function base(type: Header["type"], role: Header["from"]["role"], body: Record<string, unknown>, n: string | undefined = H("b"), attachments: Header["attachments"] = []): Header {
  return { v: 1 as const, id: newMessageId(), type, to: MAILBOX, from: { role, mailbox_pk: H("c") }, sent_at: 1_792_400_000, ...(n ? { n } : {}), body, attachments };
}
const pdf = [{ name: "terms.pdf", mime: "application/pdf" as const, bytes: PDF }];

test("a signed invoice request with its PDF survives encode and decode", async () => {
  const sup = await keypair();
  const h = await signHeader(base("invoice.sign_request", "supplier", { invoice: "SlRTSQ" }, H("b"), await describeFiles(pdf)), sup.priv, sup.pub);
  const bytes = await encodeMessage(h, pdf);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "JTSM");
  const m = await decodeMessage(bytes, MAILBOX);
  assert.deepEqual(m.attachments[0], PDF);
  assert.equal(m.header.attachments[0].size, PDF.length);
  assert.ok(await verifyHeader(m.header, sup.pub));
  const swapped = await describeFiles([{ name: "terms.pdf", mime: "application/pdf", bytes: new TextEncoder().encode("%PDF other") }]);
  assert.ok(!(await verifyHeader({ ...m.header, attachments: swapped }, sup.pub)), "the signature covers the PDF hash");
});

test("a PDF over 2 MiB is refused with a message (BL-D22-05)", async () => {
  const sup = await keypair();
  const bigFile = [{ name: "big.pdf", mime: "application/pdf" as const, bytes: new Uint8Array(MAX_ATTACHMENT + 1) }];
  const big = await signHeader(base("invoice.sign_request", "supplier", { invoice: "SlRTSQ" }, H("b"), await describeFiles(bigFile)), sup.priv, sup.pub);
  await assert.rejects(encodeMessage(big, bigFile), /larger than 2 MiB/);
  const h = await signHeader(base("invoice.sign_request", "supplier", { invoice: "SlRTSQ" }, H("b"), await describeFiles(pdf)), sup.priv, sup.pub);
  const ok = await encodeMessage(h, pdf);
  const header = JSON.parse(new TextDecoder().decode(ok.subarray(9, 9 + new DataView(ok.buffer).getUint32(5))));
  header.attachments[0].size = MAX_ATTACHMENT + 1;
  assert.ok(headerProblems(header).some((p) => p.includes("larger than 2 MiB")));
});

test("only PDF attachments, the right number of them, with a matching hash", async () => {
  const fin = await keypair();
  const none = await signHeader(base("deal.letter", "financier", { letter: "SlRTQQ" }), fin.priv, fin.pub);
  await assert.rejects(encodeMessage(none), /takes 1 attachment/);
  const png = [{ name: "x.png", mime: "image/png" as never, bytes: PDF }];
  await assert.rejects(encodeMessage(await signHeader(base("deal.letter", "financier", { letter: "SlRTQQ" }, H("b"), await describeFiles(png)), fin.priv, fin.pub), png), /PDF only/);
  const letterPdf = [{ name: "letter.pdf", mime: "application/pdf" as const, bytes: PDF }];
  const letter = await signHeader(base("deal.letter", "financier", { letter: "SlRTQQ" }, H("b"), await describeFiles(letterPdf)), fin.priv, fin.pub);
  await assert.rejects(encodeMessage(letter, pdf.map((f) => ({ ...f, bytes: new TextEncoder().encode("other") }))), /do not match the header/);
  const bytes = await encodeMessage(letter, letterPdf);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(decodeMessage(bytes), /does not match its hash/);
});

test("types, roles, required and unknown fields are checked", () => {
  assert.ok(headerProblems({ ...base("deal.entry", "supplier", { memo: "AAAA" }) }).length === 0);
  assert.ok(headerProblems({ ...base("deal.entry", "buyer", { memo: "AAAA" }) }).some((p) => p.includes("cannot come from buyer")));
  assert.ok(headerProblems({ ...base("deal.entry", "supplier", {}) }).some((p) => p.includes('needs "memo"')));
  assert.ok(headerProblems({ ...base("deal.entry", "supplier", { memo: "AAAA", extra: 1 }) }).some((p) => p.includes("unknown deal.entry body field")));
  assert.ok(headerProblems({ ...base("deal.entry", "supplier", { memo: "AAAA" }, "") }).some((p) => p.includes("needs n")));
  assert.ok(headerProblems({ ...base("deal.entry", "supplier", { memo: "AAAA" }), attachments: [], v: 2 }).some((p) => p.includes("unsupported message version")));
  assert.deepEqual(headerProblems({ ...base("deal.entry", "supplier", { memo: "AAAA" }), type: "deal.nope" }), ['unsupported message type "deal.nope"']);
  assert.ok(headerProblems({ ...base("deal.commitment_opening", "financier", { financier_pk: H("d"), salt: H("e"), discount: 3 }), attachments: [], signer: H("d"), sig: H("f").repeat(2) }).some((p) => p.includes("both classes")));
});

test("signed types must be signed by the right key; self-signed documents travel unsigned", async () => {
  const fin = await keypair();
  const other = await keypair();
  const body = { financier_pk: fin.pub, history_tag: H("1") };
  const signed = await signHeader(base("deal.entry_request", "financier", body), fin.priv, fin.pub);
  assert.deepEqual(headerProblems({ ...signed }), []);
  assert.ok(await verifyHeader({ ...signed }, fin.pub));
  assert.ok(!(await verifyHeader({ ...signed }, other.pub)), "expected another signer");
  const forged = await signHeader(base("deal.entry_request", "financier", body), other.priv, other.pub);
  assert.ok(headerProblems({ ...forged }).some((p) => p.includes("not the financier named in the body")));
  const altered = { ...signed, attachments: [], body: { ...body, history_tag: H("2") } };
  assert.ok(!(await verifyHeader(altered)), "a changed body breaks the signature");
  const unsignedNeeded = { ...base("deal.entry_request", "financier", body) };
  assert.ok(headerProblems(unsignedNeeded).some((p) => p.includes("must be signed")));
  const seal = { ...base("deal.seal", "buyer", { seal: "SlRTUw", index: 1 }) };
  assert.deepEqual(headerProblems(seal), []);
  assert.ok(await verifyHeader(seal as Header));
  assert.ok(headerProblems({ ...seal, signer: fin.pub, sig: H("0").repeat(2) }).some((p) => p.includes("is not signed")));
});

test("a message addressed to another mailbox is refused", async () => {
  const bytes = await encodeMessage(base("invoice.signature", "buyer", { buyer_signature: H("9").repeat(2) }));
  await assert.rejects(decodeMessage(bytes, H("0")), /another mailbox/);
  assert.equal((await decodeMessage(bytes, MAILBOX)).header.type, "invoice.signature");
});

test("framing: magic, version, header length and trailing bytes", async () => {
  const bytes = await encodeMessage(base("invoice.signature", "buyer", { buyer_signature: H("9").repeat(2) }));
  const bad = bytes.slice();
  bad[0] = 0;
  await assert.rejects(decodeMessage(bad), /not a JitsuinFi message/);
  const v2 = bytes.slice();
  v2[4] = 2;
  await assert.rejects(decodeMessage(v2), /unsupported message version 2/);
  const extra = new Uint8Array(bytes.length + 1);
  extra.set(bytes);
  await assert.rejects(decodeMessage(extra), /trailing bytes/);
});

test("canonical JSON sorts keys and is stable", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: 0, y: undefined } }), '{"a":[true,null,"x"],"b":1,"c":{"z":0}}');
  assert.throws(() => canonicalJson({ a: Infinity }));
});

test("every relay flow of the level-2 DFDs has a message type (BL-D1-01)", () => {
  // The D7 flows of DFD-2.1 – 2.9 (vault scripts/dfd_model.py), as (diagram, from process, to process).
  // DFD-2.1 4 <-> D7 is mailbox registration: a relay API call, not a message.
  const flows: Array<[string, string]> = [
    ["2.1", "2.2"], ["2.1", "2.4"], ["2.5", "2.6"], ["2.7", "2.8"],
    ["3.2", "3.6"], ["3.5", "3.6"], ["3.6", "3.7"],
    ["4.1", "4.2"], ["4.1", "4.3"], ["4.2", "4.3"], ["4.2", "4.4"], ["4.3", "4.4"], ["4.3", "4.8"], ["4.7", "4.8"],
    ["6.1", "6.2"], ["6.3", "6.4"],
    ["9.1", "9.7"], ["9.6", "9.7"],
  ];
  const covered = (from: string, to: string) =>
    Object.values(TYPES).some((t) => t.flows.split(";").some((seg) => seg.includes(from) && seg.includes(to)));
  for (const [from, to] of flows) assert.ok(covered(from, to), `no message type for ${from} → ${to}`);
  assert.ok(Object.values(TYPES).some((t) => t.flows.includes("5.1")), "seals for the payment request (5.1)");
});

test("buyer-late: the node's deal.reminder (milestone, due date, amount; financier-signed) is a valid header", async () => {
  const fin = await keypair();
  const ok = await signHeader(base("deal.reminder", "financier", { milestone: "d-1", due_date: 20_754, amount_zat: 60_000 }), fin.priv, fin.pub);
  assert.deepEqual(headerProblems(ok), []);
  assert.ok(await verifyHeader(ok, fin.pub));
  assert.ok(headerProblems(base("deal.reminder", "financier", { milestone: "d-3", due_date: 20_754, amount_zat: 60_000 })).some((p) => p.includes('"milestone" is not valid')));
  assert.ok(headerProblems(base("deal.reminder", "supplier", { milestone: "d+1", due_date: 20_754, amount_zat: 60_000 })).some((p) => p.includes("cannot come from supplier")));
  assert.ok(headerProblems({ ...base("deal.reminder", "financier", { milestone: "d+1", due_date: 20_754, amount_zat: 60_000 }), n: undefined }).some((p) => p.includes("needs n")));
});
