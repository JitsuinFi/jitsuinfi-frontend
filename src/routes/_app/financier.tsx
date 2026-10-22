import { createFileRoute } from "@tanstack/react-router";
import { FinancierPage } from "../../pages/FinancierPage";

export const Route = createFileRoute("/_app/financier")({ component: FinancierPage });
