// Relay message schema (HNK-23.T1, C-04; vault: Format Data "Pesan relay"). Every document that
// moves between supplier, buyer, financier node and fund through the relay is one message.
//
// Plaintext layout, before it is sealed to the recipient's `mailbox_pk` (X25519 sealed box,
// HNK-23.T2), so the relay only ever stores ciphertext:
//
//   "JTSM" | version u8 (= 1) | header length u32 big-endian | header (UTF-8 JSON) | attachments
//
// The header names the message type, the recipient mailbox (`to`, so a signed message cannot be
// re-sealed to someone else's mailbox), the sender's role and reply mailbox, the deal (N), a typed
// body, and the attachments (name, MIME type, size, SHA-256) whose bytes follow in that order.
// Messages from the financier node and the fund, and the supplier's own requests, carry an Ed25519
// signature over `signingBytes(header)`; documents that already carry their own signatures (buyer
// signature, seals, board entries, history certificates) travel unsigned.
//
// Pure TypeScript and WebCrypto: tests run it under Node (`npm test`).

export const MAGIC = "JTSM";
export const VERSION = 1;
/** Largest header (UTF-8 JSON). */
export const MAX_HEADER = 64 * 1024;
/** Largest attachment: an invoice terms PDF or an assignment letter PDF (BL-D22-05). */
export const MAX_ATTACHMENT = 2 * 1024 * 1024;
export const MAX_ATTACHMENTS = 2;
/** Largest plaintext; the relay refuses ciphertext above this plus the sealed-box overhead. */
export const MAX_PLAINTEXT = 9 + MAX_HEADER + MAX_ATTACHMENTS * MAX_ATTACHMENT;
export const ATTACHMENT_MIME = ["application/pdf"] as const;
const SIG_DOMAIN = "JitsuinMsgSig_v1\n";

export type Party = "supplier" | "buyer" | "financier" | "member" | "fund" | "applicant" | "provider";
/** Who must sign the header: a party key, or nobody because the body signs itself. */
export type Signer = "supplier" | "buyer-invoice-key" | "financier" | "fund" | "provider" | "none";

export interface Attachment {
  name: string;
  mime: (typeof ATTACHMENT_MIME)[number];
  size: number;
  sha256: string;
}

export interface Header {
  v: 1;
  /** Random 16 bytes (hex), for de-duplication. */
  id: string;
  type: MessageType;
  /** Recipient `mailbox_id` (hex). */
  to: string;
  from: { role: Party; mailbox_pk: string };
  /** Seconds since the epoch. */
  sent_at: number;
  /** The deal's fingerprint N (hex), where the type is about one deal. */
  n?: string;
  body: Record<string, unknown>;
  attachments: Attachment[];
  /** Ed25519 public key (hex) of the signer, and the signature (hex), where the type requires it. */
  signer?: string;
  sig?: string;
}

// ---------- field checks ----------

