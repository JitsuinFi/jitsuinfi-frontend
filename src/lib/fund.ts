// The member's side of the fund (HNK-30.T22, T23, D-49): the units the fund owes them, kept on
// this device. Each deposit receipt carries a withdraw token, the only thing that opens those
// units, so holdings live in the member's encrypted store, never on a server. Paths from the
// fund are checked here against the root and total (units.ts); payouts swap the spent token for
// the one that holds what is left. Pure: tests run it under Node.
import type { Header } from "./relay-message.ts";
import { leafId, verifyPath } from "./units.ts";

export interface Nav {
  assets_zat: number;
  units: number;
}

export interface Holding {
  /** The fund manager key that signs its receipts and paths. */
  fund_pk: string;
  /** Where withdrawals go: the fund's mailbox. */
  fund_mailbox: string;
  token: string;
  leaf_id: string;
  units: number;
  /** The period the units were bought (or last paid) in. */
  period: number;
  /** What a unit cost when bought. */
  nav: Nav;
  deposit_txid?: string;
  amount_zat?: number;
  /** The last path checked for this leaf. */
  path?: { period: number; root: string; total: number; ok: boolean; body?: Record<string, unknown> };
  /** A withdrawal sent and not paid yet. */
  pending?: { units: number | "all"; period: number; sent_at: number };
}

export interface Payout {
  fund_pk: string;
  period: number;
  units: number;
  amount_zat: number;
  txid: string;
}

export interface Wallet {
  holdings: Holding[];
  payouts: Payout[];
  /** HNK-30.T22: the fund card the manager gave this member (deposit address, fund key). */
  fund?: import("./fund-card.ts").FundCard;
}

/** The fund's holdings in aggregate, as the latest path carried them (HNK-30.T22). */
export interface Portfolio {
  cash_zat: number;
  open: number;
  open_zat: number;
  overdue: number;
  overdue_zat: number;
  repaid: number;
  due_within: [number, number, number];
}

/** The portfolio of the newest period this device has a path for, or null. */
export function latestPortfolio(w: Wallet): { period: number; p: Portfolio } | null {
  let best: { period: number; p: Portfolio } | null = null;
  for (const h of w.holdings) {
    const p = h.path?.body?.portfolio as Portfolio | undefined;
    if (p && h.path && (!best || h.path.period > best.period)) best = { period: h.path.period, p };
  }
  return best;
}

export const EMPTY: Wallet = { holdings: [], payouts: [] };

/** Zatoshi worth of `units` at `nav`, rounded down (as the node pays). */
export function valueOf(units: number, nav: Nav): number {
  return Number((BigInt(units) * BigInt(nav.assets_zat)) / BigInt(Math.max(1, nav.units)));
}

/** The latest NAV the fund has shown this member, from their holdings. */
export function lastNav(w: Wallet, fundPk: string): Nav | null {
  const hs = w.holdings.filter((h) => h.fund_pk === fundPk);
  return hs.length ? hs[hs.length - 1].nav : null;
}

const fundOf = (h: Header) => ({ fund_pk: h.signer ?? "", fund_mailbox: h.from.mailbox_pk });

/** Adds a deposit receipt; a receipt seen before changes nothing. */
export async function addReceipt(w: Wallet, h: Header): Promise<Wallet> {
  if (h.type !== "fund.receipt") throw new Error("not a deposit receipt");
  const b = h.body as { period: number; deposit_txid: string; amount_zat: number; units: number; nav: Nav; withdraw_token: string };
  if (w.holdings.some((x) => x.deposit_txid === b.deposit_txid && x.fund_pk === h.signer)) return w;
  const holding: Holding = {
    ...fundOf(h),
    token: b.withdraw_token,
    leaf_id: await leafId(b.withdraw_token),
    units: b.units,
    period: b.period,
    nav: b.nav,
    deposit_txid: b.deposit_txid,
    amount_zat: b.amount_zat,
  };
  return { ...w, holdings: [...w.holdings, holding] };
}

/** Checks a period's path for one of this member's leaves; returns whether it holds. */
export async function addPath(w: Wallet, h: Header): Promise<{ wallet: Wallet; ok: boolean }> {
  if (h.type !== "fund.merkle_path") throw new Error("not a fund path");
  const b = h.body as { period: number; leaf_id: string; units: number; root: string; total: number; path: string };
  const i = w.holdings.findIndex((x) => x.leaf_id === b.leaf_id && x.fund_pk === h.signer);
  if (i < 0) throw new Error("this path is for units this device does not hold");
  const mine = w.holdings[i];
  const ok = b.units === mine.units && (await verifyPath(b.leaf_id, BigInt(b.units), b.path, b.root, BigInt(b.total)));
  const holdings = w.holdings.slice();
  holdings[i] = { ...mine, path: { period: b.period, root: b.root, total: b.total, ok, body: { ...b } } };
  return { wallet: { ...w, holdings }, ok };
}

/** A payout: the paid leaf's token is spent; the new token, when there is one, holds the rest. */
export async function addPayout(w: Wallet, h: Header): Promise<Wallet> {
  if (h.type !== "fund.payout") throw new Error("not a payout");
  const b = h.body as { period: number; leaf_id: string; units: number; amount_zat: number; nav: Nav; txid: string; next_token?: string };
  if (w.payouts.some((p) => p.txid === b.txid && p.fund_pk === h.signer && p.units === b.units)) return w;
  const i = w.holdings.findIndex((x) => x.leaf_id === b.leaf_id && x.fund_pk === h.signer);
  if (i < 0) throw new Error("this payout is for units this device does not hold");
  const old = w.holdings[i];
  const holdings = w.holdings.slice();
  if (b.next_token) {
    holdings[i] = { ...old, token: b.next_token, leaf_id: await leafId(b.next_token), units: old.units - b.units, period: b.period + 1, nav: b.nav, path: undefined, pending: undefined };
  } else holdings.splice(i, 1);
  return { holdings, payouts: [...w.payouts, { fund_pk: old.fund_pk, period: b.period, units: b.units, amount_zat: b.amount_zat, txid: b.txid }] };
}

/** The period a request made now belongs to: the one after the last close this holding saw. */
export function openPeriod(hd: Holding): number {
  return Math.max(hd.period, (hd.path?.period ?? 0) + 1);
}

/** The body of a withdrawal request for one holding. */
export function withdrawBody(hd: Holding, units: number | "all", address: string, period: number) {
  const a = address.trim();
  if (!/^[A-Za-z0-9]{10,512}$/.test(a)) throw new Error("give a shielded Zcash address to be paid at");
  if (units !== "all" && (!Number.isSafeInteger(units) || units <= 0 || units > hd.units)) throw new Error(`these units are 1 to ${hd.units}`);
  return { withdraw_token: hd.token, units, address: a, period };
}
