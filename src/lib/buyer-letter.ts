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

/** One of the three letter checks: held (true), failed (false), or waiting for input (null). */
export interface LetterCheck {
  label: string;
  ok: boolean | null;
  /** What the check found, in words. */
  text: string;
  /** Why it stops the seal; null when it holds. */
  problem: string | null;
}

/** The three checks one by one, as the buyer's screen lists them (HNK-34.T5). */
export function letterChecks(c: LetterCheckInput): LetterCheck[] {
  const other = "the letter is for another invoice (N, amount or due date differ)";
  const pdfOk = c.fileHash !== null && c.fileHash.toLowerCase() === c.termsHash.toLowerCase();
  const sealOk = c.supplierSeal === "AwaitingSeal:Buyer";
  const sealBad = "the supplier's seal does not hold for this letter, so the supplier did not assign the invoice to this financier";
  return [
    { label: "Letter for this invoice", ok: c.matchesInvoice === true, text: c.matchesInvoice === true ? "N, amount and due date equal the invoice's" : other, problem: c.matchesInvoice === true ? null : other },
    c.fileHash === null
      ? { label: "PDF hash", ok: null, text: "choose the letter's PDF", problem: "choose the letter's PDF" }
      : { label: "PDF hash", ok: pdfOk, text: pdfOk ? "the PDF is the letter's document" : "the PDF is not the letter's document", problem: pdfOk ? null : "the PDF is not the letter's document" },
    { label: "Supplier's seal", ok: sealOk, text: sealOk ? "holds for this letter: the supplier assigned the invoice to this financier" : sealBad, problem: sealOk ? null : sealBad },
  ];
}

/** What stops the buyer from sealing; empty when the letter checks out. */
export function letterProblems(c: LetterCheckInput): string[] {
  return letterChecks(c)
    .map((x) => x.problem)
    .filter((p): p is string => p !== null);
}

export interface PayCheckInput {
  /** The letter kept on this device for the invoice, or undefined when there is none. */
  kept: string | undefined;
  /** The letter in the pay step. */
  letter: string;
  /** How many of the three seals this device holds for the kept letter. */
  seals: number;
  /** `assignmentStatus` of the kept letter with those seals, or null when it did not decode. */
  status: string | null;
}

/**
 * Why the payment QR stays hidden (HNK-32.T2, BL-D25-01, BL-S02-02): only a letter this device
 * kept, sealed by the supplier, the buyer and the financier, names where the buyer pays. A pasted
 * letter could name anyone's address.
 */
export function payProblems(c: PayCheckInput): string[] {
  if (c.kept === undefined) return ["this device holds no sealed letter for this invoice: keep the financier's letter and seals from your inbox first"];
  if (c.kept !== c.letter) return ["this is not the letter you sealed for this invoice"];
  if (c.seals < 3 || c.status !== "Sealed") return ["the letter is not complete yet: the financier seals it when it pays the advance; wait for that seal in your inbox"];
  return [];
}
