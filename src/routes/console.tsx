import { createFileRoute } from "@tanstack/react-router";
import { Console } from "../app/Console";

export const Route = createFileRoute("/console")({ component: Console });
