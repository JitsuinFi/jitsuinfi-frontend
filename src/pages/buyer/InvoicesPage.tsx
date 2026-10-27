// Invoices (IA port part 2, 2026-10-26, approved prototype ia-buyer-invoices): the buyer's ledger,
// one line per invoice addressed to the buyer's keys with its three seals (売 買 融) and what it
// waits for. Long ledgers stay usable (user feedback C): your move first, then waiting, then the
// settled lines folded; a search by invoice number; "Show more" under each group. A line opens the
// invoice at its own address (an opaque ref, never the number). The caption holds who you are and
// the next invoice key (on a phone that block is its own screen, one tap away), the big numbers
// and the past-due line.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { LongList } from "../../app/LongList";
import { DidLine, useDid } from "../../app/outcome";
import { buyerStage, hasSlip } from "../../lib/buyer-invoices";
import { invoicePath, slipPath } from "../../lib/deal-ref";
import { readablePrint } from "../../lib/print";
import { statusesOf, awaitsBoard, useBoard, useInvoices, useKeyInfo } from "./data";
import { KeyBlock } from "./NextKey";
import { DueLine, LEDE, LEDGER_LABELS, LedgerLine, ledgerWords, Tag, Totals } from "./parts";
import "../role-paper.css";
import "../buyer.css";

export function InvoicesPage(): ReactNode {
  const recs = useInvoices();
  const board = useBoard(awaitsBoard(Array.isArray(recs) ? recs : []));
  const phone = usePhone();
  const key = useKeyInfo();
  const shown = useDid("/buyer/invoices");
  const list = Array.isArray(recs) ? recs : [];
  const statuses = statusesOf(list, board);
  return (
    <Page wide>
      <div className="rp by">
        <section className="rp-sec" aria-labelledby="by-t">
          <div className="rp-cap">
            <Tag />
            <h1 id="by-t">Invoices</h1>
            <p className="rp-lede">{LEDE}</p>
            {phone ? (
              <Link className="ia-row-link" to="/buyer/invoices/key">
                <b lang="ja" aria-hidden="true">
                  鍵
                </b>
                <span>
                  <strong>Your next invoice key</strong>
                  <small>{key ? `#${key.k} · ${readablePrint(key.next)}` : "show it, and give it to a supplier"}</small>
                </span>
                <i aria-hidden="true">→</i>
              </Link>
            ) : null}
            {/* DS-MOB L5: the key block stays in the tree on a phone (its own screen there is one tap away), so a card pasted into it survives a resize */}
            <KeyBlock hidden={phone} />
            <Totals list={list} statuses={statuses} loading={recs === null} />
            <DueLine list={list} slipHref={(r) => (r.ref && hasSlip(r) ? slipPath(r.ref) : undefined)} />
          </div>
          <div className="rp-vis">
            {shown ? <DidLine did={shown} /> : null}
            <div className="rp-list-h">
              <h2>
                <b lang="ja" className="by-led-k">
                  台帳
                </b>
                Your invoices
              </h2>
              <span>kept encrypted on this device</span>
            </div>
            {recs === "blocked" ? (
              <p className="rp-empty">This browser blocks local storage, so received invoices are not kept.</p>
            ) : recs !== null && !list.length ? (
              // an empty state with the next step (audit 2026-10-27, finding 16)
              <div className="ia-none">
                <b lang="ja" aria-hidden="true">
                  帳
                </b>
                <strong>No invoices yet</strong>
                <p>Give a supplier your next invoice key: the invoice they write arrives in your inbox to sign.</p>
                <Link className="ia-none-go" to="/buyer/invoices/key">
                  Show my next invoice key
                </Link>
              </div>
            ) : (
              <LongList
                items={list}
                keyOf={(r) => r.n}
                stage={buyerStage}
                words={ledgerWords}
                labels={LEDGER_LABELS}
                searchLabel="Search by invoice number"
                className="by-ledger"
                render={(r) => <LedgerLine r={r} href={invoicePath(r.ref)} status={statuses?.[r.n]} />}
              />
            )}
            <p className="ia-book-foot by-foot">
              <span>Each line: its letter's seals (売 買 融) and what it waits for.</span>
              <Link to="/buyer/invoices/by-hand">An invoice code you were given by hand</Link>
            </p>
          </div>
        </section>
      </div>
    </Page>
  );
}
