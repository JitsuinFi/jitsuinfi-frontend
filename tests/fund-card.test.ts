// HNK-30.T22: the fund's card a manager hands a member.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFundCard, encodeFundCard } from "../src/lib/fund-card.ts";

test("a fund card round-trips and refuses anything else", () => {
  const c = { v: 1 as const, fund_pk: "ab".repeat(32), mailbox_pk: "cd".repeat(32), deposit_address: "utest1" + "q".repeat(40) };
  assert.deepEqual(decodeFundCard(encodeFundCard(c)), c);
  assert.throws(() => decodeFundCard("jitsuin-contact-v1:abc"), /not a JitsuinFi fund card/);
  assert.throws(() => decodeFundCard("jitsuin-fund-v1:!!"), /damaged/);
  assert.throws(() => decodeFundCard(encodeFundCard({ ...c, fund_pk: "zz" })), /incomplete/);
});
