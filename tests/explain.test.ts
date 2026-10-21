// HNK-21.T9: refusals from the crates read as sentences.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "../src/lib/explain.ts";

test("known refusals become sentences, unknown ones pass through", () => {
  assert.match(explain("history: certificate 2 is not anchored on the board"), /Certificate #2 .* never registered/);
  assert.match(explain("core: seal out of policy order"), /supplier seals first/);
  assert.match(explain("not settled: 10 of 50 zat paid"), /Only 10 of 50 zat/);
  assert.match(explain("supplier entry rejected: commitment differs"), /\(commitment differs\)/);
  assert.match(explain("input truncated"), /not a complete JitsuinFi document/);
  assert.equal(explain("something new"), "something new");
});
