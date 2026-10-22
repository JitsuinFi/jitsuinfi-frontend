// The member reads the solvency report of `jitsuin fund --json` (HNK-32.T7, BL-D29-07, D17). The
// CLI runs on the member's own machine with the fund's viewing key, which never reaches a website;
// this page only reads what it printed and checks that the report is about the root of a path this
// device holds (same period, same total, the member's units included). Pure: tests run it under Node.

import type { Wallet } from "./fund.ts";

export interface FundReport {
  network: string;
  cash_zat: number;
  verdict: { period: number; liabilities_zat: number; assets_zat: number; open_zat: number; overdue_zat: number; solvent: boolean } | null;
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
  const report: FundReport = { network: j.network, cash_zat: j.cash_zat, verdict: v ?? null, inclusion: inc ?? null };
  const problems: string[] = [];
  if (report.network !== network) problems.push(`the report is for ${report.network}, this page for ${network}`);
  if (!v) problems.push("the fund has no liability root on chain yet: nothing to compare");
  if (!inc) problems.push("the report was made without your path: run it with `--path` and the file saved from a slip");
  else if (!inc.included) problems.push(`your units are not under the root: ${inc.why}`);
  if (v && inc) {
    const held = w.holdings.find((h) => h.path?.ok && h.path.period === v.period && h.units === inc.units);
    if (inc.period !== v.period) problems.push("the solvency and your units are for different periods");
    else if (!held) problems.push(`this device holds no checked path with ${inc.units} units for period ${v.period}`);
    else if (held.path!.total !== v.liabilities_zat) problems.push("the report's liabilities are not the total of the root your path ends in");
  }
  return { report, problems, solvent: !!v?.solvent && problems.length === 0 };
}
