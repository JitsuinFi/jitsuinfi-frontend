import { createFileRoute } from "@tanstack/react-router";
import { NewInvoicePage } from "../../pages/supplier/NewInvoicePage";

export const Route = createFileRoute("/_app/supplier/invoices/new")({ component: NewInvoicePage });
