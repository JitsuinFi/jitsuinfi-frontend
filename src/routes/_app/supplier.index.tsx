import { createFileRoute, redirect } from "@tanstack/react-router";

// the old supplier page: its first section now
export const Route = createFileRoute("/_app/supplier/")({
  beforeLoad: () => {
    throw redirect({ to: "/supplier/invoices", replace: true });
  },
});
