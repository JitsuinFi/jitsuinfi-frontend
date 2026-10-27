// Invoices (IA port 2026-10-26, approved prototype ia-supplier-invoices): the 台帳 ledger as the
// page's visual, one line per invoice with the station it waits at (照 署 登 印 金 済) and the
// next move. Long ledgers stay usable (user feedback C): your move first, then waiting, then the
// settled lines folded; a search by invoice number or buyer; "Show more" under each group. A
// line opens the deal at its own address (an opaque ref, never the number). Writing an invoice is
// its own page, so the ledger never pushes the sheet down.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page } from "../../app/AppShell";
import { LongList } from "../../app/LongList";
import { WaitingRows } from "../../app/WaitingRows";
import { DidLine, useDid } from "../../app/outcome";
import { daysToDate, zatToZec } from "../../lib/core";
import { dealPath } from "../../lib/deal-ref";
import { dealStage, nextMove, route, standing } from "../../lib/supplier-deal";
import { boardLine, invoiceFacts, isSettled, useBoard, useBook, useDeals, type Book, type Deal } from "./data";
import { buyerName, Caption, LEAD, nextLine, nowStation, ObjectDefs, STATION } from "./parts";
import "../supplier.css";

/** The six stations as small kanji: done in seal red, your move ringed, waiting dashed. */
export function Kticks({ d }: { d: Deal }): ReactNode {
  return (
    <span className="ia-kticks" aria-hidden="true">
      {route(d, isSettled(d)).map((s) => (
        <i key={s.key} lang="ja" className={s.state === "later" ? undefined : `is-${s.state}`}>
          {STATION[s.key].glyph}
        </i>
      ))}
    </span>
  );
}

/** One ledger line, a link to the deal. */
export function LedgerLine({ d, book, compact, current }: { d: Deal; book: Book | null; compact?: boolean; current?: boolean }): ReactNode {
  const settled = isSettled(d);
  const stations = route(d, settled);
  const now = nowStation(stations);
  const stands = standing(d, settled);
  const line = nextLine(nextMove(d), stands, daysToDate(d.due_date));
  const board = boardLine(d);
  const who = buyerName(book, d);
  return (
    <Link className={compact ? "ia-sw" : "sp-ln"} to={dealPath(d.ref)} aria-current={current ? "page" : undefined}>
      <span className="sp-ln-g" lang="ja" data-s={stands === "settled" ? "done" : now.state} aria-hidden="true">
        {STATION[now.key].glyph}
      </span>
      <span className={compact ? "ia-sw-id" : "sp-ln-id"}>{d.invoice_id}</span>
      <span className={compact ? "ia-sw-amt" : "sp-ln-amt"}>{`${zatToZec(d.amount_zat)} ZEC`}</span>
      {compact ? null : (
        <span className="sp-ln-meta">
          {`${who.name === "The buyer" ? "" : `${who.name} · `}due ${daysToDate(d.due_date)}`}
          <span className="sp-iss">{` · issued ${invoiceFacts(d).issued}`}</span>
        </span>
      )}
      {compact ? null : <Kticks d={d} />}
      <span className={`${compact ? "ia-sw-next" : "sp-ln-next"}${line.wait ? " is-wait" : ""}`}>
        <b>{line.lead}</b> {line.text}
      </span>
      {board && !compact ? <span className="sp-ln-board">{board}</span> : null}
      {compact ? null : <span className="ia-open">Open the deal →</span>}
    </Link>
  );
}

/** The ledger's words for a search: number, amount, buyer. */
export const ledgerWords = (book: Book | null) => (d: Deal) => {
  const who = buyerName(book, d);
  return `${d.invoice_id} ${zatToZec(d.amount_zat)} ZEC ${who.name} ${who.print} due ${daysToDate(d.due_date)}`;
};

export const LEDGER_LABELS = { move: "Needs your move", wait: "Waiting on others", done: "Settled" } as const;

export function InvoicesPage(): ReactNode {
  const deals = useDeals();
  const book = useBook();
  useBoard(deals);
  const shown = useDid("/supplier/invoices");
  if (!deals) return null;
  return (
    <Page wide>
      <div className="sp" data-wide="true">
        <ObjectDefs />
        <div className="sp-desk">
          <Caption title="Invoices" lede={LEAD} deals={deals} />
          <section className="ia-vis" aria-label="Your deals">
            {shown ? <DidLine did={shown} /> : null}
            {/* user test 2026-10-27: letters waiting in the inbox show here too, with their action */}
            <WaitingRows role="supplier" />
            <div className="ia-book">
              <section className="sp-ledger" aria-labelledby="sp-led">
                <div className="sp-ledger-h">
                  <h2 id="sp-led">
                    <b lang="ja">台帳</b>Your deals <small>newest first</small>
                  </h2>
                  <Link className="sp-pill" to="/supplier/invoices/new">
                    <b lang="ja" aria-hidden="true">
                      新
                    </b>
                    Write an invoice
                  </Link>
                </div>
                {deals.length ? (
                  <LongList
                    items={deals}
                    keyOf={(d) => d.n}
                    stage={(d) => dealStage(d, isSettled(d))}
                    words={ledgerWords(book)}
                    labels={LEDGER_LABELS}
                    searchLabel="Search by invoice number or buyer"
                    render={(d) => <LedgerLine d={d} book={book} />}
                  />
                ) : (
                  // an empty state with the next step, not blank ruled lines (audit 2026-10-27, finding 16)
                  <div className="ia-none">
                    <b lang="ja" aria-hidden="true">
                      新
                    </b>
                    <strong>No invoices yet</strong>
                    <p>Write your first invoice: it goes to the buyer's inbox to sign. Invoices written on another device with this passkey show here once it has synced.</p>
                    <Link className="ia-none-go" to="/supplier/invoices/new">
                      Write your first invoice
                    </Link>
                  </div>
                )}
              </section>
              <p className="ia-book-foot">
                <span>Each line: the station it waits at (照 署 登 印 金 済), and your next move.</span>
                <span>Kept encrypted, synced with your other devices.</span>
              </p>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}
