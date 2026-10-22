// The buyer's own history chain on this device (HNK-25.T2, P-09): the certificates it issued, in
// order, kept in the encrypted deal store under one id. The next invoice index `k` comes from
// this chain, checked against the board when board data is given (wasm `historyNext`), instead of
// being typed. Pure data, no wasm: tests run it under Node.

export const HISTORY_ID = "history";

export interface HistoryDoc {
  /** History certificates, base64url, certificate i at position i. */
  certs: string[];
}

export function emptyHistory(): HistoryDoc {
  return { certs: [] };
}

/** Next index from this device alone (each stored certificate counted as anchored). */
export function localNextIndex(h: HistoryDoc): number {
  return h.certs.length;
}

/** The last certificate (the one the next certificate links to), or "" for an empty history. */
export function head(h: HistoryDoc): string {
  return h.certs.at(-1) ?? "";
}

/** Adds certificate `index`; it must be the next one, so the stored chain never has gaps. */
export function append(h: HistoryDoc, index: number, cert: string): HistoryDoc {
  if (index !== h.certs.length) throw new Error(`certificate ${index} is not the next one in your history (#${h.certs.length})`);
  return { certs: [...h.certs, cert] };
}

/**
 * Drops trailing certificates that were never anchored on the board (wasm `historyNext` lists
 * their indices). Only a trailing run may be dropped.
 */
export function dropTail(h: HistoryDoc, dropped: number[]): HistoryDoc {
  if (dropped.length === 0) return h;
  const from = Math.min(...dropped);
  const expected = h.certs.map((_, i) => i).filter((i) => i >= from);
  if (expected.length !== dropped.length || expected.some((i, j) => i !== [...dropped].sort((a, b) => a - b)[j])) {
    throw new Error("only the newest certificates can be dropped");
  }
  return { certs: h.certs.slice(0, from) };
}

/**
 * The relay copy of the chain (HNK-25.T2, BL-D26-03), sealed to the buyer's own mailbox key, so
 * another device signed in with the same passkey gets the certificates back. Its head is the last
 * certificate, signed by the identity key and linked to the previous one: the relay cannot forge
 * a chain, only hold back its newest certificates, which `reconcile` and the board check catch.
 */
export function encodeBackup(h: HistoryDoc): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, certs: h.certs }));
}

export function decodeBackup(b: Uint8Array): HistoryDoc {
  const o = JSON.parse(new TextDecoder().decode(b)) as { v?: unknown; certs?: unknown };
  if (o.v !== 1 || !Array.isArray(o.certs) || !o.certs.every((c) => typeof c === "string" && /^[A-Za-z0-9_-]+$/.test(c))) {
    throw new Error("the relay copy of your history is not readable");
  }
  return { certs: o.certs as string[] };
}

export type Reconciled =
  /** Both hold the same chain. */
  | { kind: "same"; doc: HistoryDoc }
  /** The relay holds newer certificates of this chain (another device issued them). */
  | { kind: "restored"; doc: HistoryDoc; added: number }
  /** The relay holds fewer certificates than this device: it lost or held back the newest. */
  | { kind: "relay-behind"; doc: HistoryDoc; missing: number }
  /** The two chains differ at some index, or the relay copy is not this buyer's: keep this device's. */
  | { kind: "diverged"; doc: HistoryDoc };

/** Compares this device's chain with the relay copy; `identityPk` is the buyer's identity key. */
export function reconcile(local: HistoryDoc, remote: HistoryDoc, identityPk: string): Reconciled {
  const mine = remote.certs.every((c, i) => {
    try {
      const f = certFields(c);
      return f.index === i && f.identity_pk === identityPk;
    } catch {
      return false;
    }
  });
  const n = Math.min(local.certs.length, remote.certs.length);
  if (!mine || local.certs.slice(0, n).some((c, i) => c !== remote.certs[i])) return { kind: "diverged", doc: local };
  if (remote.certs.length > local.certs.length) return { kind: "restored", doc: remote, added: remote.certs.length - local.certs.length };
  if (remote.certs.length < local.certs.length) return { kind: "relay-behind", doc: local, missing: local.certs.length - remote.certs.length };
  return { kind: "same", doc: local };
}

/** The public fields of one history certificate (JTSH v1, jitsuin-core `HistoryCert`). */
export interface CertFields {
  index: number;
  nullifier: string;
  amount_zat: number;
  due_date: number;
  financier_pk: string;
  identity_pk: string;
}

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Reads a certificate (base64url): magic, version, index, keys, N, amount, due date, financier, prev, identity, signature. */
export function certFields(b64: string): CertFields {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (b.length < 213 || String.fromCharCode(...b.slice(0, 4)) !== "JTSH") throw new Error("not a history certificate");
  const v = new DataView(b.buffer);
  return {
    index: v.getUint32(5, true),
    nullifier: hexOf(b.slice(73, 105)),
    amount_zat: Number(v.getBigUint64(105, true)),
    due_date: v.getUint32(113, true),
    financier_pk: hexOf(b.slice(117, 149)),
    identity_pk: hexOf(b.slice(181, 213)),
  };
}
