// The node's wallet as the console shows it (model; the section is Wallet.tsx) (wave 5: the financier never needs a terminal).
// `GET /node/console/wallet` (jitsuinfi-node, in parallel): the balance, what can be spent now,
// the split between the fund members' money and the financier's own, the top-up address and the
// recent transactions. A node from before it answers 404: the console says to update the node.
// Pure: tests run it under Node.

import { NETWORK } from "../lib/network.ts";

export interface WalletTx {
  txid: string;
  height: number | null;
  delta_zat: number;
  kind: "entry" | "advance" | "repayment" | "settled" | "deposit" | "payout" | "topup" | "other";
}

export interface Wallet {
  balance_zat: number;
  spendable_zat: number;
  pending_zat: number;
  fund_cash_zat: number | null;
  own_zat: number | null;
  fee_zat: number;
  topup_address: string;
  topup_uri: string;
  txs: WalletTx[];
  synced_at: number;
}

/** What the console knows of the wallet: not asked yet, a node without the endpoint, or the wallet. */
export type WalletView = null | "missing" | Wallet;

/** The network fee a payment from the node's wallet adds (ZIP-317 minimum for a small payment). */
export const FEE_ZAT = 10_000;

/** The wallet from the node's answer, or "missing" when the node does not have the endpoint (404). */
export function walletOf(status: number, body: unknown): WalletView {
  if (status === 404) return "missing";
  const w = body as Partial<Wallet> | null;
  if (!w || typeof w.balance_zat !== "number" || typeof w.spendable_zat !== "number") return "missing";
  return {
    balance_zat: w.balance_zat,
    spendable_zat: w.spendable_zat,
    pending_zat: typeof w.pending_zat === "number" ? w.pending_zat : 0,
    fund_cash_zat: typeof w.fund_cash_zat === "number" ? w.fund_cash_zat : null,
    own_zat: typeof w.own_zat === "number" ? w.own_zat : null,
    fee_zat: typeof w.fee_zat === "number" ? w.fee_zat : FEE_ZAT,
    topup_address: String(w.topup_address ?? ""),
    topup_uri: String(w.topup_uri ?? ""),
    txs: Array.isArray(w.txs) ? w.txs.filter((t): t is WalletTx => !!t && typeof t.txid === "string" && typeof t.delta_zat === "number") : [],
    synced_at: typeof w.synced_at === "number" ? w.synced_at : 0,
  };
}

/** Words for a transaction's kind. */
export const KIND_WORDS: Record<WalletTx["kind"], string> = {
  entry: "Public record posted",
  advance: "Advance paid to a supplier",
  repayment: "Repayment from a buyer",
  settled: "Settlement posted",
  deposit: "Deposit from a fund member",
  payout: "Payout to a fund member",
  topup: "Top-up",
  other: "Other",
};

/** A transaction on a block explorer of this build's network. */
export function txUrl(txid: string): string {
  return `https://${NETWORK === "main" ? "mainnet" : "testnet"}.zcashexplorer.app/transactions/${encodeURIComponent(txid)}`;
}

export interface Shortfall {
  /** What the wallet can spend now (null: not known). */
  have: number | null;
  /** The advance. */
  need: number;
  fee: number;
}

/** What a deal in Pay says about its payment (node wave 5): `spendable_zat` is null before the first sync. */
export interface PayFacts {
  advance_zat: number;
  wallet_short?: boolean;
  /** The advance and its fee. */
  need_zat?: number;
  spendable_zat?: number | null;
}

/**
 * Before the passkey prompt: the advance cannot be paid from what the wallet can spend now. The
 * node says so on the deal (`wallet_short`, or its `spendable_zat` < `need_zat`), or the wallet
 * shows spendable < advance + fee. Null when it can be paid, or when nothing says otherwise.
 */
export function payShortfall(w: WalletView, d: PayFacts): Shortfall | null {
  const wallet = w && w !== "missing" ? w : null;
  const fee = typeof d.need_zat === "number" && d.need_zat >= d.advance_zat ? d.need_zat - d.advance_zat : (wallet?.fee_zat ?? FEE_ZAT);
  const need = d.advance_zat + fee;
  const dealHas = typeof d.spendable_zat === "number" ? d.spendable_zat : null;
  const have = dealHas ?? (wallet ? wallet.spendable_zat : null);
  if (d.wallet_short || (have !== null && have < need)) return { have, need: d.advance_zat, fee };
  return null;
}

/** The node's refusal (409 from `approve/start`, before the passkey prompt, or from `deals/{n}/pay`: `{error, need_zat, spendable_zat, advance_zat, fee_zat}`) as a shortfall, if it is one. */
export function refusalShortfall(body: unknown, advance: number): Shortfall | null {
  const b = body as { need_zat?: unknown; spendable_zat?: unknown; advance_zat?: unknown; fee_zat?: unknown } | null;
  if (!b || typeof b.need_zat !== "number") return null;
  const adv = typeof b.advance_zat === "number" ? b.advance_zat : advance;
  const fee = typeof b.fee_zat === "number" ? b.fee_zat : Math.max(0, b.need_zat - adv) || FEE_ZAT;
  return { have: typeof b.spendable_zat === "number" ? b.spendable_zat : null, need: adv, fee };
}

/** "The node's wallet holds X ZEC; this advance needs Y ZEC + Z fee." */
export function shortWords(s: Shortfall, zec: (zat: number) => string): string {
  const holds = s.have === null ? "The node's wallet cannot pay this yet" : `The node's wallet holds ${zec(s.have)} ZEC`;
  return `${holds}; this advance needs ${zec(s.need)} ZEC + ${zec(s.fee)} fee. Top up the node's wallet, then pay.`;
}