type Check = (x: unknown) => boolean;
const hex = (bytes: number): Check => (x) => typeof x === "string" && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(x);
const b64url: Check = (x) => typeof x === "string" && x.length > 0 && x.length <= 48 * 1024 && /^[A-Za-z0-9_-]+$/.test(x);
const uint: Check = (x) => Number.isSafeInteger(x) && (x as number) >= 0;
const pos: Check = (x) => Number.isSafeInteger(x) && (x as number) > 0;
const cls: Check = (x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 7;
const text = (max: number): Check => (x) => typeof x === "string" && x.length > 0 && x.length <= max;
const list = (item: Check, min: number, max: number): Check => (x) => Array.isArray(x) && x.length >= min && x.length <= max && x.every(item);
const oneOf = (...vals: unknown[]): Check => (x) => vals.includes(x);
const H32 = hex(32);
const nav: Check = (x) => {
  const n = x as Record<string, unknown>;
  return typeof x === "object" && x !== null && Object.keys(n).length === 2 && pos(n.assets_zat) && pos(n.units);
};
const fundPath: Check = (x) => typeof x === "string" && x.length % 82 === 0 && x.length <= 82 * 40 && /^[0-9a-f]*$/.test(x);

interface Spec {
  /** DFD level-2 flows (process numbers) this type carries; vault Format Data maps them. */
  flows: string;
  from: Party[];
  to: Party[];
  n: "required" | "optional" | "none";
  body: Record<string, { check: Check; optional?: boolean }>;
  attachments: { min: number; max: number };
  signer: Signer;
}

const req = (check: Check) => ({ check });
const opt = (check: Check) => ({ check, optional: true });

export const TYPES = {
  "key.invoice_pk": {
    flows: "2.1 → 2.2, 2.4",
    from: ["buyer"], to: ["supplier"], n: "none",
    body: { invoice_pk: req(H32) },
    attachments: { min: 0, max: 0 }, signer: "buyer-invoice-key",
  },
  "invoice.sign_request": {
    flows: "2.5 → 2.6",
    from: ["supplier"], to: ["buyer"], n: "required",
    body: { invoice: req(b64url) },
    attachments: { min: 1, max: 1 }, signer: "supplier",
  },
  "invoice.signature": {
    flows: "2.7 → 2.8",
    from: ["buyer"], to: ["supplier"], n: "required",
    body: { buyer_signature: req(hex(64)) },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "deal.offer": {
    flows: "SEQ-03 bagian 1 → 3.1",
    from: ["supplier"], to: ["financier"], n: "required",
    body: { invoice: req(b64url), buyer_signature: req(hex(64)), advance_zat: req(pos), supplier_address: req(text(512)), buyer_mailbox_pk: opt(H32) },
    attachments: { min: 0, max: 1 }, signer: "supplier",
  },
  "deal.decline": {
    flows: "HNK-26.T6, N-15: financier to supplier, the offer is outside its terms",
    from: ["financier"], to: ["supplier"], n: "required",
    body: { reason: req(text(200)) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "deal.commitment_opening": {
    flows: "3.2 → 3.6",
    from: ["financier"], to: ["supplier"], n: "required",
    body: { financier_pk: req(H32), salt: req(H32), discount: opt(cls), tenor: opt(cls) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "deal.entry_request": {
    flows: "3.5 → 3.6",
    from: ["financier"], to: ["supplier"], n: "required",
    body: { financier_pk: req(H32), history_tag: opt(H32) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "deal.entry": {
    flows: "3.6 → 3.7",
    from: ["supplier"], to: ["financier"], n: "required",
    body: { memo: req(b64url) },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "deal.letter": {
    flows: "4.1 → 4.2, 4.3",
    from: ["financier"], to: ["supplier", "buyer"], n: "required",
    body: { letter: req(b64url) },
    attachments: { min: 1, max: 1 }, signer: "financier",
  },
  "deal.seal": {
    flows: "4.2 → 4.3, 4.4; 4.3 → 4.4, 4.8; 4.7 → 4.8; 5.1",
    from: ["supplier", "buyer", "financier"], to: ["supplier", "buyer", "financier"], n: "required",
    body: { seal: req(b64url), index: req(oneOf(0, 1, 2)) },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "deal.advance": {
    flows: "4.7 → 4.8",
    from: ["financier"], to: ["supplier"], n: "required",
    body: { txid: req(H32), advance_zat: req(pos) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "deal.bundle": {
    flows: "5.5 → 5.6 (HNK-26.T18)",
    from: ["financier"], to: ["supplier", "buyer"], n: "required",
    body: { bundle: req(b64url) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "history.request": {
    flows: "6.1 → 6.2",
    from: ["financier"], to: ["buyer"], n: "optional",
    body: { financier_pk: req(H32), nonce: req(hex(16)) },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "history.chain": {
    flows: "6.3 → 6.4; 6.3 → supplier (sertifikat k)",
    from: ["buyer"], to: ["financier", "supplier"], n: "optional",
    body: { certs: req(list(b64url, 1, 64)), identity_pk: opt(H32) },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "fund.receipt": {
    flows: "9.1 → 9.7 (D-49: units at the period's NAV, the withdraw token of the new units)",
    from: ["fund"], to: ["member"], n: "none",
    body: { period: req(pos), deposit_txid: req(H32), amount_zat: req(pos), units: req(pos), nav: req(nav), withdraw_token: req(H32) },
    attachments: { min: 0, max: 0 }, signer: "fund",
  },
  "fund.merkle_path": {
    flows: "9.6 → 9.7 (HNK-15.T1: a leaf of the unit sum tree, root and total as in JTLR)",
    from: ["fund"], to: ["member"], n: "none",
    body: { period: req(pos), leaf_id: req(H32), units: req(pos), root: req(H32), total: req(pos), path: req(fundPath) },
    attachments: { min: 0, max: 0 }, signer: "fund",
  },
  "fund.withdraw": {
    flows: "D-49 (HNK-30.T23): member to fund, paid at the end of the period",
    from: ["member"], to: ["fund"], n: "none",
    body: { withdraw_token: req(H32), units: req((x) => x === "all" || pos(x)), address: req(text(512)), period: req(pos) },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "fund.payout": {
    flows: "D-49 (HNK-30.T23): fund to member after the close; the new token holds what is left",
    from: ["fund"], to: ["member"], n: "none",
    body: { period: req(pos), leaf_id: req(H32), units: req(pos), amount_zat: req(pos), nav: req(nav), txid: req(H32), next_token: opt(H32) },
    attachments: { min: 0, max: 0 }, signer: "fund",
  },
  "financier.apply": {
    flows: "D-46 B (HNK-26.T25): applicant to node provider",
    from: ["applicant"], to: ["provider"], n: "none",
    body: { name: req(text(80)), contact: req(text(120)), note: opt(text(1000)), list: opt((x) => typeof x === "boolean") },
    attachments: { min: 0, max: 0 }, signer: "none",
  },
  "financier.listing": {
    flows: "D-47 (HNK-30.T19): financier node to node provider, the public mandate for the directory",
    from: ["financier"], to: ["provider"], n: "none",
    body: {
      name: req(text(60)),
      contact: req(text(400)),
      mandate: req((x) => {
        const m = x as Record<string, unknown>;
        return typeof x === "object" && x !== null && Number.isSafeInteger(m.min_zat) && Number.isSafeInteger(m.max_zat) && Number.isSafeInteger(m.max_tenor_days) && typeof m.buyer_kyc === "boolean";
      }),
    },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "financier.reputation_request": {
    flows: "D-48 (HNK-30.T21): financier node to node provider, (N, salt) of its deals for attestation",
    from: ["financier"], to: ["provider"], n: "none",
    body: {
      deals: req((x) => Array.isArray(x) && x.length <= 10_000 && x.every((d) => typeof d === "object" && d !== null && /^[0-9a-f]{64}$/.test((d as Record<string, string>).n ?? "") && /^[0-9a-f]{64}$/.test((d as Record<string, string>).salt ?? ""))),
    },
    attachments: { min: 0, max: 0 }, signer: "financier",
  },
  "financier.invite": {
    flows: "D-46 B (HNK-26.T25): node provider to applicant",
    from: ["provider"], to: ["applicant"], n: "none",
    body: { link: req(text(300)) },
    attachments: { min: 0, max: 0 }, signer: "provider",
  },
} satisfies Record<string, Spec>;

export type MessageType = keyof typeof TYPES;

export function isMessageType(x: unknown): x is MessageType {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(TYPES, x);
}

// ---------- canonical bytes ----------

/** JSON with object keys sorted and no whitespace; the bytes that get signed. */
export function canonicalJson(x: unknown): string {
  if (x === null || typeof x === "boolean" || typeof x === "string") return JSON.stringify(x);
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new Error("numbers in a message must be finite");
    return JSON.stringify(x);
  }
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(",")}]`;
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported value in a message");
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

/** The signed bytes: a domain tag, then the canonical header without `sig`. */
export function signingBytes(h: Header): Uint8Array<ArrayBuffer> {
  const { sig: _sig, ...rest } = h;
  return enc.encode(SIG_DOMAIN + canonicalJson(rest));
}

function toHex(b: ArrayBuffer | Uint8Array): string {
  return Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

function fromHex(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));
}

async function sha256(b: Uint8Array): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(b)));
}

// ---------- validation ----------

/** Everything wrong with `h` against its type; empty when the header is well formed. */
export function headerProblems(h: unknown): string[] {
  const p: string[] = [];
  if (typeof h !== "object" || h === null || Array.isArray(h)) return ["header is not an object"];
  const x = h as Record<string, unknown>;
  const allowed = ["v", "id", "type", "to", "from", "sent_at", "n", "body", "attachments", "signer", "sig"];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) p.push(`unknown header field "${k}"`);
  if (x.v !== VERSION) p.push(`unsupported message version ${String(x.v)}`);
  if (!hex(16)(x.id)) p.push("id must be 32 hex characters");
  if (!isMessageType(x.type)) return [...p, `unsupported message type "${String(x.type)}"`];
  const spec: Spec = TYPES[x.type];
  if (!H32(x.to)) p.push("to must be a mailbox_id (64 hex characters)");
  const from = x.from as Record<string, unknown> | undefined;
  if (!from || typeof from !== "object") p.push("from is missing");
  else {
    if (!spec.from.includes(from.role as Party)) p.push(`${x.type} cannot come from ${String(from.role)}`);
    if (!H32(from.mailbox_pk)) p.push("from.mailbox_pk must be 64 hex characters");
    for (const k of Object.keys(from)) if (k !== "role" && k !== "mailbox_pk") p.push(`unknown from field "${k}"`);
  }
  if (!uint(x.sent_at)) p.push("sent_at must be whole seconds");
  if (spec.n === "required" && !H32(x.n)) p.push(`${x.type} needs n (64 hex characters)`);
  if (spec.n === "none" && x.n !== undefined) p.push(`${x.type} carries no n`);
  if (spec.n === "optional" && x.n !== undefined && !H32(x.n)) p.push("n must be 64 hex characters");
  const body = x.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || Array.isArray(body)) p.push("body is missing");
  else {
    for (const [k, f] of Object.entries(spec.body)) {
      if (body[k] === undefined) {
        if (!f.optional) p.push(`${x.type} body needs "${k}"`);
      } else if (!f.check(body[k])) p.push(`${x.type} body "${k}" is not valid`);
    }
    for (const k of Object.keys(body)) if (!(k in spec.body)) p.push(`unknown ${x.type} body field "${k}"`);
    if (("discount" in body) !== ("tenor" in body) && "discount" in spec.body) p.push("give both classes, or neither");
  }
  const att = x.attachments;
  if (!Array.isArray(att)) p.push("attachments must be a list");
  else {
    if (att.length < spec.attachments.min || att.length > spec.attachments.max) {
      p.push(`${x.type} takes ${spec.attachments.min === spec.attachments.max ? spec.attachments.min : `${spec.attachments.min} to ${spec.attachments.max}`} attachment(s), got ${att.length}`);
    }
    for (const a of att as Array<Record<string, unknown>>) {
      if (!text(200)(a?.name)) p.push("attachment name is missing");
      if (!ATTACHMENT_MIME.includes(a?.mime as never)) p.push(`attachment type ${String(a?.mime)} is not allowed (PDF only)`);
      if (!uint(a?.size)) p.push("attachment size is missing");
      else if ((a.size as number) > MAX_ATTACHMENT) p.push(`attachment "${String(a.name)}" is larger than 2 MiB`);
      if (!H32(a?.sha256)) p.push("attachment sha256 must be 64 hex characters");
    }
  }
  if (spec.signer === "none") {
    if (x.signer !== undefined || x.sig !== undefined) p.push(`${x.type} is not signed (its body carries its own signature)`);
  } else {
    if (!H32(x.signer)) p.push(`${x.type} must name its signer key`);
    if (!hex(64)(x.sig)) p.push(`${x.type} must be signed`);
    if (spec.signer === "financier" && body && "financier_pk" in body && body.financier_pk !== x.signer) p.push("signer is not the financier named in the body");
    if (spec.signer === "buyer-invoice-key" && body && body.invoice_pk !== x.signer) p.push("signer is not the invoice key in the body");
  }
  return p;
}

// ---------- encode / decode ----------

export interface Message {
  header: Header;
  attachments: Uint8Array[];
}

export interface File {
  name: string;
  mime: Attachment["mime"];
  bytes: Uint8Array;
}

/** The header entries for `files` (name, type, size, SHA-256), in order. Put them in the header before signing. */
export async function describeFiles(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files) out.push({ name: f.name, mime: f.mime, size: f.bytes.length, sha256: await sha256(f.bytes) });
  return out;
}

/**
 * Builds the plaintext from a complete header (attachments described with `describeFiles`, and
 * signed when its type needs it) and the attachment bytes, which must match the header.
 */
export async function encodeMessage(h: Header, files: File[] = []): Promise<Uint8Array> {
  const described = await describeFiles(files);
  if (canonicalJson(described) !== canonicalJson(h.attachments ?? [])) throw new Error("attachments do not match the header");
  const problems = headerProblems(h);
  if (problems.length) throw new Error(problems.join("; "));
  const json = enc.encode(JSON.stringify(h));
  if (json.length > MAX_HEADER) throw new Error("message header is larger than 64 KiB");
  const total = 9 + json.length + files.reduce((s, f) => s + f.bytes.length, 0);
  const out = new Uint8Array(total);
  out.set(enc.encode(MAGIC), 0);
  out[4] = VERSION;
  new DataView(out.buffer).setUint32(5, json.length);
  out.set(json, 9);
  let at = 9 + json.length;
  for (const f of files) {
    out.set(f.bytes, at);
    at += f.bytes.length;
  }
  return out;
}

/**
 * Reads and checks a plaintext. `expectTo` is the reader's own `mailbox_id`: a message sealed to
 * this mailbox but addressed to another one is refused.
 */
export async function decodeMessage(bytes: Uint8Array, expectTo?: string): Promise<Message> {
  if (bytes.length > MAX_PLAINTEXT) throw new Error("message is larger than the relay allows");
  if (bytes.length < 9 || dec.decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error("not a JitsuinFi message");
  if (bytes[4] !== VERSION) throw new Error(`unsupported message version ${bytes[4]}`);
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5);
  if (len === 0 || len > MAX_HEADER || 9 + len > bytes.length) throw new Error("message header length is not valid");
  let header: unknown;
  try {
    header = JSON.parse(dec.decode(bytes.subarray(9, 9 + len)));
  } catch {
    throw new Error("message header is not valid JSON");
  }
  const problems = headerProblems(header);
  if (problems.length) throw new Error(problems.join("; "));
  const h = header as Header;
  if (expectTo !== undefined && h.to !== expectTo) throw new Error("message is addressed to another mailbox");
  const attachments: Uint8Array[] = [];
  let at = 9 + len;
  for (const a of h.attachments) {
    if (at + a.size > bytes.length) throw new Error(`attachment "${a.name}" is cut short`);
    const part = bytes.slice(at, at + a.size);
    if ((await sha256(part)) !== a.sha256) throw new Error(`attachment "${a.name}" does not match its hash`);
    attachments.push(part);
    at += a.size;
  }
  if (at !== bytes.length) throw new Error("message has trailing bytes");
  return { header: h, attachments };
}

// ---------- signatures (Ed25519, WebCrypto) ----------

/** Signs a complete header (attachments included) with an Ed25519 private key; sets `signer` and `sig`. */
export async function signHeader(h: Omit<Header, "sig" | "signer">, key: CryptoKey, publicKeyHex: string): Promise<Header> {
  const withSigner = { ...h, signer: publicKeyHex } as Header;
  const sig = await globalThis.crypto.subtle.sign("Ed25519", key, signingBytes(withSigner));
  return { ...withSigner, sig: toHex(sig) };
}

/**
 * True when `h.sig` is a valid Ed25519 signature by `h.signer`. Unsigned types return true only
 * when they carry no signature. `expectedSigner`, when given, must equal `h.signer` (for example
 * the financier key of the deal, or the invoice's `supplier_pk`).
 */
export async function verifyHeader(h: Header, expectedSigner?: string): Promise<boolean> {
  if (TYPES[h.type].signer === "none") return h.sig === undefined && h.signer === undefined;
  if (!h.signer || !h.sig) return false;
  if (expectedSigner !== undefined && expectedSigner !== h.signer) return false;
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", fromHex(h.signer), "Ed25519", false, ["verify"]);
    return await globalThis.crypto.subtle.verify("Ed25519", key, fromHex(h.sig), signingBytes(h));
  } catch {
    return false;
  }
}

/** A fresh message id. */
export function newMessageId(): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}
