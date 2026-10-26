// Deal (IA port 2026-10-26, approved prototype ia-supplier-deal): one invoice at its own address,
// /supplier/deal/<ref> (an opaque ref made on this device: no invoice data in the history). On a
// desktop the wide master–detail: the caption names the deal, its facts and your other deals; the
// visual is the route of six stations over the 請求書 beside the chosen station's work.
// On a phone it goes deeper instead of denser (user feedback D): the deal screen shows the route,
// the facts and one primary action; tapping a station opens that station's work as its own screen
// (?at=<station>, a real history entry, so the phone's back button returns to the deal).
// The Deal tab (/supplier/deal) opens the last deal opened here.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { useInbox } from "../../app/InboxPanel";
import { lettersFor } from "../../app/inbox";
import { LongList } from "../../app/LongList";
import { clearDid, DidLine, useDid } from "../../app/outcome";
import { Button } from "../../app/ui";
import { daysToDate, zatToZec } from "../../lib/core";
import { byRef, dealPath } from "../../lib/deal-ref";
import { download } from "../../lib/download";
import { dealStage, nextMove, route, standing, type StationKey } from "../../lib/supplier-deal";
import { reducedMotion } from "../../landing/motion";
import { Seikyusho, type SheetFields } from "../try/Seikyusho";
import { boardLine, invoiceFacts, isSettled, lastDeal, pdfOf, rememberDeal, useBoard, useBook, useDeals, type Book, type Deal } from "./data";
import { LEDGER_LABELS, LedgerLine, ledgerWords } from "./InvoicesPage";
import { freshN } from "./NewInvoicePage";
import { buyerName, isStation, nextLine, nowStation, ObjectDefs, Rail, STATION } from "./parts";
import { StationWork } from "./stations";
import "../supplier.css";

// Each deal's station states as last drawn: a station that turns done is stamped 済 once.
const seen = new Map<string, string>();
// the phone pushed a station screen: its back control goes back in history
let pushed = false;

const useSheetFields = (): SheetFields => ({ id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) });

/** N resolves digit by digit, left to right (MASTER §5: 20 ms apart, then settles). */
function resolveN(el: HTMLElement, n: string): void {
  const rows = Array.from(el.querySelectorAll("span"));
  if (rows.length !== 4) return;
  const HEX = "0123456789abcdef";
  const t0 = performance.now();
  el.classList.add("is-resolving");
  const tick = (t: number) => {
    const e = t - t0;
    let done = true;
    rows.forEach((row, r) => {
      row.textContent = Array.from(n.slice(r * 16, r * 16 + 16), (c, j) => {
        if (e > ((r * 16 + j) * 20) / 3 + 400) return c;
        done = false;
        return HEX[(Math.random() * 16) | 0];
      }).join("");
    });
    if (!done) requestAnimationFrame(tick);
    else el.classList.remove("is-resolving");
  };
  requestAnimationFrame(tick);
}

/** /supplier/deal: the last deal opened here, else the first one that needs your move. */
export function DealTab(): ReactNode {
  const deals = useDeals();
  const navigate = useNavigate();
  useEffect(() => {
    if (!deals?.length) return;
    const d = byRef(deals, lastDeal() ?? undefined) ?? deals.find((x) => dealStage(x, isSettled(x)) === "move") ?? deals[0];
    void navigate({ to: dealPath(d.ref), replace: true });
  }, [deals, navigate]);
  if (!deals || deals.length) return null;
  return (
    <Page wide>
      <div className="sp" data-wide="true">
        <div className="ia-empty">
          <p className="sp-tag">
            <b lang="ja">売</b>Supplier's counter<i className="ia-dot" aria-hidden="true">·</i>
            <span className="ia-sec">Deal</span>
          </p>
          <h1>No deal yet</h1>
          <p className="sp-lede">A deal starts with an invoice. Write one: it goes to the buyer's inbox to sign, and its route opens here.</p>
          <p className="ia-goline">
            <Link className="sp-pill" to="/supplier/invoices/new">
              <b lang="ja" aria-hidden="true">
                新
              </b>
              Write an invoice
            </Link>
          </p>
        </div>
      </div>
    </Page>
  );
}

export function DealPage({ dealRef: r, at }: { dealRef: string; at?: string }): ReactNode {
  const deals = useDeals();
  const book = useBook();
  useBoard(deals);
  if (!deals) return null;
  const d = byRef(deals, r);
  if (!d) {
    return (
      <Page wide>
        <div className="sp" data-wide="true">
          <div className="ia-empty">
            <h1>This deal is not on this device</h1>
            <p className="sp-lede">Deals are kept encrypted in this browser only. Open one from your ledger.</p>
            <p className="ia-goline">
              <Link className="sp-ink" to="/supplier/invoices">
                Your invoices
              </Link>
            </p>
          </div>
        </div>
      </Page>
    );
  }
  return <Desk key={d.ref} d={d} deals={deals} book={book} at={isStation(at) ? at : undefined} />;
}

