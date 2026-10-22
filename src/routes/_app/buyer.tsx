import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";
import { RoleGate } from "../../app/RoleGate";

export const Route = createFileRoute("/_app/buyer")({
  component: () => (
    <RoleGate role="buyer">
      <Legacy path="/buyer" />
    </RoleGate>
  ),
});
