// Judge run 2, finding 1: the open invoice follows its stored record while it is open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storedCodes, syncedCodes } from "../src/lib/desk-sync.ts";

const inv = { invoice: "JTSI-1" };

test("a letter and a seal kept from the inbox fill the open sheet", () => {
  const was = storedCodes(inv);
  const stored = storedCodes({ ...inv, assignment: { letter: "L", supplier_seal: "S" } });
  assert.deepEqual(syncedCodes(was, stored, { inv: "JTSI-1", letter: "", seal: "" }), { inv: "JTSI-1", letter: "L", seal: "S" });
});

test("nothing changes when the record did not", () => {
  const c = storedCodes({ ...inv, assignment: { letter: "L" } });
  assert.equal(syncedCodes(c, c, { inv: "JTSI-1", letter: "L", seal: "" }), null);
});

test("a field the buyer typed by hand keeps what they typed", () => {
  const was = storedCodes(inv);
  const stored = storedCodes({ ...inv, assignment: { letter: "L", supplier_seal: "S" } });
  assert.deepEqual(syncedCodes(was, stored, { inv: "JTSI-1", letter: "MINE", seal: "" }), { inv: "JTSI-1", letter: "MINE", seal: "S" });
});

test("a record without a sheet yet reads as empty codes", () => {
  assert.deepEqual(storedCodes(undefined), { inv: "", letter: "", seal: "" });
});

test("a field that already follows its new stored value needs no change (the page then compares with what it draws)", () => {
  const was = storedCodes(inv);
  const stored = storedCodes({ ...inv, assignment: { letter: "L" } });
  assert.equal(syncedCodes(was, stored, { inv: "JTSI-1", letter: "L", seal: "" }), null);
});
