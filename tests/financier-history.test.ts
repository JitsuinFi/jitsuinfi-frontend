// HNK-34.T5: the financier page draws wasm `verifyHistory` as a chain of links and one verdict
// stamp, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainLinks, dayDate, historyVerdict, type HistoryResult } from "../src/lib/financier-history.ts";

const due = 20_788; // 2026-12-01
const r: HistoryResult = {
  on_time: 1,
  late: 1,
  defaults: 1,
  open: 1,
  lines: [
    { index: 0, due_date: due, outcome: "PaidOnTime" },
    { index: 1, due_date: due, outcome: "PaidLate" },
    { index: 2, due_date: due, outcome: "Default" },
    { index: 3, due_date: due, outcome: "Open" },
  ],
};

test("each line becomes a link with its kanji and words", () => {
  assert.equal(dayDate(due), "2026-12-01");
  assert.deepEqual(
    chainLinks(r).map((l) => [l.kind, l.glyph, l.n, l.text]),
    [
      ["ok", "適", "#0", "paid on time"],
      ["late", "遅", "#1", "paid late"],
      ["def", "滞", "#2", "unpaid, past due 2026-12-01"],
      ["open", "開", "#3", "due 2026-12-01"],
    ],
  );
  assert.equal(chainLinks(r)[2].label, "Invoice #2: unpaid, past due 2026-12-01");
});

test("the verdict keeps the old page's words", () => {
  assert.deepEqual(historyVerdict(r), { bad: true, glyph: "滞", title: "Defaults found", text: "1 unpaid invoice(s) past due." });
  assert.deepEqual(historyVerdict({ ...r, defaults: 0 }), { bad: false, glyph: "認", title: "Complete history", text: "No defaults." });
});
