import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";
import { RoleGate } from "../../app/RoleGate";

export const Route = createFileRoute("/_app/supplier")({
  component: () => (
    <RoleGate role="supplier">
      <Legacy path="/supplier" />
    </RoleGate>
  ),
});
