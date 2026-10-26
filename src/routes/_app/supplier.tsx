// The supplier's sections (IA port 2026-10-26): Invoices, Write an invoice, Deal and Contacts open
// only in a supplier session; otherwise the account page asks to sign in (RoleGate). The old
// address /supplier opens the first section.
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";

export const Route = createFileRoute("/_app/supplier")({
  component: () => (
    <RoleGate role="supplier">
      <Outlet />
    </RoleGate>
  ),
});
