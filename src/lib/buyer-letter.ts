// The buyer's checks before sealing an assignment letter (HNK-32.T1, BL-D24-06), the same as the
// supplier's (I-HNK-24.3): the letter is for this invoice, the PDF is the letter's document, and
// the supplier's seal holds for this letter, so the supplier assigned the invoice to the financier
// it names. Sealing stays off until all three hold. Pure data, no wasm: tests run it under Node.

export interface LetterCheckInput {
  /** `matches_invoice` from `assignmentDecode` (N, amount and due date equal the invoice's). */
  matchesInvoice: boolean | null;
  /** `terms_hash` from the decoded letter (hex). */
  termsHash: string;
  /** Hash of the letter PDF (hex), or null when there is none. */
  fileHash: string | null;
  /** `assignmentStatus` with the supplier's seal alone, or null when the seal did not decode. */
  supplierSeal: string | null;
}

/** What stops the buyer from sealing; empty when the letter checks out. */
export function letterProblems(c: LetterCheckInput): string[] {
  return [
    c.matchesInvoice === true ? null : "the letter is for another invoice (N, amount or due date differ)",
    c.fileHash === null ? "choose the letter's PDF" : c.fileHash.toLowerCase() === c.termsHash.toLowerCase() ? null : "the PDF is not the letter's document",
    c.supplierSeal === "AwaitingSeal:Buyer" ? null : "the supplier's seal does not hold for this letter, so the supplier did not assign the invoice to this financier",
  ].filter((p): p is string => p !== null);
}
