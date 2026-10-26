// Judge run 2, finding 7: the advance address is checked before the offer goes out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressProblem, bech32Encode, bech32Kind } from "../src/lib/zaddr.ts";

// a real testnet unified address (zcash-devtool wallet-b, 2026-10-26)
const REAL = "utest1wwah3tr27erzmgghkrskz56e2mlltsu3cg73748q8qjfcvlnhkhl53z48u9eqrlx9zl4k8wsnxx9dqwnltzp0p8alyufs7w6ftamnpk0d577szff20gcgyrcvktwky9e677s2993zdkpysef3lycccrmc9n4gs6fa9dt7982l3hkckl40xhcvzq79azgrhr36y8fg95ph4tzqzmsn7q";
const data = Array.from({ length: 70 }, (_, i) => (i * 7) % 32);

test("a real unified testnet address holds", () => {
  assert.equal(bech32Kind(REAL), "bech32m");
  assert.equal(addressProblem(REAL, "test"), null);
  assert.equal(addressProblem(`  ${REAL}\n`, "test"), null, "spaces around it are trimmed");
});

test("a Sapling address (Bech32) holds on its network", () => {
  assert.equal(addressProblem(bech32Encode("ztestsapling", data, "bech32"), "test"), null);
  assert.equal(addressProblem(bech32Encode("zs", data, "bech32"), "main"), null);
  assert.equal(addressProblem(bech32Encode("u", data, "bech32m"), "main"), null);
});

test("a cut or changed address is refused", () => {
  assert.match(addressProblem(REAL.slice(0, -1), "test")!, /cut or mistyped/);
  const flipped = REAL.slice(0, 40) + (REAL[40] === "q" ? "p" : "q") + REAL.slice(41);
  assert.match(addressProblem(flipped, "test")!, /cut or mistyped/);
  assert.match(addressProblem(REAL.slice(0, 60) + " " + REAL.slice(60), "test")!, /space/);
});

test("transparent, other-network, empty and foreign addresses are refused in plain words", () => {
  assert.match(addressProblem("", "test")!, /starts with utest1/);
  assert.match(addressProblem("tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd", "test")!, /transparent/);
  assert.match(addressProblem(bech32Encode("u", data, "bech32m"), "test")!, /for mainnet/);
  assert.match(addressProblem("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "test")!, /not a Zcash shielded/);
  assert.match(addressProblem(REAL.toUpperCase(), "test")!, /small letters|cut or mistyped/);
});
