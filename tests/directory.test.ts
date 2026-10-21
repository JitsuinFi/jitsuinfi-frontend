// HNK-30.T18: the financier directory as the node provider signs it (same vector as
// jitsuinfi-node `directory.rs`), and the supplier-side matching (HNK-30.T20).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rank, verifyDirectory, type Directory, type Listing } from "../src/lib/directory.ts";

const vector = JSON.parse(readFileSync(new URL("./vectors/directory.json", import.meta.url), "utf8")) as Directory;

test("the node's signed directory verifies; a changed one does not", async () => {
  assert.equal(await verifyDirectory(vector, vector.signer), true);
  const changed = structuredClone(vector);
  changed.financiers[0].mandate.max_zat = 1;
  assert.equal(await verifyDirectory(changed, vector.signer), false);
  assert.equal(await verifyDirectory(vector, "00".repeat(32)), false);
});

const l = (name: string, min: number, max: number, days: number): Listing => ({
  name,
  contact: "",
  financier_pk: name,
  listed_at: 0,
  mandate: { min_zat: min, max_zat: max, max_tenor_days: days, buyer_kyc: false },
});

test("rank: fitting financiers first, the closest tenor first, misses explained", () => {
  const r = rank([l("Wide", 0, 1e9, 365), l("Tight", 0, 1e9, 60), l("Small", 0, 1000, 365), l("Short", 0, 1e9, 30)], 40_000, 45);
  assert.deepEqual(r.map((f) => f.listing.name), ["Tight", "Wide", "Short", "Small"]);
  assert.equal(r[2].misses[0], "it finances at most 30 days");
  assert.equal(r[3].misses[0], "the invoice is above its largest amount");
});

test("the published public/directory.json is signed by the node provider of provider.ts", async () => {
  const { PROVIDER } = await import("../src/lib/provider.ts");
  const published = JSON.parse(readFileSync(new URL("../public/directory.json", import.meta.url), "utf8")) as Directory;
  assert.equal(await verifyDirectory(published, PROVIDER.signer_pk), true);
});
