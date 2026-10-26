import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "../../pages/supplier/InvoicesPage";

export const Route = createFileRoute("/_app/supplier/invoices/")({ component: InvoicesPage });