function Desk({ d, deals, book, at }: { d: Deal; deals: Deal[]; book: Book | null; at?: StationKey }): ReactNode {
  const phone = usePhone();
  const navigate = useNavigate();
  const router = useRouter();
  const path = dealPath(d.ref);
  const settled = isSettled(d);
  const stations = route(d, settled);
  const sel = at ?? nowStation(stations).key;
  const shown = useDid(path);
  const inbox = useInbox();
  useEffect(() => rememberDeal(d.ref), [d.ref]);

  // the stations that turned done since this deal was last drawn: each gets its 済 pressed once
  const states = stations.map((s) => s.state).join(",");
  const [stamp, setStamp] = useState<Set<StationKey>>(() => new Set());
  useLayoutEffect(() => {
    const was = seen.get(d.n)?.split(",");
    if (was) setStamp(new Set(stations.filter((s, i) => s.state === "done" && was[i] !== "done").map((s) => s.key)));
    seen.set(d.n, states);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  /** Picks a station: on a phone its work opens as its own screen. */
  const pick = (k: StationKey) => {
    clearDid();
    if (phone) {
      pushed = true;
      void navigate({ to: path, search: { at: k } as never });
    } else void navigate({ to: path, search: (k === nowStation(stations).key ? {} : { at: k }) as never, replace: true });
  };
  /** An action finished: back to the deal (the route moved on, and the outcome is on top). */
  const onDone = () => {
    if (phone && at && pushed) {
      pushed = false;
      router.history.back();
    } else if (at) void navigate({ to: path, search: {} as never, replace: true });
  };
  const back = () => {
    clearDid();
    if (pushed) {
      pushed = false;
      router.history.back();
    } else void navigate({ to: path, search: {} as never, replace: true });
  };

  const move = nextMove(d);
  const stands = standing(d, settled);
  const line = nextLine(move, stands, daysToDate(d.due_date));
  const board = boardLine(d);
  const who = buyerName(book, d);
  const facts = invoiceFacts(d);
  const waiting = lettersFor(inbox, d.n).length;
  const work = <StationWork key={sel} d={d} book={book} path={path} onDone={onDone} station={sel} stations={stations} />;

  const factsList = (
    <dl className="ia-facts">
      <div>
        <dt>Buyer</dt>
        <dd>
          {who.name}
          <code>{who.print}</code>
        </dd>
      </div>
      <div>
        <dt>Due</dt>
        <dd>{daysToDate(d.due_date)}</dd>
      </div>
      <div>
        <dt>Issued</dt>
        <dd>{facts.issued}</dd>
      </div>
      <div>
        <dt>Fingerprint N</dt>
        <dd>
          <code>{`${d.n.slice(0, 16)}…${d.n.slice(-8)}`}</code>
        </dd>
      </div>
      {waiting ? (
        <div>
          <dt>In your inbox</dt>
          <dd>{`${waiting} letter${waiting > 1 ? "s" : ""} about this deal`}</dd>
        </div>
      ) : null}
    </dl>
  );
  const railArea = (
    <div className="sp-rail-area">
      <Rail stations={stations} selected={phone ? null : sel} onPick={pick} stamp={stamp} />
      <p className="sp-rail-cap" aria-live="polite">
        <span>
          <b>{line.lead}</b> {move ? `${line.text}.` : line.text}
        </span>
        {board ? <span className="sp-board-line">{board}</span> : null}
      </p>
    </div>
  );
  const title = (
    <h1 id="sp-h1" className="ia-deal-id">
      {d.invoice_id}
      <span>{`${zatToZec(d.amount_zat)} ZEC`}</span>
    </h1>
  );
  const tag = (
    <p className="sp-tag">
      <b lang="ja">売</b>Supplier's counter<i className="ia-dot" aria-hidden="true">·</i>
      <span className="ia-sec">Deal</span>
    </p>
  );

  if (phone && at) {
    // ---- a phone: the station's work as its own screen ----
    return (
      <Page wide>
        <div className="sp" data-wide="true">
          <ObjectDefs />
          <div className="ia-station">
            <button type="button" className="ia-back" onClick={back}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10 3L5 8l5 5" />
              </svg>
              <span>
                <b>{d.invoice_id}</b>
                <small>{`${zatToZec(d.amount_zat)} ZEC · back to the deal`}</small>
              </span>
            </button>
            <section className="sp-work" aria-label="This station's work">
              {work}
            </section>
          </div>
        </div>
      </Page>
    );
  }

  if (phone) {
    // ---- a phone: the deal screen (route, facts, one primary action) ----
    const now = nowStation(stations);
    const act = now.state === "next" || now.state === "wait";
    return (
      <Page wide>
        <div className="sp" data-wide="true">
          <ObjectDefs />
          <div className="ia-deal-phone">
            {tag}
            {title}
            {shown ? <DidLine did={shown} /> : null}
            {railArea}
            <div className="ia-deal-go">
              <Button onClick={() => pick(now.key)}>{act ? `${STATION[now.key].glyph}  ${now.state === "wait" ? "See what it waits for" : move?.text ? move.text.charAt(0).toUpperCase() + move.text.slice(1) : STATION[now.key].label}` : "See the settlement"}</Button>
            </div>
            {factsList}
            <details className="sp-fold ia-sheet-fold">
              <summary>
                <b lang="ja">請求書</b> The invoice
              </summary>
              <DealSheet d={d} settled={settled} stamp={stamp} who={who} />
            </details>
            <p className="ia-goline">
              <Link className="sp-ink" to="/supplier/invoices">
                All invoices
              </Link>
            </p>
          </div>
        </div>
      </Page>
    );
  }

  // ---- a desktop: the wide master–detail ----
  return (
    <Page wide>
      <div className="sp" data-wide="true">
        <ObjectDefs />
        <div className="sp-desk ia-deal-desk">
          <section className="sp-cap" aria-labelledby="sp-h1">
            {tag}
            {title}
            <p className="sp-lede">{`${line.lead} ${line.text}${move ? "." : ""}`}</p>
            {factsList}
            <section className="ia-switch" aria-labelledby="ia-sw-h">
              <div className="ia-switch-h">
                <h2 id="ia-sw-h">
                  <b lang="ja">台帳</b>Your deals
                </h2>
                <Link to="/supplier/invoices">All invoices</Link>
              </div>
              <LongList
                items={deals}
                keyOf={(x) => x.n}
                stage={(x) => dealStage(x, isSettled(x))}
                words={ledgerWords(book)}
                labels={LEDGER_LABELS}
                limit={5}
                searchLabel="Search your deals"
                render={(x) => <LedgerLine d={x} book={book} compact current={x.n === d.n} />}
              />
            </section>
          </section>
          <section className="ia-vis ia-deal" aria-label="The deal">
            {railArea}
            <div className="ia-deal-row">
              <DealSheet d={d} settled={settled} stamp={stamp} who={who} />
              <section className="sp-work" aria-label="This station's work">
                {shown ? <DidLine did={shown} /> : null}
                {work}
              </section>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

/** The deal's 請求書 (the /try sheet in case mode), its buyer and PDF in words, and the invoice code on a carbon slip. */
function DealSheet({ d, settled, stamp, who }: { d: Deal; settled: boolean; stamp: Set<StationKey>; who: { name: string; print: string } }): ReactNode {
  const facts = invoiceFacts(d);
  const fields = useSheetFields();
  const sheet = useRef<HTMLElement>(null);
  const nCode = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const crack = useRef<SVGPathElement>(null);
  const art = useRef<SVGGElement>(null);
  const [copied, setCopied] = useState(false);
  useLayoutEffect(() => {
    if (reducedMotion()) {
      freshN.n = null;
      return;
    }
    if (freshN.n === d.n && nCode.current) resolveN(nCode.current, d.n);
    freshN.n = null;
  }, [d.n]);
  useLayoutEffect(() => {
    const sk = sheet.current;
    if (!sk || reducedMotion()) return;
    if (stamp.has("signature")) sk.classList.add("is-press");
    if (stamp.has("settled")) sk.classList.add("is-stamp");
  }, [stamp]);
  const note = d.buyer_signature ? "The buyer sealed exactly these bytes." : d.sign_request ? `Sent to the buyer on ${new Date(d.sign_request.at).toLocaleString()}; the box stays empty until the buyer signs these exact bytes.` : "The buyer's seal 買 goes in the box once the buyer signs these exact bytes.";
  const held = pdfOf(d.n);
  return (
    <div className="sp-sheet">
      <span className="sp-under" aria-hidden="true" />
      <Seikyusho
        o={{ id: d.invoice_id, amount: zatToZec(d.amount_zat), issued: facts.issued, due: daysToDate(d.due_date), terms: facts.terms, buyer: d.buyer_pk, supplier: d.supplier_pk, issuer: "You" }}
        fields={fields}
        changed={null}
        n={d.n}
        sheet={sheet}
        readOnly
        note={note}
        slots={{
          to: (
            <span className="sk-buyer is-read">
              <strong>{who.name}</strong>
              <code>{who.print}</code>
              <small>to the buyer's key for this invoice</small>
            </span>
          ),
          terms: <span className="sk-file-n">{held ? `${held.name} · fingerprint of the PDF on the invoice` : "the PDF's fingerprint is in the invoice"}</span>,
          by: <small className="sk-by">your key for this invoice, from your passkey</small>,
        }}
        kase={{
          sealed: d.buyer_signature ? true : "pending",
          nCode,
          ring,
          crack,
          art,
          inside: settled ? (
            <span className="sp-done" aria-hidden="true">
              <span lang="ja">済</span>
              <small>SETTLED</small>
            </span>
          ) : null,
        }}
      />
      <div className="sp-slip">
        <span>Invoice code</span>
        <code title={d.invoice}>{d.invoice}</code>
        <Button secondary onClick={async () => void (await navigator.clipboard.writeText(d.invoice).then(() => setCopied(true)))}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button secondary onClick={() => download(`${d.invoice_id}.invoice.txt`, d.invoice)}>
          Download
        </Button>
      </div>
    </div>
  );
}

