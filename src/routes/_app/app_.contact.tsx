// A contact link (judge run 2, finding 5): /app/contact#<card>, the card in the fragment only.
import { createFileRoute } from "@tanstack/react-router";
import { ContactLinkPage } from "../../pages/ContactLinkPage";

export const Route = createFileRoute("/_app/app_/contact")({ component: ContactLinkPage });
