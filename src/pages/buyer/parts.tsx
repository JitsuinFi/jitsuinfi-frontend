// The buyer's shared parts (HNK-34.T5, approved sample design-samples/internal/buyer.html; IA port
// part 2, 2026-10-26): the caption column (the 買 tag with the section, the title, the lede), the
// big numbers and the past-due line (said on Invoices and Pay only), one ledger line linking to its
// invoice or slip, the checks that tick, the verdict hanko and the seal circles. Styles:
// pages/role-paper.css and pages/buyer.css.
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { buyerTotals, invoiceStatus, nextAction, sealCount, type BuyerAction, type BuyerInvoice } from "../../lib/buyer-invoices";
import { ledgerLine, lateState, reminders, reminderText } from "../../lib/buyer-late";
import { daysToDate, today, zatToZec } from "../../lib/core";

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const dueWords = (days: number) => (days < 0 ? `${plural(-days, "day")} past due` : days === 0 ? "due today" : `in ${plural(days, "day")}`);

export const LEDE = "Confirm the invoice and acknowledge who you will pay, all from keys only you hold.";

/**
 * CSS custom properties written through the CSSOM (CSP-safe, no style attributes): every element
 * under `root` with `data-v="--name:value;--other:value"` gets them after each render.
 */
export function useVars(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>("[data-v]").forEach((el) => {
      for (const pair of el.dataset.v!.split(";")) {
        const at = pair.indexOf(":");
        if (at > 0) el.style.setProperty(pair.slice(0, at), pair.slice(at + 1));
      }
    });
  });
}

/** A file field as a pill: the chosen file's name, and Choose. */
export function FilePill({ label, empty, inputRef, onChange }: { label: string; empty: string; inputRef: RefObject<HTMLInputElement | null>; onChange?: () => void }): ReactNode {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className="rp-file">
      <input
        type="file"
        aria-label={label}
        ref={inputRef}
        onChange={(e) => {
          setName(e.currentTarget.files?.[0]?.name ?? null);
          onChange?.();
        }}
      />
      <span>{name ?? empty}</span>
      <b aria-hidden="true">Choose</b>
    </label>
  );
}

/** One check that ticks: held, failed, or not run yet. */
export function Check({ ok, label, text, i }: { ok: boolean | null; label: string; text: string; i: number }): ReactNode {
  return (
    <li className={ok === true ? "is-ok" : ok === false ? "is-bad" : undefined} data-v={`--d:${i === 0 ? 0 : 100 + (i - 1) * 67}ms`}>
      <i aria-hidden="true">
        <svg viewBox="0 0 16 16">{ok === false ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : <path d="M3.5 8.4l2.9 2.8L12.5 5" />}</svg>
      </i>
      <b>{label}</b>
      <span>{text}</span>
    </li>
  );
}

export function Verdict({ kind, glyph, title, text, land = true }: { kind: "ok" | "warn" | "bad"; glyph: string; title: string; text: ReactNode; land?: boolean }): ReactNode {
  return (
    <p className={`rp-verdict is-${kind}${land ? " is-land" : ""}`} role={kind === "bad" ? "alert" : "status"}>
      <span className="rp-hanko" lang="ja" aria-hidden="true">
        {glyph}
      </span>
      <b>{title}</b>
      <span>{text}</span>
    </p>
  );
}

/** A seal circle on a document: dashed until pressed. */
export function Seal({ g, lbl, on, press, label, wait }: { g: string; lbl: string; on: boolean; press?: boolean; label: string; wait?: boolean }): ReactNode {
  return (
    <div className={wait && !on ? "is-wait" : undefined}>
      <span className="by-seal-lbl" lang="ja">
        {lbl}
      </span>
      <span className={`by-seal${on ? " is-on" : ""}${on && press ? " is-press" : ""}`} data-g={g} role="img" aria-label={label} lang="ja" />
      <small>{label}</small>
    </div>
  );
}

/** The tag above every buyer section's title: 買 Buyer's counter · section. */
export function Tag({ k = "買", section }: { k?: string; section?: string }): ReactNode {
  return (
    <p className="rp-eyebrow">
      <span className="rp-stamp" lang="ja" aria-hidden="true">
        {k}
      </span>
      Buyer's counter
      {section ? (
        <>
          <i className="ia-dot" aria-hidden="true">
            ·
          </i>
          <span className="ia-sec">{section}</span>
        </>
      ) : null}
    </p>
  );
}

