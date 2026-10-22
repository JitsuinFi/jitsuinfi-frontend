// HNK-31 (U-HNK-31.2): old addresses move to the clean paths, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyTarget } from "../src/lib/legacy-url.ts";

test("old app, console and hash addresses go to the clean paths", () => {
  assert.equal(legacyTarget("/app.html", "", ""), "/app");
  assert.equal(legacyTarget("/app.html", "", "#/"), "/app");
  assert.equal(legacyTarget("/app.html", "", "#/supplier"), "/supplier");
  assert.equal(legacyTarget("/app.html", "", "#/index"), "/rates");
  assert.equal(legacyTarget("/app.html", "", "#/try/play"), "/try/play");
  assert.equal(legacyTarget("/console.html", "", ""), "/console");
  assert.equal(legacyTarget("/console.html", "?view=pair", ""), "/console/pair");
  assert.equal(legacyTarget("/index.html", "", ""), "/");
  // in-app hash links on a clean path
  assert.equal(legacyTarget("/try", "", "#/apply"), "/apply");
  assert.equal(legacyTarget("/account", "", "#/buyer"), "/buyer");
});

test("current addresses and page anchors stay", () => {
  assert.equal(legacyTarget("/", "", "#story"), null);
  assert.equal(legacyTarget("/supplier", "", ""), null);
  assert.equal(legacyTarget("/rates", "", ""), null);
  // the pairing code rides in the hash of /console/pair and must never be read as a route
  assert.equal(legacyTarget("/console/pair", "", "#ABCDEFGHJKLMNPQR"), null);
  assert.equal(legacyTarget("/console/pair", "", "#/x"), null);
});
