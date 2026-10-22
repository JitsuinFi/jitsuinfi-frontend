import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";
import { SupplierPage } from "../../pages/SupplierPage";

export const Route = createFileRoute("/_app/supplier")({
  component: () => (
    <RoleGate role="supplier">
      <SupplierPage />
    </RoleGate>
  ),
});
