// The fund's Merkle sum tree of units (HNK-15.T1, D-49), checked in the member's browser: the
// same hashing as jitsuin-core `units.rs` (vector tests/vectors/units.json). A member checks that
// their leaf, with their units, is under the root the manager signed into JTLR, and that the
// sums add up to its total, so no unit of theirs was dropped from the period's liabilities.
// Self-contained (WebCrypto only): tests run it under Node.

const enc = new TextEncoder();
const LEAF = enc.encode("jitsuin-fund-leaf-v1");
const NODE = enc.encode("jitsuin-fund-node-v1");
export const STEP_LEN = 41;
export const MAX_DEPTH = 40;
const MAX = (1n << 64n) - 1n;

export const fromHex = (s: string): Uint8Array<ArrayBuffer> => {
  if (!/^([0-9a-f]{2})*$/.test(s)) throw new Error("not hex");
  return new Uint8Array(s.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
};
export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const le8 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", all));
}

/** The leaf id a withdraw token opens. */
export async function leafId(tokenHex: string): Promise<string> {
  return toHex(await sha256(LEAF, fromHex(tokenHex)));
}

export interface Step {
  sibling: Uint8Array;
  sum: bigint;
  /** The sibling is on the right. */
  right: boolean;
}

export function parsePath(hex: string): Step[] {
  const b = fromHex(hex);
  if (b.length % STEP_LEN || b.length / STEP_LEN > MAX_DEPTH) throw new Error("not a fund path");
  const steps: Step[] = [];
  for (let i = 0; i < b.length; i += STEP_LEN) {
    const side = b[i + 40];
    if (side > 1) throw new Error("not a fund path");
    steps.push({ sibling: b.slice(i, i + 32), sum: new DataView(b.buffer, i + 32, 8).getBigUint64(0, true), right: side === 1 });
  }
  return steps;
}

/** True when `units` under `leafIdHex` sit in the tree with this root and total. */
export async function verifyPath(leafIdHex: string, units: bigint, pathHex: string, rootHex: string, total: bigint): Promise<boolean> {
  let steps: Step[];
  try {
    steps = parsePath(pathHex);
  } catch {
    return false;
  }
  let hash = await sha256(LEAF, fromHex(leafIdHex), le8(units));
  let sum = units;
  for (const s of steps) {
    const next = sum + s.sum;
    if (next > MAX) return false;
    hash = s.right ? await sha256(NODE, hash, le8(sum), s.sibling, le8(s.sum)) : await sha256(NODE, s.sibling, le8(s.sum), hash, le8(sum));
    sum = next;
  }
  return toHex(hash) === rootHex && sum === total;
}
