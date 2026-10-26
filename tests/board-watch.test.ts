// Judge run 2, finding 2: the board is read again when a deal moves, on return to the tab, and on
// an interval while a deal is in flight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_GAP, shouldReadBoard } from "../src/lib/board-watch.ts";

const at = (lastAt: number | null, busy = false) => ({ lastAt, busy });

test("the first page that needs the board reads it once", () => {
  assert.equal(shouldReadBoard(at(null), "first", 0, false), true);
  assert.equal(shouldReadBoard(at(1000), "first", 999_999, true), false);
});

test("a deal that changes state reads the board again, spaced out", () => {
  assert.equal(shouldReadBoard(at(0), "change", BOARD_GAP.change, false), true);
  assert.equal(shouldReadBoard(at(0), "change", BOARD_GAP.change - 1, false), false);
});

test("coming back to the tab reads it again after a while", () => {
  assert.equal(shouldReadBoard(at(0), "visible", BOARD_GAP.visible, false), true);
  assert.equal(shouldReadBoard(at(0), "visible", 1000, false), false);
});

test("the interval reads only while a deal is in flight", () => {
  assert.equal(shouldReadBoard(at(0), "tick", BOARD_GAP.tick, true), true);
  assert.equal(shouldReadBoard(at(0), "tick", BOARD_GAP.tick * 10, false), false);
});

test("no second read while one is on its way", () => {
  assert.equal(shouldReadBoard(at(0, true), "change", 10 ** 9, true), false);
  assert.equal(shouldReadBoard(at(null, true), "first", 0, true), false);
});
