// HNK-08.T3: the index page shows the same table as `jitsuin index` (fixture: its --json output for
// jitsuinfi-zcash examples/index/board-sample.json), run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classRows, indexRows, summary, type RateIndex } from "../src/lib/rate-index.ts";

const idx = JSON.parse(readFileSync(new URL("./fixtures/rate-index-sample.json", import.meta.url), "utf8")) as RateIndex;

test("rows match the CLI table of the sample board", () => {
  // jitsuinfi-zcash examples/index/expected-output.txt
  assert.deepEqual(indexRows(idx), [
    ["<= 30 days", "-", "-", "fewer than 5 invoices"],
    ["31-60 days", "9", "2-3%", "2-3%: 6, other: 3"],
    ["61-90 days", "5", "3-5%", "3-5%: 5"],
    ["91-180 days", "-", "-", "fewer than 5 invoices"],
    ["181-365 days", "-", "-", "fewer than 5 invoices"],
  ]);
  assert.equal(summary(idx), "18 register entries, 17 invoices (each N once, first entry), 1 not disclosed, 1 invalid");
});

test("an unpublished class shows no count, and k follows the index", () => {
  const high: RateIndex = { ...idx, k: 6, tenors: idx.tenors.map((t) => (t.invoices === 5 ? { tenor: t.tenor, label: t.label, published: false } : t)) };
  const rows = indexRows(high);
  assert.deepEqual(rows[2], ["61-90 days", "-", "-", "fewer than 6 invoices"]);
  assert.ok(rows.every((r) => !r[3].includes("undefined")));
});

test("class table lists discount and tenor classes side by side", () => {
  const rows = classRows(idx);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], ["1", "< 1%", "<= 30 days"]);
  assert.deepEqual(rows[6], ["7", ">= 12%", ""]);
});
