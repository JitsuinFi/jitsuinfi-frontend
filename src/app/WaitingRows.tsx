// Letters waiting on a ledger (user test 2026-10-27): the buyer got an invoice to sign but, on the
// desktop Invoices page, could not see how to receive it; it was only behind the bell. Each role's
// ledger now opens with a row per letter whose action leads into that section ("Waiting for you:
// Invoice to sign", the letter's own line, and its action). The row runs the letter's action from
// the inbox (app/inbox.ts `act`) and ends as the panel does (InboxPanel.tsx `arrive`): nothing is
// done twice, and a refusal shows under the row as it does on the envelope.
import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import type { Role } from "../lib/account";
import { explain } from "../lib/explain";
import { letterAction, letterGlyph, letterLabel, onLedger } from "../lib/inbox-routes";
import { reducedMotion } from "../landing/motion";
import { act, letGo, unhandled, type Letter } from "./inbox";
import { arrive, useInbox } from "./InboxPanel";
import { clearDid } from "./outcome";

export function WaitingRows({ role }: { role: Role }): ReactNode {
  const s = useInbox();
  const router = useRouter();
  if (s.role !== role) return null;
  const rows = s.letters.filter((l) => unhandled(l, s.handlers) && onLedger(role, l.r.message.header.type));
  if (!rows.length) return null;
  const run = async (l: Letter) => {
    const done = await act(l);
    if (!done) return; // the letter says why, under its row
    clearDid();
    if (!done.to) {
      setTimeout(() => letGo(l), reducedMotion() ? 2400 : 4000);
      return;
    }
    void router.navigate({ href: arrive(l, { ...done, to: done.to }) });
  };
  return (
    <section className="ia-wait" aria-label="Waiting for you in your inbox">
      {rows.map((l) => {
        const t = l.r.message.header.type;
        const a = letterAction(role, t)!;
        return (
          <div className="ia-wait-row" key={l.r.relayId} data-type={t}>
            <b lang="ja" aria-hidden="true">
              {letterGlyph(t)}
            </b>
            <span>
              <strong>{`Waiting for you: ${letterLabel(t, role, l.r.message.header.body)}`}</strong>
              <small>{l.about ?? `From a ${l.r.message.header.from.role}, ${new Date(l.r.receivedAt).toLocaleString()}.`}</small>
              {l.state === "failed" && l.error ? (
                <span className="ia-wait-no" role="alert">
                  <b lang="ja" aria-hidden="true">
                    拒
                  </b>
                  <span>{explain(l.error)}</span>
                </span>
              ) : null}
            </span>
            <button type="button" disabled={l.state === "busy"} onClick={() => void run(l)}>
              {l.state === "busy" ? "Working…" : a.label}
            </button>
          </div>
        );
      })}
    </section>
  );
}
