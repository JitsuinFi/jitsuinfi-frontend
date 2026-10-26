// The buyer's sections (IA port part 2, 2026-10-26): Invoices, Pay, History and Contacts open only
// in a buyer session; otherwise the account page asks to sign in (RoleGate). The old address
// /buyer opens the first section.
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";

export const Route = createFileRoute("/_app/buyer")({
  component: () => (
    <RoleGate role="buyer">
      <Outlet />
    </RoleGate>
  ),
});
