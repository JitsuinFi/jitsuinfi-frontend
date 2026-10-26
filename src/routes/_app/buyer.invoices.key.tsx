// Your next invoice key as its own screen (a phone goes deeper, not denser); on a desktop the same
// block sits in the Invoices caption.
import { createFileRoute } from "@tanstack/react-router";
import { KeyPage } from "../../pages/buyer/NextKey";

export const Route = createFileRoute("/_app/buyer/invoices/key")({ component: KeyPage });
