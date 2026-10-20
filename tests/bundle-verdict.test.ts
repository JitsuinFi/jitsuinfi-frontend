// HNK-28.T4: the bundle verdict claims "every seal checks out" only for a sealed letter, run with
// `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleVerdict, letterStatus } from "../src/lib/bundle-verdict.ts";

test("only a sealed letter says every seal checks out", () => {
  assert.equal(bundleVerdict("Sealed").kind, "ok");
  assert.match(bundleVerdict("Sealed").text, /every seal/);
  for (const status of [null, "AwaitingSeal:Supplier", "AwaitingSeal:Buyer", "AwaitingSeal:Financier"]) {
    assert.doesNotMatch(bundleVerdict(status).text, /every seal/, String(status));
  }
});

test("an incomplete letter is a warning that names the missing seal", () => {
  const v = bundleVerdict("AwaitingSeal:Financier");
  assert.equal(v.kind, "warn");
  assert.match(v.text, /financier's seal/);
  assert.match(v.text, /does not prove a financed deal/);
  assert.equal(letterStatus("AwaitingSeal:Buyer"), "waiting for the buyer's seal");
});

test("no letter: the invoice is genuine, nothing more", () => {
  const v = bundleVerdict(null);
  assert.equal(v.title, "Invoice is genuine");
  assert.match(v.text, /no assignment letter/);
  assert.equal(letterStatus(null), "not included");
  assert.throws(() => bundleVerdict("Garbage"));
});
