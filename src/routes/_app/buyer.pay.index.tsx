import { createFileRoute } from "@tanstack/react-router";
import { PayPage } from "../../pages/buyer/PayPage";

export const Route = createFileRoute("/_app/buyer/pay/")({ component: () => <PayPage /> });
