// The app world: jitsuin-wasm loads before any screen, as app.html waited for it.
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../app/AppShell";

export const Route = createFileRoute("/_app")({
  loader: async () => {
    const { loadWasm } = await import("../lib/core");
    await loadWasm();
  },
  component: AppShell,
  errorComponent: ({ error }) => (
    <main>
      <h1>Could not load</h1>
      <p>{String(error)}</p>
    </main>
  ),
});
