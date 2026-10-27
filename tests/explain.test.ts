// HNK-21.T9: refusals from the crates read as sentences.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explain, stopReason } from "../src/lib/explain.ts";

test("known refusals become sentences, unknown ones pass through", () => {
  assert.match(explain("history: certificate 2 is not anchored on the board"), /Certificate #2 .* never registered/);
  assert.match(explain("core: seal out of policy order"), /supplier seals first/);
  assert.match(explain("not settled: 10 of 50 zat paid"), /Only 10 of 50 zat/);
  assert.match(explain("supplier entry rejected: commitment differs"), /\(commitment differs\)/);
  assert.match(explain("input truncated"), /not a complete JitsuinFi document/);
  assert.equal(explain("something new"), "something new");
});

test("a stopped deal reads as a sentence, from a code or an older node's dump (HNK-32.T3)", () => {
  assert.match(stopReason("AlreadyFinanced", "ab".repeat(32)), /^Already financed by another financier \(first entry abababab…abab\)\. .*no money left this node/);
  assert.match(stopReason("AlreadyFinanced { winner: BoardRecord { txid: \"x\" } }"), /^Already financed .* no entry was posted/);
  assert.match(stopReason("DoubleFinanced"), /more than one financier/);
  assert.equal(stopReason("Other"), "Stopped: Other.");
});

test("the node's network and balance errors read as sentences (HNK-32)", () => {
  assert.match(explain("board: lightwalletd: error sending request for url (https://testnet.zec.rocks/x)"), /did not answer in time\. Nothing was sent/);
  assert.match(explain("Error: `enhance` gave up after 300 s without an answer"), /did not answer in time/);
  assert.match(explain("zcash-devtool: Error: Insufficient balance (have 0, need 20000 including fee)"), /has 0 zat it can spend now and needs 20000/);
});

test("a message on screen is a sentence: capital first, full stop last (audit 2026-10-27)", async () => {
  const { asSentence } = await import("../src/lib/explain.ts");
  assert.equal(asSentence("paste the contact card or link they sent you"), "Paste the contact card or link they sent you.");
  assert.equal(asSentence("Done!"), "Done!");
  assert.equal(asSentence("  "), "");
});

test("the relay down reads as an outage to retry, not a refusal (messy-state E2E 2026-10-27)", async () => {
  const { isRelayOutage } = await import("../src/lib/explain.ts");
  assert.match(explain("the relay answered 502"), /^The relay is not answering right now \(502\)\. Nothing is lost: try again/);
  assert.match(explain("the relay cannot be reached; check your connection and try again"), /could not be reached\. Nothing is lost/);
  assert.equal(isRelayOutage("the relay answered 503"), true);
  assert.equal(isRelayOutage("the relay answered 404"), false);
  assert.equal(isRelayOutage("relay: mailbox not found"), false);
});
