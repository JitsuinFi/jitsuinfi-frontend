// Readable refusals (HNK-21.T9, BL-D23-11, BL-D24-07, BL-D25-05, BL-D26-07): the core, board and
// flow crates explain a refusal in one short technical phrase; this turns each known phrase into
// a sentence that says what happened and what to do. Unknown messages pass through unchanged.
// Pure: tests run it under Node.

const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/supplier entry rejected: (.*)/i, (m) => `The board entry does not match this deal (${m[1]}). Sign the entry again from the financier's latest request.`],
  [/certificate (\d+) is not anchored on the board/i, (m) => `Certificate #${m[1]} of the history was never registered on the board, so that invoice was not financed and cannot count. Drop it and send the history again.`],
  [/certificate (\d+): the buyer anchored two invoices/i, (m) => `Certificate #${m[1]} appears twice on the board: the buyer forked its history. Do not finance on this history.`],
  [/later invoice the buyer did not disclose/i, () => "The board shows a newer invoice of this buyer that the history leaves out. Ask the buyer for its full history."],
  [/certificate (\d+) names a financier outside the allowlist/i, (m) => `Certificate #${m[1]} was financed by a financier you do not trust, so its repayment does not count.`],
  [/history chain has a gap, a fork or a repeat/i, () => "The history certificates do not follow each other: one is missing, repeated or out of order."],
  [/below minimum standard: (.*)/i, (m) => `The buyer's history does not meet your standard: ${m[1]}.`],
  [/not settled: (\d+) of (\d+) zat paid/i, (m) => `Only ${m[1]} of ${m[2]} zat are paid and mined: the repayment is not complete yet.`],
  [/no buyer claim to countersign/i, () => "The payment carries no claim from the buyer: pay with the QR from step 5, which adds it."],
  [/seal out of policy order/i, () => "The seals are out of order: the supplier seals first, then the buyer, then the financier."],
  [/seal is for another document/i, () => "This seal belongs to another letter or invoice."],
  [/one key holds two roles/i, () => "One key cannot seal twice in the same deal: each party seals with its own key."],
  [/more seals than the policy allows/i, () => "This letter already has all its seals."],
  [/signed by an unexpected key/i, () => "Signed by another key than the one this deal names."],
  [/signing key does not match the invoice public key/i, () => "This key is not the one the invoice is addressed to."],
  [/signature verification failed/i, () => "A signature does not hold: the document was changed after signing, or signed by another key."],
  [/sealed message does not open/i, () => "This message was not sealed to your mailbox, or it was changed on the way."],
  [/not a usable X25519 mailbox key/i, () => "This contact card's mailbox key is not valid: ask for the card again."],
  [/invalid Ed25519 public key/i, () => "One of the keys is not a valid key: check that it was copied whole."],
  [/unknown magic bytes|input truncated|unexpected trailing bytes|unsupported format version|is not base64/i, () => "This code is not a complete JitsuinFi document: copy it again, whole, from where you got it."],
  [/invoice id must be 1-32 printable ASCII bytes/i, () => "The invoice number in No. on the sheet must be 1 to 32 plain characters: letters, digits and signs such as - / _, no spaces."],
  [/amount must be greater than zero/i, () => "The amount must be more than zero."],
  [/due date is before issue date/i, () => "The due date is before the issue date."],
  [/discount\/tenor class is not defined/i, () => "The discount and tenor classes must both be given, from 0 to 7, or neither."],
  [/same financier commitment: not double financing/i, () => "Both entries name the same financier: that is a repeated registration, not double financing."],
  [/malformed verification bundle/i, () => "This bundle is incomplete or changed: ask the financier for it again."],
  [/memo is not ZIP-302|memo padding is not zero/i, () => "This is not a JitsuinFi board memo."],
  // HNK-32 (local E2E 2026-10-22): the node's own errors as the console shows them
  [/lightwalletd: error sending request|transport error|gave up after \d+ s without an answer/i, () => "The Zcash server did not answer in time. Nothing was sent; try again in a minute."],
  [/insufficient balance \(have (\d+), need (\d+)/i, (m) => `The wallet has ${m[1]} zat it can spend now and needs ${m[2]}, fee included. Funds that just arrived become spendable after a few blocks.`],
];

/** A sentence for a refusal from the crates; the message itself when it is not a known one. */
export function explain(message: string): string {
  for (const [re, say] of RULES) {
    const m = message.match(re);
    if (m) return say(m);
  }
  return message;
}

/**
 * Why the node stopped a deal (HNK-32.T3, BL-D23-08, BL-D27-01). The node sends a code and the
 * txid of the entry that came first on the board; an older node sent a Debug dump that starts
 * with the same code.
 */
export function stopReason(stopped: string, winner?: string): string {
  const at = winner ? ` (first entry ${winner.slice(0, 8)}…${winner.slice(-4)})` : "";
  if (stopped.startsWith("AlreadyFinanced")) return `Already financed by another financier${at}. The deal stopped here: no entry was posted and no money left this node.`;
  if (stopped.startsWith("DoubleFinanced")) return `The supplier signed this invoice to more than one financier${at}. The deal stopped; the double-signature proof is below.`;
  return `Stopped: ${stopped}.`;
}
