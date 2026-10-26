// A key shown to people (user feedback 2026-10-26 B: no hex on the supplier's pages): the first
// 10 bytes of the key in the fingerprint format of the app (account.ts `fingerprint`: base32, four
// groups of four), so a buyer's invoice key or a mailbox reads as "KX3Q-7MAB-2VDE-SVJG" and can
// be compared by phone like a role fingerprint. Pure: tests run it under Node.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function readablePrint(hex: string): string {
  const h = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{20,}$/.test(h)) return "";
  const bytes = Uint8Array.from(h.slice(0, 20).match(/../g)!, (b) => parseInt(b, 16));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join("-");
}
