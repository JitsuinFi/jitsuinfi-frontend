import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// No CDN: every asset (JS, CSS, WASM, fonts) is bundled and served from the same origin.
// One page (index.html): a React SPA routed by TanStack Router (HNK-31, D-52). The landing, the
// app and the financier console are three lazily loaded worlds; moving between worlds reloads the
// document, so their global stylesheets never meet.
// The relay (jitsuinfi-backend) is reached as /api/* on the app's own origin: a Vercel rewrite in
// production (HNK-23.T6), this proxy in development and preview. RELAY_URL overrides the target.
// /api/board is the live board snapshot of the financier node (HNK-30.T4); listed first so it
// wins over /api. NODE_URL overrides the target.
const relay = {
  "/api/board": { target: process.env.NODE_URL ?? "http://localhost:8788", changeOrigin: true, rewrite: () => "/node/board" },
  // The financier console (/console, HNK-26.T21) talks to the node through /node/*. The
  // browser's Origin header is kept, so the node must run with NODE_ORIGIN = this server.
  // changeOrigin rewrites only the Host header, which an https host such as Railway needs.
  "^/node/": { target: process.env.NODE_URL ?? "http://localhost:8788", changeOrigin: true },
  "/api": { target: process.env.RELAY_URL ?? "http://localhost:8787", changeOrigin: true },
};

// Same-origin only: no CDN, no third-party requests, no inline script. WASM needs
// 'wasm-unsafe-eval'. The meta copy goes into the build only: in development the React refresh
// preamble is an inline script. Production also sends the same policy as a header (vercel.json).
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const cspMeta = (): Plugin => ({
  name: "jitsuin-csp-meta",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
});

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), cspMeta()],
  server: { proxy: relay },
  preview: { proxy: relay },
  build: { target: "es2022", assetsInlineLimit: 0 },
});
