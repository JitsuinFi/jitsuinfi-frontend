// The financier's history check as the page draws it (HNK-34.T5): wasm `verifyHistory` returns
// the four counts and one line per certificate; this turns each line into a link of the chain
// (its kanji, its number, what happened) and the counts into the verdict stamp. Pure: tests run
// it under Node.

export type Outcome = "PaidOnTime" | "PaidLate" | "Default" | "Open";

export interface HistoryLine {
  index: number;
  nullifier?: string;
  due_date: number;
  outcome: Outcome | string;
}

export interface HistoryResult {
  on_time: number;
  late: number;
  defaults: number;
  open: number;
  lines: HistoryLine[];
}

export type LinkKind = "ok" | "late" | "def" | "open";

export interface ChainLink {
  kind: LinkKind;
  glyph: string;
  n: string;
  text: string;
  label: string;
}

/** The kanji of each outcome: 適 on time, 遅 late, 滞 default, 開 open. */
export const GLYPH: Record<LinkKind, string> = { ok: "適", late: "遅", def: "滞", open: "開" };

/** Days since the Unix epoch (UTC) as YYYY-MM-DD. */
export function dayDate(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

export function chainLinks(r: HistoryResult): ChainLink[] {
  return r.lines.map((l) => {
    const n = `#${l.index}`;
    const [kind, text]: [LinkKind, string] =
      l.outcome === "PaidOnTime" ? ["ok", "paid on time"] : l.outcome === "PaidLate" ? ["late", "paid late"] : l.outcome === "Default" ? ["def", `unpaid, past due ${dayDate(l.due_date)}`] : ["open", `due ${dayDate(l.due_date)}`];
    return { kind, glyph: GLYPH[kind], n, text, label: `Invoice ${n}: ${text}` };
  });
}

/** The stamp and its words: 認 a complete history without defaults, 滞 defaults found. */
export function historyVerdict(r: HistoryResult): { bad: boolean; glyph: string; title: string; text: string } {
  return r.defaults > 0 ? { bad: true, glyph: "滞", title: "Defaults found", text: `${r.defaults} unpaid invoice(s) past due.` } : { bad: false, glyph: "認", title: "Complete history", text: "No defaults." };
}
