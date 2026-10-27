// Pay (HNK-06.T5 QR, HNK-32.T2, BL-D25-01, BL-S02-02, buyer-late; IA port part 2, 2026-10-26,
// approved prototype ia-buyer-pay): the 払込票 payment slip is the page's object. A slip exists once
// all three seals hold on the letter this device kept, and only that letter is paid (a pasted
// letter could name anyone's address); its QR opens only when payProblems() is empty. Under it,
// "If you pay late" from a week before the due date; once settled, the 済 and the bundle to copy
// or check on Verify. The caption lists the slips: to pay soonest first, then the paid ones; the
// invoices whose slip waits for the financier's seal link to their letter under Invoices.
// /buyer/pay/<ref> opens one slip (on a phone its own screen, back to the list).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { lettersFor } from "../../app/inbox";
import { useInbox } from "../../app/InboxPanel";
import { LongList } from "../../app/LongList";
import { DidLine, useDid } from "../../app/outcome";
import { Button, useOut } from "../../app/ui";
import { QrPlate } from "../../app/QrPlate";
import { hasSlip, slipOrder } from "../../lib/buyer-invoices";
import { DEFAULT_GRACE_DAYS, lateState, msToCutoff, slipSeen } from "../../lib/buyer-late";
import { payProblems } from "../../lib/buyer-letter";
import { daysToDate, json, today, wasm, zatToZec } from "../../lib/core";
import { byRef, invoicePath, slipPath } from "../../lib/deal-ref";
import { handToVerify } from "../../lib/verify-handoff";
import { LatePanel } from "../BuyerLate";
import { statusesOf, awaitsBoard, saveInvoice, useBoard, useInvoices, withInvoiceIndex, type Inv } from "./data";
import { Check, DueLine, dueWords, LedgerLine, ledgerWords, Tag, Totals, useVars } from "./parts";
import "../role-paper.css";
import "../buyer.css";

const short = (x: string, a = 22, b = 8) => (x.length > a + b + 1 ? `${x.slice(0, a)}…${x.slice(-b)}` : x);
const LEDE = "Pay each invoice at maturity, to the financier its sealed letter names. A slip opens only once all three seals hold.";

/** Why the QR stays hidden for `r` (empty when the kept letter carries all three seals and holds). */
function payCheck(r: Inv): string[] {
  const a = r.assignment;
  const seals = [a?.supplier_seal, a?.buyer_seal, a?.financier_seal].filter((x): x is string => !!x);
  let status: string | null = null;
  try {
    status = a?.letter && seals.length === 3 ? wasm.assignmentStatus(r.invoice, a.letter, JSON.stringify(seals)) : null;
  } catch {
    status = null;
  }
  return payProblems({ kept: a?.letter, letter: a?.letter ?? "", seals: seals.length, status });
}

