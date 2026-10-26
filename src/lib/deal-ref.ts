// The deal's address in the app (IA port, user decision 2026-10-26): /supplier/deal/<ref>, where
// <ref> is a random id made on this device and kept in the deal's encrypted record. It is not the
// invoice number and not N, so no invoice data lands in the browser's history, its address bar or
// a shared screenshot of it. Pure: tests run it under Node.

const B32 = "abcdefghijkmnpqrstuvwxyz23456789"; // no l, o, 0, 1: read aloud without mistakes

/** A new ref: 10 characters from 50 random bits. */
export function newRef(random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const b = random(7);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const x of b) {
    value = (value << 8) | x;
    bits += 8;
    while (bits >= 5 && out.length < 10) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export const isRef = (x: unknown): x is string => typeof x === "string" && /^[a-km-np-z2-9]{10}$/.test(x);

/**
 * Gives every deal without a ref (made before refs existed) a fresh one, unique among `deals`.
 * Returns the deals and the ones that changed, to save.
 */
export function withRefs<T extends { ref?: string }>(deals: T[], random?: (n: number) => Uint8Array): { deals: Array<T & { ref: string }>; changed: Array<T & { ref: string }> } {
  const used = new Set(deals.map((d) => d.ref).filter(isRef));
  const changed: Array<T & { ref: string }> = [];
  const out = deals.map((d) => {
    if (isRef(d.ref)) return d as T & { ref: string };
    let r = newRef(random);
    while (used.has(r)) r = newRef(random);
    used.add(r);
    const n = { ...d, ref: r };
    changed.push(n);
    return n;
  });
  return { deals: out, changed };
}

/** The deal at `ref`, or undefined (a ref from another device or a deleted deal). */
export function byRef<T extends { ref?: string }>(deals: readonly T[], ref: string | undefined): T | undefined {
  return ref ? deals.find((d) => d.ref === ref) : undefined;
}

/** The path of a deal, and of one of its stations. */
export function dealPath(ref: string): string {
  if (!isRef(ref)) throw new Error("not a deal ref");
  return `/supplier/deal/${ref}`;
}

/** The buyer's open invoice (the 請求書 or the letter on the desk) and its 払込票 slip under Pay. */
export function invoicePath(ref: string): string {
  if (!isRef(ref)) throw new Error("not an invoice ref");
  return `/buyer/invoices/${ref}`;
}
export function slipPath(ref: string): string {
  if (!isRef(ref)) throw new Error("not an invoice ref");
  return `/buyer/pay/${ref}`;
}
