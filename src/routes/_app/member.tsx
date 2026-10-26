// The fund member's sections (IA port part 2, 2026-10-26): Fund, Units and Contacts open only in a
// member session; otherwise the account page asks to sign in (RoleGate). The old address /member
// opens the first section.
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";

export const Route = createFileRoute("/_app/member")({
  component: () => (
    <RoleGate role="member">
      <Outlet />
    </RoleGate>
  ),
});
