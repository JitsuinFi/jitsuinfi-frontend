// The invoice PDF before an invoice is written on it (messy-state E2E 2026-10-27): an empty file,
// a file that is not a PDF, or one over the relay's 2 MiB attachment limit was accepted, and the
// invoice, bound to that file's hash for good, could then not be sent to the buyer.
//
// Pure: tests run it under Node.
import { MAX_ATTACHMENT } from "./relay-message.ts";

/** Why `head` (the file's first bytes) and `size` are not an invoice PDF this app can send; null when fine. */
export function pdfProblem(name: string, size: number, head: Uint8Array): string | null {
  if (size === 0) return `${name} is empty. Choose the invoice PDF itself.`;
  const magic = String.fromCharCode(...head.slice(0, 5));
  if (magic !== "%PDF-") return `${name} is not a PDF. Choose the invoice as a PDF file.`;
  if (size > MAX_ATTACHMENT) return `${name} is ${(size / 1048576).toFixed(1)} MiB: the relay carries up to 2 MiB, so it could not reach the buyer. Make the PDF smaller (export it again, or compress its images), then choose it.`;
  return null;
}

/** `pdfProblem` for a chosen file. */
export async function filePdfProblem(f: File): Promise<string | null> {
  return pdfProblem(f.name, f.size, new Uint8Array(await f.slice(0, 5).arrayBuffer()));
}
