import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "../../pages/buyer/HistoryPage";

export const Route = createFileRoute("/_app/buyer/history")({ component: HistoryPage });
