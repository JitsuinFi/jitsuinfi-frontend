import { createFileRoute } from "@tanstack/react-router";
import { OutsiderPage } from "../../pages/OutsiderPage";

export const Route = createFileRoute("/_app/outsider")({ component: OutsiderPage });
