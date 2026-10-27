import { test } from "node:test";
import assert from "node:assert/strict";
import { senderWords } from "../src/lib/contact.ts";

test("an invoice names its supplier: @name, else not in contacts with the fingerprint (mobile E2E B-14)", () => {
  assert.equal(senderWords({ username: "tesmos", fingerprint: "AAAA-BBBB-CCCC-DDDD" }, "X"), "@tesmos");
  assert.equal(senderWords({ fingerprint: "AAAA-BBBB-CCCC-DDDD" }, "X"), "a supplier in your contacts · fingerprint AAAA-BBBB-CCCC-DDDD");
  assert.equal(senderWords(undefined, "KX3Q-7MAB-2VDE-SVJG"), "a supplier not in your contacts yet · fingerprint KX3Q-7MAB-2VDE-SVJG");
  assert.equal(senderWords(undefined, ""), "a supplier not in your contacts yet");
});
