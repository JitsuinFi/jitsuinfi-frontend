import { createFileRoute, redirect } from "@tanstack/react-router";

// the old buyer page (and the old due reminder's link): its first section now
export const Route = createFileRoute("/_app/buyer/")({
  beforeLoad: () => {
    throw redirect({ to: "/buyer/invoices", replace: true });
  },
});