/** The 払込票 slip of one invoice, with its QR, "If you pay late" and, once paid, the bundle. */
function Slip({ r, status }: { r: Inv; status: string | null }): ReactNode {
  const out = useOut();
  const [qr, setQr] = useState<{ svg: string; uri: string; payTo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // the slip's countdown to the on-time cut-off, a minute at a time
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // judge run 3, finding 1: an open slip is the financier's reminder seen, for the milestones
  // reached today and the reminders in the inbox now; their letters stop counting on the bell
  const inbox = useInbox();
  const asked = lettersFor(inbox, r.n, "deal.reminder").map((l) => String(l.r.message.header.body.milestone ?? "")).join(" ");
  useEffect(() => {
    if (r.bundle || !hasSlip(r)) return;
    const said = asked ? asked.split(" ") : [];
    if (!slipSeen(r.reminders_seen, r.due_date, today(), said)) return;
    void saveInvoice((prev) => {
      const p = prev ?? r;
      return { ...p, reminders_seen: slipSeen(p.reminders_seen, p.due_date, today(), said) ?? p.reminders_seen };
    }, r.n).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.n, asked]);
  const paid = !!r.bundle;
  const why = payCheck(r);
  const ready = !why.length && !paid;
  const letter = (() => {
    try {
      return r.assignment?.letter ? json<{ financier_address: string }>(wasm.assignmentDecode(r.assignment.letter, r.invoice)) : null;
    } catch {
      return null;
    }
  })();
  const late = lateState(r, today(), status);
  const pay = async () => {
    setBusy(true);
    try {
      const problems = payCheck(r);
      if (problems.length) throw new Error(problems[0]);
      const a = r.assignment!.letter!;
      const res = json<{ uri: string; qr_svg: string }>(await withInvoiceIndex(r.invoice, (m, k) => wasm.buyerRepaymentBytes(m, k, r.invoice, a, today())));
      setQr({ svg: res.qr_svg, uri: res.uri, payTo: letter?.financier_address ?? "" });
      out.clear();
    } catch (e) {
      out.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`by-slip is-main${paid ? " is-paid" : ""}`} aria-label={`Payment slip for ${r.invoice_id}`}>
      {paid ? (
        <span className="by-paid" lang="ja" role="img" aria-label="Settled">
          済
        </span>
      ) : null}
      <div className="by-slip-h">
        <b lang="ja">払込票</b>
        <span>{paid ? "Paid" : "Pay at maturity"}</span>
      </div>
      <p className="by-slip-k">
        For <b>{r.invoice_id}</b>
        <span lang="ja">{" · letter sealed 売 買 融"}</span>
      </p>
      <div className="by-slip-body">
        <dl className="by-slip-facts">
          <div>
            <dt>Amount</dt>
            <dd className="is-big">{`${zatToZec(r.amount_zat)} ZEC`}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{`${daysToDate(r.due_date)}${paid ? "" : ` · ${dueWords(r.due_date - today())}`}`}</dd>
          </div>
          <div>
            <dt>Pays the financier at</dt>
            <dd>
              <span className="mono">{letter && r.assignment?.financier_seal ? short(qr?.payTo || letter.financier_address) : "named by the sealed letter only"}</span>
            </dd>
          </div>
        </dl>
      </div>
      <QrPlate
        svg={qr?.svg ?? null}
        text={qr?.uri ?? ""}
        caption={`Pay ${zatToZec(r.amount_zat)} ZEC to the financier`}
        print={qr?.payTo ? { label: "To", value: short(qr.payTo, 12, 8) } : undefined}
        file={`${r.invoice_id}-payment`}
        copyLabel="Copy payment link"
        wallet
        shareTitle={`Payment for ${r.invoice_id}`}
        veil={{ glyph: paid ? "済" : ready ? "印" : "待", text: paid ? "Settled. Nothing more to pay." : ready ? "Press Show payment QR to draw it." : "It opens once all three seals hold." }}
        raw={{ label: "Payment request (ZIP-321)", filename: `${r.invoice_id}.payment.txt` }}
      />
      <LatePanel
        state={late}
        cutoffMs={msToCutoff(r.due_date, nowMs)}
        facts={{ inHistory: !!r.history_cert, amount: `${zatToZec(r.amount_zat)} ZEC`, due: daysToDate(r.due_date), defaultFrom: daysToDate(r.due_date + DEFAULT_GRACE_DAYS + 1) }}
      />
      {paid ? (
        <div className={`by-why${late.kind === "paid" ? "" : " is-plain"}`}>
          {late.kind === "paid" ? (
            <span className="rp-hanko is-ok" lang="ja" aria-hidden="true">
              済
            </span>
          ) : null}
          <span>
            {`${r.invoice_id} is settled. The bundle is kept on this device and proves the whole deal to anyone. `}
            <Button secondary onClick={async () => void (await navigator.clipboard.writeText(r.bundle!).then(() => setCopied(true)))}>
              {copied ? "Copied" : "Copy the bundle"}
            </Button>{" "}
            {/* the bundle goes along to Verify's in-tray, in memory (never in the address) */}
            <a className="by-a" href="/verify" onClick={() => handToVerify(r.bundle!)}>
              Check it on Verify
            </a>
          </span>
        </div>
      ) : why.length ? (
        <p className="by-why">
          <span className="rp-hanko" lang="ja" aria-hidden="true">
            待
          </span>
          <span>{`${why[0].charAt(0).toUpperCase()}${why[0].slice(1)}.`}</span>
        </p>
      ) : null}
      {paid ? null : (
        <div className="actions">
          <button type="button" disabled={!ready || busy || !!qr} onClick={() => void pay()}>
            {busy ? "Making the QR…" : "Show payment QR"}
          </button>
          <span className="hint">{ready ? "Scan with a Zcash wallet. The payment is shielded; its memo carries your signed receipt and your claim, which the financier countersigns once the payment is on chain." : "The QR opens once the financier's seal is in your inbox: it seals the letter when it pays the advance."}</span>
        </div>
      )}
      {out.el}
    </section>
  );
}

/** Where the slip pays: the three seals on the kept letter, and the letter itself under Invoices. */
function WherePays({ r }: { r: Inv }): ReactNode {
  const a = r.assignment;
  return (
    <div className="by-side">
      <h3>Where this pays</h3>
      <p>The sealed letter this device kept names the financier and its address; only that letter is paid. A pasted letter could name anyone's address.</p>
      <ul className="by-checks" aria-label="Seals on the kept letter">
        <Check ok={!!a?.supplier_seal || null} label="Supplier's seal" text="売 · the first seal" i={0} />
        <Check ok={!!a?.buyer_seal || null} label="Your seal" text="買 · the second seal" i={1} />
        <Check ok={!!a?.financier_seal || null} label="Financier's seal" text={a?.financier_seal ? "融 · the third seal, completes the letter" : "waiting in your inbox"} i={2} />
      </ul>
      <p className="ia-goline by-goline">
        <span className="rp-hanko" lang="ja" aria-hidden="true">
          証
        </span>
        <span>
          {"Read the letter on the desk: "}
          <Link className="by-a" to={invoicePath(r.ref)}>
            {`${r.invoice_id} under Invoices`}
          </Link>
        </span>
      </p>
    </div>
  );
}

export function PayPage({ slipRef }: { slipRef?: string }): ReactNode {
  const recs = useInvoices();
  const board = useBoard(awaitsBoard(Array.isArray(recs) ? recs : []));
  const phone = usePhone();
  const root = useRef<HTMLDivElement>(null);
  useVars(root);
  const list = Array.isArray(recs) ? recs : [];
  const statuses = statusesOf(list, board);
  const slips = slipOrder(list) as Inv[];
  const waiting = list.filter((r) => r.assignment?.letter && !hasSlip(r));
  const picked = slipRef ? byRef(slips, slipRef) : undefined;
  const sel = picked ?? (phone || slipRef ? undefined : slips[0]);
  const shown = useDid(sel ? slipPath(sel.ref) : "/buyer/pay");
  const unknown = !!slipRef && recs !== null && !picked;
  if (recs === null) return null;

  const slipList = (
    <>
      <div className="rp-list-h">
        <h2>Your slips</h2>
        <span>to pay first, then paid</span>
      </div>
      {slips.length ? (
        <LongList
          items={slips}
          keyOf={(r) => r.n}
          stage={(r) => (r.bundle ? "done" : "move")}
          words={ledgerWords}
          labels={{ move: "To pay", wait: "Waiting", done: "Paid" }}
          searchLabel="Search by invoice number"
          className="by-ledger"
          render={(r) => <LedgerLine r={r} href={slipPath(r.ref)} status={statuses?.[r.n]} current={r.n === sel?.n} />}
        />
      ) : (
        // an empty state with the next step (audit 2026-10-27, finding 16)
        <div className="ia-none">
          <b lang="ja" aria-hidden="true">
            払
          </b>
          <strong>No payment slips yet</strong>
          <p>A slip opens here once the financier pays the supplier and seals the letter you sealed.</p>
          <Link className="ia-none-go" to="/buyer/invoices">
            Your invoices
          </Link>
        </div>
      )}
      {waiting.length ? (
        <p className="hint by-wait">
          {"No slip yet for "}
          {waiting.map((r, i) => (
            <span key={r.n}>
              {i ? ", " : ""}
              <Link className="ia-inlink" to={invoicePath(r.ref)}>{r.invoice_id}</Link>
            </span>
          ))}
          {": the financier seals the letter when it pays the advance, and the slip opens then."}
        </p>
      ) : null}
    </>
  );

  // a phone: one slip as its own screen, back to the list. DS-MOB L5: one tree at every width; on
  // that screen the caption and visual boxes step aside (`.by-flat`, display: contents), so the slip
  // keeps its place in the tree and its QR survives a resize.
  const one = phone && !!sel;
  return (
    <Page wide>
      <div className="rp by" ref={root}>
        <section className={one ? "by-doc-phone" : "rp-sec"} aria-labelledby={one ? undefined : "by-tp"} aria-label={one && sel ? `Slip for ${sel.invoice_id}` : undefined}>
          <div className={one ? "by-flat" : "rp-cap"}>
            <Tag k="払" section="Pay" />
            {one && sel ? (
              <h1 className="ia-doc-id">
                {sel.invoice_id}
                <span>{`${zatToZec(sel.amount_zat)} ZEC · due ${daysToDate(sel.due_date)}`}</span>
              </h1>
            ) : (
              <h1 id="by-tp">Pay</h1>
            )}
            {one ? null : (
              <>
                <p className="rp-lede">{LEDE}</p>
                <Totals list={list} statuses={statuses} />
                <DueLine list={list} slipHref={(r) => (r.ref && hasSlip(r) ? slipPath(r.ref) : undefined)} />
                {phone ? null : slipList}
              </>
            )}
          </div>
          <div className={one ? "by-flat" : "rp-vis"}>
            {shown ? <DidLine did={shown} /> : null}
            {phone && !sel ? slipList : null}
            {!sel ? (
              phone ? null : unknown ? (
                <p className="rp-empty">This slip is not on this device. Pick one from your slips.</p>
              ) : (
                <p className="rp-empty">Nothing to pay yet. The 払込票 slip of an invoice appears here once all three seals hold on its letter.</p>
              )
            ) : null}
            {sel ? (
              <div className={one ? "by-flat" : "by-pay-row"}>
                <Slip key={sel.n} r={sel} status={statuses?.[sel.n] ?? null} />
                <WherePays r={sel} />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Page>
  );
}
