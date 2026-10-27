import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NotFound } from "../app/NotFound";

export const Route = createRootRoute({
  component: Outlet,
  // an unknown path says so, with the way back to Home (audit 2026-10-27, finding 19)
  notFoundComponent: NotFound,
});
