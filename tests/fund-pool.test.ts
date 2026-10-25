// HNK-34.T5: the member's pool is drawn to scale from the fund's figures, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { poolLevels } from "../src/lib/fund-pool.ts";

test("an empty fund draws nothing, and nothing divides by zero", () => {
  const l = poolLevels({ cash_zat: 0, open_zat: 0, overdue_zat: 0, owed_zat: null, mine_units: 0 }, 300);
  assert.equal(l.empty, true);
  assert.equal(l.water, 0);
  assert.equal(poolLevels({ cash_zat: 0, open_zat: 0, overdue_zat: 0, owed_zat: 0, mine_units: 5 }, 300).share, 0);
});

test("levels keep the figures' proportions, and the larger side fills the basin", () => {
  const l = poolLevels({ cash_zat: 4_000_000, open_zat: 2_000_000, overdue_zat: 0, owed_zat: 5_000_000, mine_units: 1_000_000 }, 300, 0.8);
  assert.equal(l.empty, false);
  assert.ok(Math.abs(l.water - 240) < 1e-9);
  assert.equal(l.cash, 2 * l.open);
  assert.equal(l.overdue, 0);
  assert.ok(Math.abs(l.owed! - 200) < 1e-9);
  assert.equal(l.share, 0.2);
});

test("owing more than it holds puts the owed line above the water", () => {
  const l = poolLevels({ cash_zat: 1_000, open_zat: 1_000, overdue_zat: 10, owed_zat: 4_000, mine_units: 8_000 }, 200);
  assert.ok(l.owed! > l.water);
  assert.ok(l.overdue >= 3, "a small overdue stays visible");
  assert.equal(l.share, 1, "the share never passes the whole line");
});
