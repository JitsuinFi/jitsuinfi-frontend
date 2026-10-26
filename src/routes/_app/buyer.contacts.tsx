import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "../../pages/ContactsPage";
import "../../pages/role-paper.css";

export const Route = createFileRoute("/_app/buyer/contacts")({ component: () => <ContactsPage rootClass="rp" counter="Buyer's counter" /> });
