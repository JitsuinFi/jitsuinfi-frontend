import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "../../pages/ContactsPage";
import "../../pages/role-paper.css";

export const Route = createFileRoute("/_app/member/contacts")({ component: () => <ContactsPage rootClass="rp" counter="Fund member" /> });
