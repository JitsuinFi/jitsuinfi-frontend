import { createFileRoute } from "@tanstack/react-router";
import { ApplyPage } from "../../pages/ApplyPage";

export const Route = createFileRoute("/_app/apply")({ component: ApplyPage });
