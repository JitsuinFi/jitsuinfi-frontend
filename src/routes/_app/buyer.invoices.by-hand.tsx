// An invoice code given by hand, not through the inbox: the blank desk with its codes open.
import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "../../pages/buyer/DocumentPage";

export const Route = createFileRoute("/_app/buyer/invoices/by-hand")({ component: () => <DocumentPage /> });
