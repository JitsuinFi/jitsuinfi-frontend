import { createFileRoute } from "@tanstack/react-router";
import { VerifyPage } from "../../pages/VerifyPage";

export const Route = createFileRoute("/_app/verify")({ component: VerifyPage });
