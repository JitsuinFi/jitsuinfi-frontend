// The member reads the solvency report of `jitsuin fund --json` (HNK-32.T7, BL-D29-07, D17). The
// CLI runs on the member's own machine with the fund's viewing key, which never reaches a website;
// this page only reads what it printed and checks that the report is about the root of a path this
// device holds (same period, same total, the member's units included). Pure: tests run it under Node.
//
// Since 2026-10-25 (user decision) the fund is valued on its books, not on the manager's whole
// wallet: `cash_zat` is the books' cash, `wallet_zat` the wallet's balance, `books` the deposit
// and payout txids the path carried with their values on chain. A report valued on the wallet
// (an older `jitsuin fund`) does not answer, and each deposit this device made before the close
// must be in the books.

import type { Wallet } from "./fund.ts";

export interface BookLine {
  txid: string;
  amount_zat: number;
}

export interface FundReport {
  network: string;
  /** "books" since 2026-10-25; absent in a report valued on the whole wallet. */
  basis?: string;
  /** The fund's cash on its books (the wallet's balance in a report from before the books). */
  cash_zat: number;
  /** The whole wallet's balance, which the fund shares with its manager. */
  wallet_zat?: number;
  books?: { deposits: BookLine[]; payouts: BookLine[]; missing: string[] };
  verdict: { period: number; liabilities_zat: number; assets_zat: number; open_zat: number; overdue_zat: number; solvent: boolean; wallet_zat?: number; wallet_covers?: boolean } | null;
  /** Why there is no verdict (no root yet, or a path without the books). */
  no_verdict?: string | null;
  inclusion: { period: number; units: number; included: boolean; why: string } | null;
}

export interface ReportReading {
  report: FundReport;
  /** Why the report does not fit this device's paths; empty when it does. */
  problems: string[];
  solvent: boolean;
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/** Parses the report and checks it against the paths this device kept for its units. */
export function readFundReport(text: string, w: Wallet, network: string): ReportReading {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("this is not the report of `jitsuin fund --json`");
  }
  const v = j.verdict as FundReport["verdict"];
  const inc = j.inclusion as FundReport["inclusion"];
  if (typeof j.network !== "string" || !num(j.cash_zat) || (v !== null && (typeof v !== "object" || !num(v.period) || !num(v.liabilities_zat) || !num(v.assets_zat) || typeof v.solvent !== "boolean"))) {
    throw new Error("this is not the report of `jitsuin fund --json`");
  }
  const b = j.books as FundReport["books"] | undefined;
  const lines = (x: unknown): x is BookLine[] => Array.isArray(x) && x.every((l) => typeof l === "object" && l !== null && typeof (l as BookLine).txid === "string" && num((l as BookLine).amount_zat));
  if (b !== undefined && (typeof b !== "object" || b === null || !lines(b.deposits) || !lines(b.payouts) || !Array.isArray(b.missing))) {
    throw new Error("this is not the report of `jitsuin fund --json`");
  }
  const report: FundReport = {
    network: j.network,
    basis: typeof j.basis === "string" ? j.basis : undefined,
    cash_zat: j.cash_zat,
    wallet_zat: num(j.wallet_zat) ? j.wallet_zat : undefined,
    books: b,
    verdict: v ?? null,
    no_verdict: typeof j.no_verdict === "string" ? j.no_verdict : null,
    inclusion: inc ?? null,
  };
  const problems: string[] = [];
  if (report.network !== network) problems.push(`the report is for ${report.network}, this page for ${network}`);
  if (!v) problems.push(report.no_verdict ? `there is no verdict: ${report.no_verdict}` : "the fund has no liability root on chain yet: nothing to compare");
  else if (report.basis !== "books" || !b) problems.push("the report values the manager's whole wallet, not the fund's books: run a jitsuin fund from 2026-10-25 or later");
  if (!inc) problems.push("the report was made without your path: run it with `--path` and the file saved from a slip");
  else if (!inc.included) problems.push(`your units are not under the root: ${inc.why}`);
  if (v && inc) {
    const held = w.holdings.find((h) => h.path?.ok && h.path.period === v.period && h.units === inc.units);
    if (inc.period !== v.period) problems.push("the solvency and your units are for different periods");
    else if (!held) problems.push(`this device holds no checked path with ${inc.units} units for period ${v.period}`);
    else if (held.path!.total !== v.liabilities_zat) problems.push("the report's liabilities are not the total of the root your path ends in");
    else if (b) {
      // every deposit this device made into this fund before that close is on the books
      const listed = new Set(b.deposits.map((l) => l.txid));
      const unlisted = w.holdings.filter((h) => h.fund_pk === held.fund_pk && h.deposit_txid && h.period <= v.period && !listed.has(h.deposit_txid));
      if (unlisted.length) problems.push(`the fund's books leave out your deposit ${unlisted.map((h) => `${h.deposit_txid!.slice(0, 8)}…`).join(", ")}`);
    }
  }
  if (b?.missing.length) problems.push(`${b.missing.length} transaction${b.missing.length === 1 ? "" : "s"} on the fund's books ${b.missing.length === 1 ? "is" : "are"} not in its wallet`);
  return { report, problems, solvent: !!v?.solvent && problems.length === 0 };
}
