// One deal at its opaque address (lib/deal-ref.ts); ?at=<station> is a station's own screen on a
// phone (a history entry, so the back button returns to the deal) and the chosen station on a desktop.
import { createFileRoute } from "@tanstack/react-router";
import { DealPage } from "../../pages/supplier/DealPage";
import { isStation } from "../../pages/supplier/parts";
import type { StationKey } from "../../lib/supplier-deal";

export const Route = createFileRoute("/_app/supplier/deal/$ref")({
  validateSearch: (s: Record<string, unknown>): { at?: StationKey } => (isStation(s.at) ? { at: s.at } : {}),
  component: Deal,
});

function Deal() {
  const { ref } = Route.useParams();
  const { at } = Route.useSearch();
  return <DealPage dealRef={ref} at={at} />;
}
