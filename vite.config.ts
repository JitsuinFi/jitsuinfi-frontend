import { defineConfig } from "vite";

// No CDN: every asset (JS, CSS, WASM) is bundled and served from the same origin.
export default defineConfig({
  build: { target: "es2022", assetsInlineLimit: 0 },
});
