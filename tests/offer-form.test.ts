// Mobile E2E 2026-10-27, finding 7: the offer form fills what it can (DS-MOB F3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceSuggestion, DEFAULT_ADVANCE_RATIO } from "../src/lib/supplier-deal.ts";
import { addressFromScan, ScanRefused } from "../src/lib/scan.ts";

test("the advance is prefilled from the financier's ratio, else a default share of the invoice", () => {
  assert.equal(advanceSuggestion(100_000), Math.floor(100_000 * DEFAULT_ADVANCE_RATIO));
  assert.equal(advanceSuggestion(100_000, { advance_ratio: 0.8 }), 80_000);
  assert.equal(advanceSuggestion(100_000, { advance_ratio: 7 }), 90_000); // nonsense ratio: default
  assert.equal(advanceSuggestion(100_000, { max_zat: 50_000 }), 50_000);
});

test("a scanned address: bare, or inside a zcash: request; anything else refused in words", () => {
  const ok = (a: string) => (a.startsWith("utest1") ? null : "not an address");
  assert.equal(addressFromScan(" utest1abc ", ok), "utest1abc");
  assert.equal(addressFromScan("zcash:utest1abc?amount=0.1&memo=x", ok), "utest1abc");
  assert.equal(addressFromScan("zcash:?address=utest1abc&amount=1", ok), "utest1abc");
  assert.throws(() => addressFromScan("https://x/app/contact#jitsuin-contact-v1:z", ok), ScanRefused);
  assert.throws(() => addressFromScan("t1xyz", ok), /not an address/);
});
