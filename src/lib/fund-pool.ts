// The fund's shielded pool in section (HNK-34.T5): the member page draws what the fund holds as
// levels in a basin, to scale. Cash floats on top, the advances out sit under it, what is overdue
// (after write-off; since 2026-10-25 the write-off is 100 %, so it counts 0 until repaid) is silt
// at the bottom; what the fund owes its members at par is a line, from
// the solvency report, and the member's share is part of that line. A unit is owed at par, one
// zatoshi (the root total is the liabilities in zat, fund-report.ts). Pure: tests run it under Node.

export interface PoolInput {
  cash_zat: number;
  open_zat: number;
  overdue_zat: number;
  /** What the fund owes its members at par, from the report; null before one is read. */
  owed_zat: number | null;
  /** The member's units under that root. */
  mine_units: number;
}

export interface PoolLevels {
  /** Nothing to draw: the fund holds nothing and owes nothing. */
  empty: boolean;
  /** Heights from the floor of the basin, in the units of `depth`. */
  overdue: number;
  open: number;
  cash: number;
  /** Top of the water: everything the fund holds. */
  water: number;
  /** Height of the owed line, or null. */
  owed: number | null;
  /** The member's part of the owed line, 0..1. */
  share: number;
}

const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Levels for a basin `depth` deep. The larger of the holdings and the debt fills `fill` of it; a
 * figure above zero is drawn at least `min` high, so a small overdue never vanishes.
 */
export function poolLevels(p: PoolInput, depth: number, fill = 0.86, min = 3): PoolLevels {
  const cash = pos(p.cash_zat);
  const open = pos(p.open_zat);
  const overdue = pos(p.overdue_zat);
  const owed = p.owed_zat === null ? null : pos(p.owed_zat);
  const top = Math.max(cash + open + overdue, owed ?? 0);
  if (top === 0 || depth <= 0) return { empty: true, overdue: 0, open: 0, cash: 0, water: 0, owed: owed === null ? null : 0, share: 0 };
  const scale = (depth * fill) / top;
  const h = (v: number) => (v > 0 ? Math.max(min, v * scale) : 0);
  const levels = { overdue: h(overdue), open: h(open), cash: h(cash) };
  const water = levels.overdue + levels.open + levels.cash;
  return {
    empty: false,
    ...levels,
    water,
    owed: owed === null ? null : Math.min(depth, h(owed)),
    share: owed ? Math.min(1, pos(p.mine_units) / owed) : 0,
  };
}
