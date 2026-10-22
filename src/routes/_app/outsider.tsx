import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";

export const Route = createFileRoute("/_app/outsider")({ component: () => <Legacy path="/outsider" /> });
