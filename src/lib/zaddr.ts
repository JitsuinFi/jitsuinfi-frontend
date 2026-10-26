// The shielded address the supplier pastes for the advance (judge run 2, finding 7): the app does
// not hold the supplier's wallet, so the address comes from the wallet app; it is checked here
// before the offer goes out, in plain words: the right network, shielded (not a transparent t…
// address), copied whole (its Bech32m / Bech32 checksum holds). Pure: tests run it under Node.
import { NETWORK, shieldedPrefixes, type Network } from "./network.ts";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32 = 1;
const BECH32M = 0x2bc830a3;

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** The checksum constant a Bech32 string's checksum ends in (1: Bech32, BECH32M: Bech32m), or null. */
export function bech32Kind(s: string): "bech32" | "bech32m" | null {
  const at = s.lastIndexOf("1");
  if (at < 1 || at + 7 > s.length) return null;
  const hrp = s.slice(0, at);
  const data: number[] = [];
  for (const c of s.slice(at + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    data.push(v);
  }
  const p = polymod([...hrpExpand(hrp), ...data]);
  return p === BECH32 ? "bech32" : p === BECH32M ? "bech32m" : null;
}

/** Writes a Bech32 / Bech32m string (for the tests: a valid address of any shape). */
export function bech32Encode(hrp: string, data: number[], kind: "bech32" | "bech32m"): string {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ (kind === "bech32" ? BECH32 : BECH32M);
  const chk = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...chk].map((v) => CHARSET[v]).join("")}`;
}

/** Why `address` cannot take the advance on `net`, in one plain sentence; null when it can. */
export function addressProblem(address: string, net: Network = NETWORK): string | null {
  const a = address.trim();
  const [unified, sapling] = shieldedPrefixes(net);
  const other = shieldedPrefixes(net === "main" ? "test" : "main");
  if (!a) return `Paste your shielded address from your wallet app (it starts with ${unified}…).`;
  if (/\s/.test(a)) return "The address has a space or a line break in it: copy it again from your wallet, in one piece.";
  if (/^t[1m3n]/i.test(a) || /^tex1/i.test(a)) return `This is a transparent address (t…): anyone could see the advance. Use your shielded address (${unified}…) from the same wallet.`;
  if (other.some((p) => a.toLowerCase().startsWith(p)) && !a.toLowerCase().startsWith(unified)) return `This address is for ${net === "main" ? "testnet" : "mainnet"}; this app runs on ${net === "main" ? "mainnet" : "testnet"}. Use an address that starts with ${unified}….`;
  if (a !== a.toLowerCase()) return "Copy the address exactly as your wallet shows it: in small letters.";
  const p = [unified, sapling].find((x) => a.startsWith(x));
  if (!p) return `This is not a Zcash shielded address: it should start with ${unified}….`;
  const kind = bech32Kind(a);
  const want = p === unified ? "bech32m" : "bech32";
  if (kind !== want || a.length < p.length + 30) return "This address is cut or mistyped: a letter is missing or changed. Copy it again from your wallet, in one piece.";
  return null;
}
