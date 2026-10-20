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
