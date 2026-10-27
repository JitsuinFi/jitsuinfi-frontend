// The buyer's open invoice follows its stored record (judge run 2, finding 1): the sheet's codes
// (the invoice, the assignment letter, the supplier's seal) are fields the buyer may also fill by
// hand. When the record changes while the sheet is open (a letter or a seal kept from the inbox),
// every field that still shows what was stored before takes the new stored value; a field the
// buyer changed by hand keeps what they typed. Pure: tests run it under Node.

export interface Codes {
  inv: string;
  letter: string;
  seal: string;
}

/** The codes a stored invoice record carries (all empty without one). */
export function storedCodes(r: { invoice?: string; assignment?: { letter?: string; supplier_seal?: string } } | undefined): Codes {
  return { inv: r?.invoice ?? "", letter: r?.assignment?.letter ?? "", seal: r?.assignment?.supplier_seal ?? "" };
}

/**
 * The fields' new values after the stored record went from `was` to `stored`, given what the
 * fields hold `now`; null when nothing is to change.
 */
export function syncedCodes(was: Codes, stored: Codes, now: Codes): Codes | null {
  const pick = (k: keyof Codes) => (stored[k] !== was[k] && (now[k] === was[k] || now[k] === "") ? stored[k] : now[k]);
  const next: Codes = { inv: pick("inv"), letter: pick("letter"), seal: pick("seal") };
  return next.inv === now.inv && next.letter === now.letter && next.seal === now.seal ? null : next;
}
