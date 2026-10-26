// One 払込票 payment slip at its invoice's opaque address.
import { createFileRoute } from "@tanstack/react-router";
import { PayPage } from "../../pages/buyer/PayPage";

export const Route = createFileRoute("/_app/buyer/pay/$ref")({ component: Slip });

function Slip() {
  const { ref } = Route.useParams();
  return <PayPage slipRef={ref} />;
}
