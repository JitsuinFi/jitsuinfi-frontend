import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "../../pages/ContactsPage";
import "../../pages/supplier.css";

export const Route = createFileRoute("/_app/supplier/contacts")({ component: () => <ContactsPage rootClass="sp" counter="Supplier's counter" /> });
