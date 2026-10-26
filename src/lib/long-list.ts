// Long lists (IA port, user feedback 2026-10-26 C): a ledger or an inbox with many lines stays
// usable. What needs your move comes first, then what waits on someone else, then what is done,
// folded ("Settled · 12", opened on demand). A search narrows every group by the line's own words
// (invoice number, buyer); each group shows its first lines and then "Show more". The supplier's
// 台帳 and the inbox use it, and since part 2 the buyer's ledger, its slips and the member's payouts.
// Pure: tests run it under Node.

export type Stage = "move" | "wait" | "done";
export const STAGES: readonly Stage[] = ["move", "wait", "done"];

export interface Group<T> {
  stage: Stage;
  /** Every matching line of the stage. */
  total: number;
  /** The lines shown. */
  items: T[];
  /** Lines hidden behind "Show more". */
  more: number;
  /** The whole group is closed (done lines, until opened or searched). */
  folded: boolean;
}

export interface Arrange<T> {
  stage: (t: T) => Stage;
  /** The words a search matches: invoice number, buyer, amount… */
  words: (t: T) => string;
  query?: string;
  /** Lines per group before "Show more" (default 8). */
  limit?: number;
  /** Groups the viewer opened ("Settled · 12") or expanded ("Show more"). */
  opened?: ReadonlySet<Stage>;
  expanded?: ReadonlySet<Stage>;
}

/** Normalised search words: lower case, single spaces. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matches(words: string, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const w = norm(words);
  return q.split(" ").every((part) => w.includes(part));
}

/** The groups to draw, in order move, wait, done; an empty group is left out. Input order is kept within a group. */
export function arrange<T>(items: readonly T[], o: Arrange<T>): { groups: Group<T>[]; matched: number; total: number } {
  const limit = o.limit ?? 8;
  const q = o.query ?? "";
  const searching = norm(q) !== "";
  const hit = items.filter((t) => matches(o.words(t), q));
  const groups: Group<T>[] = [];
  for (const stage of STAGES) {
    const all = hit.filter((t) => o.stage(t) === stage);
    if (!all.length) continue;
    // done lines fold unless the viewer opened them, searched, or nothing else is left
    const folded = stage === "done" && !searching && !o.opened?.has("done") && hit.length !== all.length;
    const showAll = searching || o.expanded?.has(stage) === true;
    const items = folded ? [] : showAll ? all : all.slice(0, limit);
    groups.push({ stage, total: all.length, items, more: folded ? 0 : all.length - items.length, folded });
  }
  return { groups, matched: hit.length, total: items.length };
}
