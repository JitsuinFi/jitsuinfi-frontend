// HNK-15.T1: the fund's unit tree, the same vector as jitsuinfi-zcash `units.rs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leafId, verifyPath } from "../src/lib/units.ts";

const v = JSON.parse(readFileSync(new URL("./vectors/units.json", import.meta.url), "utf8")) as { token: string; units: number; root: string; total: number; path: string };

test("a member's leaf checks against the root and total the manager signed", async () => {
  const id = await leafId(v.token);
  assert.equal(await verifyPath(id, BigInt(v.units), v.path, v.root, BigInt(v.total)), true);
  assert.equal(await verifyPath(id, BigInt(v.units + 1), v.path, v.root, BigInt(v.total)), false);
  assert.equal(await verifyPath(id, BigInt(v.units), v.path, v.root, BigInt(v.total - 1)), false);
  assert.equal(await verifyPath(await leafId("02".repeat(32)), BigInt(v.units), v.path, v.root, BigInt(v.total)), false);
  assert.equal(await verifyPath(id, BigInt(v.units), v.path.slice(0, -2) + "07", v.root, BigInt(v.total)), false);
});
