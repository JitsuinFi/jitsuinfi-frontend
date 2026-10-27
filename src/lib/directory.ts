// The financier directory (HNK-30.T18 – T20, D-47): the financiers that chose to be listed, signed
// by the node provider (jitsuinfi-node `directory.rs`). The supplier's browser checks the
// signature, then matches the open invoice against each public mandate here, locally: nothing
// about the invoice leaves the page. The offer then goes sealed to one financier.
import { canonicalJson } from "./relay-message.ts";

export interface Mandate {
  min_zat: number;
  max_zat: number;
  max_tenor_days: number;
  buyer_kyc: boolean;
  /** The share of an invoice it typically advances (0–1), when the listing gives one: the offer form prefills from it. */
  advance_ratio?: number;
}

/** The provider's attested record (HNK-30.T21, D-48): coarse classes only. */
export interface Reputation {
  settled: "1-4" | "5-19" | "20+";
  on_time: "95+" | "80-95" | "<80";
  up_to_height: number;
  attested_at: number;
}

export interface Listing {
  name: string;
  contact: string;
  financier_pk: string;
  mandate: Mandate;
  listed_at: number;
  reputation?: Reputation;
}

/** How a listing's record reads to a supplier. */
export function recordLine(l: Listing): string {
  const r = l.reputation;
  return r ? `${r.settled} deals settled, ${r.on_time}% on time (attested by the node provider up to block ${r.up_to_height})` : "No attested record yet";
}

export interface Directory {
  v: 1;
  kind: "jitsuin.directory";
  issued_at: number;
  financiers: Listing[];
  signer: string;
  sig: string;
}

const DOMAIN = "JitsuinDirectory_v1\n";
const hexBytes = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));

/** True when `d` is a directory signed by `signer` (hex), as the node signs it. */
export async function verifyDirectory(d: Directory, signer: string): Promise<boolean> {
  if (d?.kind !== "jitsuin.directory" || d.signer !== signer || !/^[0-9a-f]{128}$/.test(d.sig ?? "")) return false;
  const { sig, ...rest } = d;
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", hexBytes(signer), "Ed25519", false, ["verify"]);
    return await globalThis.crypto.subtle.verify("Ed25519", key, hexBytes(sig), new TextEncoder().encode(DOMAIN + canonicalJson(rest)));
  } catch {
    return false;
  }
}

export interface Fit {
  listing: Listing;
  fits: boolean;
  /** Why it does not fit, in the supplier's words; empty when it fits. */
  misses: string[];
  /** Spare tenor days: the smaller, the closer the financier's mandate is to this invoice. */
  slack: number;
}

/**
 * Each listing against an invoice of `amount_zat` that runs `tenor_days` from today: fitting
 * financiers first, the closest mandate first, then by name. Runs in the browser only.
 */
export function rank(list: Listing[], amount_zat: number, tenor_days: number): Fit[] {
  return list
    .map((l) => {
      const m = l.mandate;
      const misses = [
        amount_zat < m.min_zat ? "the invoice is below its smallest amount" : null,
        amount_zat > m.max_zat ? "the invoice is above its largest amount" : null,
        tenor_days > m.max_tenor_days ? `it finances at most ${m.max_tenor_days} days` : null,
      ].filter((x): x is string => x !== null);
      return { listing: l, fits: misses.length === 0, misses, slack: m.max_tenor_days - tenor_days };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || (a.fits ? a.slack - b.slack : 0) || a.listing.name.localeCompare(b.listing.name));
}
