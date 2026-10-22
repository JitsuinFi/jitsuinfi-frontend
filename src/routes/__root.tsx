import { createRootRoute, Navigate, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: Outlet,
  // an unknown path opens the landing, as an unknown hash route opened the lobby before
  notFoundComponent: () => <Navigate to="/" replace />,
});
