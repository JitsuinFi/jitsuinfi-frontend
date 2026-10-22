// The one entry (HNK-31, D-52): React + TanStack Router over the landing (/), the app (/app,
// /try, /supplier, ...) and the financier console (/console). Old addresses (app.html#/x,
// console.html) are moved to the clean paths before the router starts.
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { legacyTarget } from "./lib/legacy-url";
import { routeTree } from "./routeTree.gen";

const old = legacyTarget(location.pathname, location.search, location.hash);
if (old) history.replaceState(null, "", old);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// location.hash = "#/buyer" in the old pages still moves to that page
addEventListener("hashchange", () => {
  const to = legacyTarget(location.pathname, location.search, location.hash);
  if (to) void router.navigate({ to, replace: true });
});

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
