// Public rate index (HNK-08.T3): turns the JSON of wasm `rateIndex` (the same as
// `jitsuin index --json` without `version` and `board`) into the rows the index page shows, in the
// same words as the CLI table. Pure data, no wasm: tests run it under Node.

export interface IndexClass {
  class: number;
  label: string;
  min: number;
  max: number;
}

export interface TenorRow {
  tenor: number;
  label: string;
  published: boolean;
  invoices?: number;
  median_discount?: { class: number; label: string };
  discounts?: Array<{ class: number; label: string; invoices: number }>;
  other?: number;
}

export interface RateIndex {
  k: number;
  entries: number;
  invoices: number;
  undisclosed: number;
  invalid: number;
  tenors: TenorRow[];
  classes: { discount_bps: IndexClass[]; tenor_days: IndexClass[] };
}

/** One table row: tenor, invoices, median discount, discount classes. */
export type Row = [string, string, string, string];

export function indexRows(idx: RateIndex): Row[] {
  return idx.tenors.map((t) => {
    if (!t.published) return [t.label, "-", "-", `fewer than ${idx.k} invoices`];
    const parts = (t.discounts ?? []).map((d) => `${d.label}: ${d.invoices}`);
    if (t.other) parts.push(`other: ${t.other}`);
    return [t.label, String(t.invoices ?? 0), t.median_discount?.label ?? "-", parts.join(", ")];
  });
}

export function summary(idx: RateIndex): string {
  return `${idx.entries} register entries, ${idx.invoices} invoices (each N once, first entry), ${idx.undisclosed} not disclosed, ${idx.invalid} invalid`;
}

/** Class definitions: discount in basis points of the face value, tenor in days. */
export function classRows(idx: RateIndex): Array<[string, string, string]> {
  const n = Math.max(idx.classes.discount_bps.length, idx.classes.tenor_days.length);
  return Array.from({ length: n }, (_, i): [string, string, string] => [
    String(i + 1),
    idx.classes.discount_bps[i]?.label ?? "",
    idx.classes.tenor_days[i]?.label ?? "",
  ]);
}
