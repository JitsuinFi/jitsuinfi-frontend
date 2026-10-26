import { createFileRoute } from "@tanstack/react-router";
import { UnitsPage } from "../../pages/member/UnitsPage";

export const Route = createFileRoute("/_app/member/units")({ component: UnitsPage });
