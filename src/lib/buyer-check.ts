// The buyer's checks before signing an invoice (HNK-25.T1, BL-D22-06): the terms PDF matches the
// invoice's document hash, and the invoice is addressed to one of the buyer's invoice keys. Signing
// stays off until both hold. Pure data, no wasm: tests run it under Node.

export interface CheckInput {
  /** `terms_hash` from the decoded invoice (hex). */
  termsHash: string;
  /** Hash of the PDF the buyer chose (hex), or null when no file was chosen. */
  fileHash: string | null;
  /** Index k of the buyer key the invoice is addressed to, or null when it is none of them. */
  keyIndex: number | null;
  /**
   * Other invoices on this device signed with the same key (messy-state E2E 2026-10-27): a key is
   * for one invoice, so only one of them can be financed.
   */
  sameKey?: string[];
}

export interface CheckResult {
  canSign: boolean;
  kind: "ok" | "warn" | "bad";
  title: string;
  text: string;
  rows: Array<[string, string]>;
}

export function checkInvoice(c: CheckInput): CheckResult {
  const hashOk = c.fileHash !== null && c.fileHash.toLowerCase() === c.termsHash.toLowerCase();
  const keyOk = c.keyIndex !== null;
  const rows: Array<[string, string]> = [
    ["Terms PDF", c.fileHash === null ? "not chosen" : hashOk ? "matches the invoice" : "does not match the invoice"],
    ["Addressed to", keyOk ? "you" : "a key that is not yours"],
  ];
  if (!keyOk) {
    return { canSign: false, kind: "bad", title: "Not addressed to you", text: "This invoice names a buyer key that is not one of yours. Do not sign it; ask the supplier for your key.", rows };
  }
  if (c.fileHash === null) {
    return { canSign: false, kind: "warn", title: "Add the terms PDF", text: "Choose the PDF the supplier sent, so you sign the terms you read and not just a number.", rows };
  }
  if (!hashOk) {
    return { canSign: false, kind: "bad", title: "The PDF is not the invoiced document", text: "Its fingerprint differs from the one in the invoice. Ask the supplier for the exact file before signing.", rows };
  }
  if (c.sameKey?.length) {
    const ids = c.sameKey.join(", ");
    rows[1] = ["Addressed to", `you, with a key already used on ${ids}`];
    return {
      canSign: true,
      kind: "warn",
      title: `Key #${c.keyIndex} is on ${c.sameKey.length > 1 ? "other invoices" : "another invoice"} already`,
      text: `You signed ${ids} with this key. A key is for one invoice: only one invoice per key can be financed, the first one a financier registers. Sign this one only if ${c.sameKey.length > 1 ? "those are" : "that one is"} not going to a financier; otherwise ask this supplier to wait for your next key, which comes once ${c.sameKey.length > 1 ? "one of them" : ids} is financed.`,
      rows,
    };
  }
  return { canSign: true, kind: "ok", title: "Ready to sign", text: "The PDF is the invoiced document and the invoice is addressed to your key.", rows };
}

/**
 * The invoices on this device signed with key #`k`, other than `n` (messy-state E2E 2026-10-27:
 * two suppliers were given the same next key and both invoices were signed without a word).
 */
export function signedWithKey(k: number, n: string, list: ReadonlyArray<{ n: string; key_index: number; invoice_id: string; signature?: string }>): string[] {
  return list.filter((x) => x.n !== n && x.key_index === k && !!x.signature).map((x) => x.invoice_id);
}
