import { createFileRoute } from "@tanstack/react-router";
import { DealTab } from "../../pages/supplier/DealPage";

// the Deal tab: the last deal opened on this device
export const Route = createFileRoute("/_app/supplier/deal/")({ component: DealTab });
