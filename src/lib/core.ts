// Thin typed layer over jitsuin-wasm, plus date, amount and key helpers.
import init, * as w from "../wasm/jitsuin_wasm.js";
import { DealStore, type Role } from "./store";

let ready: Promise<unknown> | null = null;

export function loadWasm(): Promise<unknown> {
  ready ??= init();
  return ready;
}

export const wasm = w;

export const ZAT_PER_ZEC = 100_000_000;

export function zecToZat(zec: string): number {
  const v = Number(zec);
  if (!Number.isFinite(v) || v <= 0) throw new Error("amount must be a positive number");
  return Math.round(v * ZAT_PER_ZEC);
}

export function zatToZec(zat: number): string {
  return (zat / ZAT_PER_ZEC).toFixed(8).replace(/\.?0+$/, "");
}

/// Days since the Unix epoch (UTC), the date unit of invoices and receipts.
export function dateToDays(iso: string): number {
  const t = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(t)) throw new Error("pick a date");
  return Math.floor(t / 86_400_000);
}

export function daysToDate(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

export function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/// Fresh 32-byte secret from the browser's CSPRNG (supplier per-invoice key).
export function randomSecret(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function fileHash(file: File): Promise<string> {
  return w.documentHash(new Uint8Array(await file.arrayBuffer()));
}

export function json<T = Record<string, unknown>>(s: string): T {
  return JSON.parse(s) as T;
}

export type CodeKind = "bundle" | "proof" | "exhibit" | "invoice" | "assignment" | "seal" | "history" | "unknown";

/// Which JitsuinFi object a base64url code holds, from its 4 magic bytes.
export function codeKind(code: string): CodeKind {
  const head = code.trim().slice(0, 8).replace(/-/g, "+").replace(/_/g, "/");
  let magic = "";
  try {
    magic = atob(head.padEnd(8, "=")).slice(0, 4);
  } catch {
    return "unknown";
  }
  const kinds: Record<string, CodeKind> = {
    JTSB: "bundle",
    JTSP: "proof",
    JTSX: "exhibit",
    JTSI: "invoice",
    JTSA: "assignment",
    JTL1: "seal",
    JTSH: "history",
  };
  return kinds[magic] ?? "unknown";
}

/// Encrypted deal store of `role` on this device (HNK-24.T3). `master` is the role's passkey PRF
/// output as bytes; it is zeroed by jitsuin-wasm, and the derived storage keys are zeroed by the
/// store once imported as non-extractable WebCrypto keys.
export async function openDealStore(role: Role, master: Uint8Array): Promise<DealStore> {
  await loadWasm();
  return DealStore.open(role, w.storageKeysBytes(master));
}