/** The three big numbers, no boxes. */
export function Totals({ list, statuses, loading }: { list: BuyerInvoice[]; statuses: Record<string, string | null> | null; loading?: boolean }): ReactNode {
  const t = buyerTotals(list, statuses, today());
  return (
    <dl className="by-totals" aria-label="Your invoices in numbers">
      <div>
        <dt>to sign or seal</dt>
        <dd>{loading ? "–" : t.toAct}</dd>
      </div>
      <div>
        <dt>{`to pay, ${plural(t.toPay.count, "invoice")}`}</dt>
        <dd>
          {zatToZec(t.toPay.zat)}
          <small>ZEC</small>
        </dd>
      </div>
      <div>
        <dt>{`paid on time, of ${t.due} due`}</dt>
        <dd>
          {t.onTime === null ? "–" : t.onTime}
          <small>{`/ ${t.due}`}</small>
        </dd>
      </div>
    </dl>
  );
}

/** The past-due line (only on Invoices and Pay): every invoice due within a week or past due, and where to pay it. */
export function DueLine({ list, slipHref }: { list: BuyerInvoice[]; slipHref?: (r: BuyerInvoice) => string | undefined }): ReactNode {
  const due = reminders(list, today());
  if (!due.length) return null;
  const first = list.find((r) => r.n === due[0].n);
  const href = first && slipHref ? slipHref(first) : undefined;
  return (
    <p className="by-due" role="status">
      <span className="rp-hanko" lang="ja" aria-hidden="true">
        期
      </span>
      <span>
        <b>{due.some((d) => d.state.kind === "overdue") ? "Past due." : due.length === 1 ? "Due soon." : `${due.length} invoices due soon.`}</b> {due.map((d) => reminderText(d, `${zatToZec(d.amount_zat)} ZEC`)).join(" ")}{" "}
        {href ? <Link to={href}>Pay on the slip</Link> : "Pay each on its slip."}
      </span>
    </p>
  );
}

export const TAG: Record<BuyerAction, [string, "act" | "done" | ""]> = {
  sign: ["Sign", "act"],
  send: ["Send the signature", "act"],
  "wait-letter": ["Waiting for a financier's letter", ""],
  seal: ["Seal the letter", "act"],
  "wait-financier": ["Waiting for the financier's seal", ""],
  pay: ["Pay", "act"],
  settled: ["Settled", "done"],
};

export const LEDGER_LABELS = { move: "Needs your move", wait: "Waiting on others", done: "Settled" } as const;

/** The ledger's words for a search: number, amount, due date. */
export const ledgerWords = (r: BuyerInvoice) => `${r.invoice_id} ${zatToZec(r.amount_zat)} ZEC due ${daysToDate(r.due_date)}`;

/**
 * The list a detail screen was opened from, so its Back control is the browser's Back (DS-MOB N4:
 * one history entry per screen, Back returns to the list as it was).
 */
const trail = { from: "" };
const noteFrom = () => void (trail.from = location.pathname);

/** One ledger line, a link to the invoice (or its slip). */
export function LedgerLine({ r, href, status, current }: { r: BuyerInvoice; href: string; status: string | null | undefined; current?: boolean }): ReactNode {
  const a = nextAction(r);
  const s = sealCount(r);
  const [word, cls] = TAG[a];
  const ll = ledgerLine(lateState(r, today(), status ?? null));
  return (
    <Link className="by-ln" to={href} aria-current={current ? "page" : undefined} onClick={noteFrom}>
      <span className="by-l-id">{r.invoice_id}</span>
      <span className="by-l-amt">{`${zatToZec(r.amount_zat)} ZEC`}</span>
      <span className="by-l-sub">{`due ${daysToDate(r.due_date)} · key #${r.key_index}`}</span>
      <span className="by-l-seals" role="img" aria-label={`${s} of 3 seals`}>
        {["売", "買", "融"].map((g, i) => (
          <i key={g} className={i < s ? "is-on" : undefined} lang="ja">
            {g}
          </i>
        ))}
      </span>
      <span className="by-l-tag">
        <span className={cls ? `is-${cls}` : undefined}>{a === "pay" ? `${word} · ${dueWords(r.due_date - today())}` : word}</span>
        <span>{[invoiceStatus(r), status].filter(Boolean).join(" · ")}</span>
      </span>
      {ll ? (
        <span className={`by-l-late is-${ll.tone}`}>
          <i lang="ja" aria-hidden="true">
            {ll.glyph}
          </i>
          {ll.text}
        </span>
      ) : null}
    </Link>
  );
}

/** Marks a link to a detail screen (outside a ledger) as opened from this page. */
export const openedHere = noteFrom;

/** The phone's back control of a screen one step down (DS-MOB N3, N4): the place it returns to. */
export function Back({ to, title, sub }: { to: string; title: string; sub: string }): ReactNode {
  return (
    <Link
      className="ia-back"
      to={to}
      replace
      onClick={(e) => {
        if (trail.from !== to) return;
        e.preventDefault();
        trail.from = "";
        history.back();
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3L5 8l5 5" />
      </svg>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </Link>
  );
}
