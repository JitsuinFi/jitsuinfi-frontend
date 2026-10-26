// One invoice at its opaque address (lib/deal-ref.ts): the 請求書, or the 債権譲渡通知書 once a
// letter is in hand, with its checks and seals.
import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "../../pages/buyer/DocumentPage";

export const Route = createFileRoute("/_app/buyer/invoices/$ref")({ component: Doc });

function Doc() {
  const { ref } = Route.useParams();
  return <DocumentPage invoiceRef={ref} />;
}
