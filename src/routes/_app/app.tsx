import { createFileRoute } from "@tanstack/react-router";
import { Lobby } from "../../app/Lobby";

export const Route = createFileRoute("/_app/app")({ component: Lobby });
