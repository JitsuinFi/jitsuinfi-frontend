import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "../../pages/buyer/InvoicesPage";

export const Route = createFileRoute("/_app/buyer/invoices/")({ component: InvoicesPage });
