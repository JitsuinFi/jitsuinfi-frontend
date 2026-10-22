import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";
import { BuyerPage } from "../../pages/BuyerPage";

export const Route = createFileRoute("/_app/buyer")({
  component: () => (
    <RoleGate role="buyer">
      <BuyerPage />
    </RoleGate>
  ),
});
