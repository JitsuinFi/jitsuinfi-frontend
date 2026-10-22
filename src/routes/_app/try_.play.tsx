import { createFileRoute } from "@tanstack/react-router";
import { TryPage } from "../../pages/TryPage";

export const Route = createFileRoute("/_app/try_/play")({ component: () => <TryPage autoplay /> });
