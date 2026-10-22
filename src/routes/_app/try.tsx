import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";

export const Route = createFileRoute("/_app/try")({ component: () => <Legacy path="/try" /> });
