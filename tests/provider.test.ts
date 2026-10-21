// HNK-26.T25: an applicant opens only a JitsuinFi console pairing link from a signed invite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteLinkOk } from "../src/lib/provider.ts";

test("only https JitsuinFi console pairing links with a code", () => {
  assert.equal(inviteLinkOk("https://jitsuinfi-console.vercel.app/console/pair#ABCD-EFGH-IJKL-MNOP"), true);
  assert.equal(inviteLinkOk("https://jitsuinfi-console-kurogane.vercel.app/console/pair#ABCD"), true);
  assert.equal(inviteLinkOk("http://jitsuinfi-console.vercel.app/console/pair#ABCD"), false);
  assert.equal(inviteLinkOk("https://evil.example/console/pair#ABCD"), false);
  assert.equal(inviteLinkOk("https://jitsuinfi-console.vercel.app.evil.example/console/pair#ABCD"), false);
  assert.equal(inviteLinkOk("https://jitsuinfi-console.vercel.app/console/pair"), false);
  assert.equal(inviteLinkOk("not a link"), false);
});
