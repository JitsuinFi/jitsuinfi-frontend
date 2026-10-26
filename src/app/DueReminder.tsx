// The buyer's invoices due soon (buyer-late, reminders without new infrastructure; IA port part 2,
// 2026-10-26): every invoice on this device due within a week or past its due date and not
// settled here. The shell puts their count on the Pay tab (and the nav's Pay); the past-due line
// itself is said only on the buyer's Invoices and Pay. Read from the encrypted device store when
// the session opens, on every new page and when the buyer's records change (the "jitsuin:buyer"
// event of pages/buyer/data.ts); nothing leaves the browser.
import { useEffect, useState } from "react";
import { isInvoiceId, type BuyerInvoice } from "../lib/buyer-invoices";
import { reminders, type Reminder } from "../lib/buyer-late";
import { today } from "../lib/core";
import type { Session } from "../lib/session";
import { useStoreVersion } from "./store-change";

export const BUYER_CHANGED = "jitsuin:buyer";

export function useDue(session: Session | null, path: string): Reminder[] {
  const [due, setDue] = useState<Reminder[]>([]);
  const [tick, setTick] = useState(0);
  const store = session?.role === "buyer" ? session.store : null;
  const written = useStoreVersion("buyer");
  useEffect(() => {
    const f = () => setTick((x) => x + 1);
    addEventListener(BUYER_CHANGED, f);
    return () => removeEventListener(BUYER_CHANGED, f);
  }, []);
  useEffect(() => {
    let live = true;
    if (!store) {
      setDue([]);
      return;
    }
    void store
      .list<BuyerInvoice>()
      .then((all) => {
        if (live) setDue(reminders(all.filter((r) => isInvoiceId(r.id)).map((r) => r.doc), today()));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, path, tick, written]);
  return due;
}
