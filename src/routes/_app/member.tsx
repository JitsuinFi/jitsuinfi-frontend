import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "../../app/RoleGate";
import { MemberPage } from "../../pages/MemberPage";

export const Route = createFileRoute("/_app/member")({
  component: () => (
    <RoleGate role="member">
      <MemberPage />
    </RoleGate>
  ),
});
