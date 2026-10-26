// The fund member's records (HNK-22.T2, HNK-30.T22–T23, D-49; IA port part 2, 2026-10-26): the
// wallet in this device's encrypted store (the holdings, each receipt's withdraw token, the payouts,
// the fund card), and the solvency report read in this tab. A member holds no signing key, only an
// inbox key, so nothing here asks for a stamp. Fund, Units and the inbox read and write here; a
// write tells every open page.
import { useEffect, useReducer, useState } from "react";
import { account } from "../../lib/app-session";
import { EMPTY, type Wallet } from "../../lib/fund";
import type { ReportReading } from "../../lib/fund-report";

const KEY = "fund:wallet";

let version = 0;
const listeners = new Set<() => void>();
function changed(): void {
  version++;
  listeners.forEach((f) => f());
}
function useVersion(): number {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  return version;
}

export async function load(): Promise<Wallet> {
  return (await account.current?.store?.get<Wallet>(KEY)) ?? EMPTY;
}

export async function save(w: Wallet): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("this device cannot keep your units: sign in again");
  await store.put(KEY, w);
  changed();
}

/** The wallet, read again whenever it changes; `failed` says why it could not be read. */
export function useWallet(): { w: Wallet | null; failed: string } {
  const v = useVersion();
  const [w, setW] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    void load().then(
      (x) => live && (setW(x), setFailed("")),
      (e) => live && setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => void (live = false);
  }, [v]);
  return { w, failed };
}

// the solvency report read in this tab (it stays when the member moves between Fund and Units)
let reading: ReportReading | null = null;
const readingListeners = new Set<() => void>();
export function setReading(r: ReportReading | null): void {
  reading = r;
  readingListeners.forEach((f) => f());
}
export function useReading(): ReportReading | null {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    readingListeners.add(bump);
    return () => void readingListeners.delete(bump);
  }, []);
  return reading;
}

export const zec = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;
export const units = (n: number) => n.toLocaleString("en");
