import { createFileRoute } from "@tanstack/react-router";
import { Legacy } from "../../app/AppShell";

export const Route = createFileRoute("/_app/try_/play")({ component: () => <Legacy path="/try/play" /> });
