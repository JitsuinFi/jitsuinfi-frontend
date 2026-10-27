// Audit 2026-10-27, finding 2: installing a console installs the console, not the app. index.html
// links /site.webmanifest, which is no file; vercel.json picks the manifest by host, before the
// console hosts' catch-all. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const vercel = json("vercel.json") as { rewrites: Array<{ source: string; destination: string; has?: Array<{ value: string }> }>; redirects: Array<{ source: string; destination: string; has?: Array<{ value: string }> }> };
const CONSOLES = ["jitsuinfi-console-demo.vercel.app", "jitsuinfi-console.vercel.app"];
const hostOf = (r: { has?: Array<{ value: string }> }) => r.has?.[0]?.value ?? null;

test("index.html links the host-picked manifest, and it is no file", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest" \/>/);
  assert.equal(existsSync(new URL("public/site.webmanifest", root)), false);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
});

test("each console host gets the console's manifest before its catch-all; every other host the app's", () => {
  for (const host of CONSOLES) {
    const first = vercel.rewrites.find((r) => (hostOf(r) === host || hostOf(r) === null) && (r.source === "/site.webmanifest" || r.source === "/:path*" || r.source.startsWith("/((?!")));
    assert.equal(first?.source, "/site.webmanifest", host);
    assert.equal(first?.destination, "/console.webmanifest", host);
  }
  const other = vercel.rewrites.find((r) => r.source === "/site.webmanifest" && !r.has);
  assert.equal(other?.destination, "/manifest.webmanifest");
  for (const host of CONSOLES) assert.ok(vercel.redirects.some((r) => hostOf(r) === host && r.source === "/app" && r.destination === "/console"), `${host} /app`);
});

test("the two manifests are two apps with the same icons, one maskable icon padded per size", () => {
  const app = json("public/manifest.webmanifest");
  const con = json("public/console.webmanifest");
  assert.equal(app.start_url, "/app");
  assert.equal(con.start_url, "/console");
  assert.equal(con.name, "JitsuinFi Console");
  assert.notEqual(app.id, con.id);
  assert.notEqual(app.short_name, con.short_name);
  assert.deepEqual(app.icons, con.icons);
  const masks = app.icons.filter((i: { purpose: string }) => i.purpose === "maskable");
  assert.deepEqual(masks.map((i: { src: string }) => i.src), ["/icons/icon-maskable-192.png", "/icons/icon-maskable-512.png"]);
  for (const i of app.icons) assert.ok(existsSync(new URL("public" + i.src, root)), i.src);
});
