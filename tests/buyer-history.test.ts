// HNK-25.T2: the buyer's history chain on this device, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { append, dropTail, emptyHistory, head, localNextIndex } from "../src/lib/buyer-history.ts";

test("certificates are added in order and the next index follows the chain", () => {
  let h = emptyHistory();
  assert.equal(localNextIndex(h), 0);
  assert.equal(head(h), "");
  h = append(h, 0, "c0");
  h = append(h, 1, "c1");
  assert.equal(localNextIndex(h), 2);
  assert.equal(head(h), "c1");
  assert.throws(() => append(h, 3, "c3"), /not the next one/);
  assert.throws(() => append(h, 1, "again"), /not the next one/);
});

test("only a trailing run of never-anchored certificates can be dropped", () => {
  const h = { certs: ["c0", "c1", "c2", "c3"] };
  assert.deepEqual(dropTail(h, []), h);
  assert.deepEqual(dropTail(h, [3, 2]), { certs: ["c0", "c1"] });
  assert.throws(() => dropTail(h, [1]), /only the newest/);
  assert.throws(() => dropTail(h, [1, 3]), /only the newest/);
});
