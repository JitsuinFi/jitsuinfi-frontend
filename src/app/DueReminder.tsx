// The shell's due-date reminder for a buyer (buyer-late, reminders without new infrastructure):
// on every app screen but /buyer (which says it in its caption), one line for each invoice on
// this device due within a week or past its due date and not settled here, with a link to its
// slip. Read from the encrypted device store when the session opens; nothing leaves the browser.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { isInvoiceId, type BuyerInvoice } from "../lib/buyer-invoices";
import { reminders, reminderText, type Reminder } from "../lib/buyer-late";
import { today, zatToZec } from "../lib/core";
import type { Session } from "../lib/session";

export function DueReminder({ session, path }: { session: Session | null; path: string }): ReactNode {
  const [due, setDue] = useState<Reminder[]>([]);
  const store = session?.role === "buyer" ? session.store : null;
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
  }, [store, path]);
  if (!store || path === "/buyer" || !due.length) return null;
  const over = due.some((d) => d.state.kind === "overdue");
  return (
    <p className={`due-note${over ? " is-over" : ""}`} role="status">
      <span className="due-note-hk" lang="ja" aria-hidden="true">
        期
      </span>
      <span>
        <b>{over ? "Past due." : "Due soon."}</b> {due.map((d) => reminderText(d, `${zatToZec(d.amount_zat)} ZEC`)).join(" ")}{" "}
        <Link to="/buyer">Pay on the slip</Link>
      </span>
    </p>
  );
}
