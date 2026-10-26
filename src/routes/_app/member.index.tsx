import { createFileRoute, redirect } from "@tanstack/react-router";

// the old fund member page: its first section now
export const Route = createFileRoute("/_app/member/")({
  beforeLoad: () => {
    throw redirect({ to: "/member/fund", replace: true });
  },
});
