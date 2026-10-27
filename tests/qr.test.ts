// The app's QR (2026-10-27): the wasm's SVG read back into modules, drawn with an exact 4-module
// quiet zone at a whole number of pixels per module, and still a QR any camera reads (jsQR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import init, * as w from "../src/wasm/jitsuin_wasm.js";
import { parseQrSvg, qrFit, qrPath, qrPixels, qrSpan, QR_CAP, QUIET, MIN_MODULE } from "../src/lib/qr.ts";
import { contactLink, type Contact } from "../src/lib/contact.ts";

await init({ module_or_path: readFileSync(new URL("../src/wasm/jitsuin_wasm_bg.wasm", import.meta.url)) });

const card: Contact = { v: 1, role: "supplier", username: "tes-supplier", mailbox_pk: "ab".repeat(32), fingerprint: "DWLA-XGW7-FUVZ-S4WD" };
const INK: [number, number, number] = [0x02, 0x0d, 0x2f];
const SHEET: [number, number, number] = [0xfc, 0xfc, 0xfe];

test("the wasm's QR reads back as a square code of a real version", () => {
  const g = parseQrSvg(w.qrSvg("hello world"));
  assert.equal(g.n, 21); // version 1
  assert.equal(qrSpan(g), 21 + 2 * QUIET);
  // the finder pattern's corner is dark, the module beside its ring is light
  assert.equal(g.dark[0], 1);
  assert.equal(g.dark[7], 0);
});

test("a contact link and a payment request drawn by the app decode back to their text", () => {
  const link = contactLink("https://jitsuinfi.vercel.app", card);
  const uri = (JSON.parse(w.paymentRequest("utest1s2gsurwfaat8ehuz3a3v2egu75qj6fgmenjf6y2l2q5m9dttvrhzhqaz3ggdgfq3nn36f2lt2vz9ecqq8emsmptf5c2ztte2n7sw2km4sxh0mdsvy06rkzxkekn48jl9cad5hj4hv74kd7gd8rrds3tl65gzard2tmnrkmtzj2ll8dfac6xq7kudfmqyxk8093349cfhpa8r23eqa2s", 90000n)) as { uri: string; qr_svg: string });
  for (const [text, svg] of [[link, w.qrSvg(link)], [uri.uri, uri.qr_svg]]) {
    const g = parseQrSvg(svg);
    const { size, data } = qrPixels(g, 4, INK, SHEET);
    assert.equal(jsQR(data, size, size)?.data, text);
  }
});

test("the quiet zone is exactly four light modules on every side", () => {
  const g = parseQrSvg(w.qrSvg("jitsuin"));
  const { size, data } = qrPixels(g, 1, INK, SHEET);
  const dark = (x: number, y: number) => data[(y * size + x) * 4] === INK[0];
  for (let i = 0; i < size; i++) for (let q = 0; q < QUIET; q++) {
    assert.ok(!dark(i, q) && !dark(i, size - 1 - q) && !dark(q, i) && !dark(size - 1 - q, i));
  }
  assert.ok(dark(QUIET, QUIET));
});

test("the path is in module units, offset by the quiet zone, rows merged", () => {
  const g = { n: 21, dark: new Uint8Array(21 * 21) };
  g.dark.fill(1, 0, 3);
  g.dark[21 + 5] = 1;
  assert.equal(qrPath(g), "M4 4h3v1h-3zM9 5h1v1h-1z");
});

test("the size is a whole number of pixels per module, capped, never stretched", () => {
  const span = 29 + 8; // version 3 with its quiet zone
  assert.deepEqual(qrFit(span, 358, QR_CAP.phone), { module: 7, px: 259 });
  assert.deepEqual(qrFit(span, 1000, QR_CAP.wide), { module: 6, px: 222 });
  assert.deepEqual(qrFit(span, 200, QR_CAP.wide), { module: 5, px: 185 });
  // too narrow still draws one pixel a module, never a fraction
  assert.deepEqual(qrFit(span, 10, QR_CAP.wide), { module: 1, px: 37 });
  for (let avail = 40; avail < 600; avail += 7) {
    const f = qrFit(span, avail, QR_CAP.phone);
    assert.ok(Number.isInteger(f.module) && f.px === f.module * span && (f.px <= Math.min(avail, QR_CAP.phone) || f.module === 1));
  }
});

test("a dense payment request grows past the cap to keep three pixels a module, never past the room", () => {
  const span = 113 + 8;
  assert.deepEqual(qrFit(span, 520, QR_CAP.wide), { module: MIN_MODULE, px: 363 });
  assert.deepEqual(qrFit(span, 358, QR_CAP.phone), { module: 2, px: 242 });
  assert.deepEqual(qrFit(span, 100, QR_CAP.phone), { module: 1, px: 121 });
});

test("a drawing that is not a QR is refused", () => {
  assert.throws(() => parseQrSvg("<svg></svg>"), /not a QR/);
  assert.throws(() => parseQrSvg('<svg><path d="M0 0h1v1H0V0M5 0h1v1H5V0"/></svg>'), /not square/);
});
