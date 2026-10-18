import { defineConfig } from "vite";
import { resolve } from "node:path";

// No CDN: every asset (JS, CSS, WASM, fonts) is bundled and served from the same origin.
// Two pages: the landing (index.html) and the app (app.html).
export default defineConfig({
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
