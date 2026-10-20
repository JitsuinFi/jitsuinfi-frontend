import { defineConfig } from "vite";
import { resolve } from "node:path";

// No CDN: every asset (JS, CSS, WASM, fonts) is bundled and served from the same origin.
// Two pages: the landing (index.html) and the app (app.html).
// The relay (jitsuinfi-backend) is reached as /api/* on the app's own origin: a Vercel rewrite in
// production (HNK-23.T6), this proxy in development and preview. RELAY_URL overrides the target.
const relay = { "/api": { target: process.env.RELAY_URL ?? "http://localhost:8787", changeOrigin: true } };

export default defineConfig({
  server: { proxy: relay },
  preview: { proxy: relay },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app.html"),
      },
    },
  },
});
