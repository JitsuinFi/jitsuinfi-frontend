import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";

export const Route = createFileRoute("/_app/verify")({ component: () => <Legacy path="/verify" /> });
