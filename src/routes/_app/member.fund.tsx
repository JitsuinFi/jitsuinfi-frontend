import { createFileRoute } from "@tanstack/react-router";
import { FundPage } from "../../pages/member/FundPage";

export const Route = createFileRoute("/_app/member/fund")({ component: FundPage });
