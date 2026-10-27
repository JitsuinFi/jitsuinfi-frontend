// The in-tray (HNK-26.T3, T5, T7, HNK-34.T5): the mailbox read through the node, as letters in a
// tray; one is opened beside it. A financing offer carries the node's checks, the 内規 verdict
// rule by rule, and Accept / Decline; a buyer history its KYC flag; a member's withdrawal the
// button that queues it for the period's end.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Act, say, Stamp, Status, type Load } from "./bits";
import { acceptedLine, dueDay, refusal, short, totals, zec } from "./model";
import { del, post } from "./node";
import type { Mail, Offer } from "./types";
import { Lede } from "../app/Lede";
import { Dock } from "../app/Dock";

// Message types (relay-message.ts) in the operator's words, and the role seals of the app.
const TYPE_LABEL: Record<string, string> = {
  "deal.offer": "Financing offer",
  "deal.entry": "Board entry",
  "deal.seal": "Seal",
  "history.chain": "Buyer history",
  "invoice.signature": "Buyer signature",
  "key.invoice_pk": "Invoice key",
  "invoice.sign_request": "Signing request",
  "fund.withdraw": "Withdrawal request",
};
const ROLE_BADGE: Record<string, string> = { supplier: "売", buyer: "買", fund: "資", member: "資", financier: "証" };

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const kib = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

function Kyc({ id }: { id: NonNullable<Mail["identity"]> }): ReactNode {
  return <span className={id.registered ? "cs-kyc-ok" : "cs-kyc-flag"}>{id.registered ? `KYC: ${id.label}` : id.missing ? "no identity key: not checked against KYC" : "identity key not in your KYC list"}</span>;
}

/** The offer in the opened letter: checked terms and the accept form, or why it is refused. */
function OfferBlock({ relayId, o, demo, reload }: { relayId: string; o: Offer; demo: boolean; reload: Load }): ReactNode {
  const advance = useRef<HTMLInputElement>(null);
  const confirmations = useRef<HTMLInputElement>(null);
  const reason = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  if (!o.ok) {
    // the node's own phrase, in plain words (decision 2, HNK-34.T5); the phrase itself stays below
    const r = refusal(o.problem ?? "");
    return (
      <>
        <p className="cs-o-problem">{r.text}</p>
        {r.raw ? <p className="cs-o-raw">{`The node said: ${r.raw}`}</p> : null}
      </>
    );
  }
  const facts = (
    <dl className="cs-o-facts">
      <div>
        <dt>Invoice</dt>
        <dd className="is-mono">{o.invoice_id ?? ""}</dd>
      </div>
      <div>
        <dt>Amount</dt>
        <dd>{`${zec(o.amount_zat ?? 0)} ZEC`}</dd>
      </div>
      <div>
        <dt>Due</dt>
        <dd>{dueDay(o.due_date ?? 0)}</dd>
      </div>
      <div>
        <dt>Advance asked</dt>
        <dd>{`${zec(o.advance_zat ?? 0)} ZEC`}</dd>
      </div>
    </dl>
  );
  if (o.accepted) {
    return (
      <>
        {facts}
        <p className="cs-o-done">{acceptedLine(o.accepted, o.opening)}</p>
        <span className="cs-o-stamp" lang="ja" aria-hidden="true">
          受
        </span>
      </>
    );
  }
  const days = o.expires_at ? Math.max(0, Math.ceil((o.expires_at * 1000 - Date.now()) / 86_400_000)) : null;
  const checked = (
    <p className="cs-note">
      The supplier's key signed this offer and the buyer signed this exact invoice.
      {days !== null ? ` Unanswered, it expires in ${days} day${days === 1 ? "" : "s"}.` : ""}
    </p>
  );
  // the private mandate's verdict, rule by rule: 適 fits, 外 breaks, 待 waiting for the buyer
  const m = o.mandate;
  const rules =
    m && m.verdict !== "none" ? (
      <>
        <p className="cs-rules-h">
          <i lang="ja">内規</i>
          {m.verdict === "fits" ? "Fits your private mandate" : m.verdict === "breaks" ? "Breaks your private mandate" : "Waiting for the buyer"}
        </p>
        <ul className={`cs-rules is-${m.verdict}`}>
          {m.rules.map((r, i) => (
            <li key={i} data-ok={String(r.ok)}>
              <b lang="ja" aria-hidden="true">
                {r.ok === true ? "適" : r.ok === false ? "外" : "待"}
              </b>
              <span>{`${r.rule}: ${r.detail}`}</span>
            </li>
          ))}
        </ul>
      </>
    ) : null;
  if (demo) {
    return (
      <>
        {facts}
        {checked}
        {rules}
      </>
    );
  }
  const accept = async (e: FormEvent) => {
    e.preventDefault();
    setAccepting(true);
    try {
      const c = Number(confirmations.current!.value);
      if (!Number.isInteger(c) || c < 1) throw new Error("confirmations must be a whole number, at least 1");
      const n = Number(advance.current!.value);
      if (!Number.isFinite(n) || n <= 0) throw new Error("the advance must be a positive number of ZEC");
      await post(`/node/console/offers/${encodeURIComponent(relayId)}/accept`, { advance_zat: Math.round(n * 1e8), min_confirmations: c });
      await reload();
    } catch (err) {
      setNote(say(err));
      setAccepting(false);
    }
  };
  return (
    <>
      {facts}
      {checked}
      {rules}
      <form className="cs-accept" id={`cs-accept-${relayId}`} onSubmit={(e) => void accept(e)}>
        <div className="cs-accept-f">
          <label className="cs-field">
            <span>Advance you pay (ZEC)</span>
            <input className="is-mono" inputMode="decimal" defaultValue={zec(o.advance_zat ?? 0)} ref={advance} />
            <small>Up to what the supplier asked.</small>
          </label>
          <label className="cs-field">
            <span>Confirmations</span>
            <input className="is-mono" inputMode="numeric" defaultValue="1" ref={confirmations} />
            <small>Blocks the board entry waits before you pay.</small>
          </label>
        </div>
        <div className="cs-actions">
          {/* a phone: the offer's one action rides the bottom bar; `form` keeps it this form's submit (mobile E2E 2026-10-27, finding 5) */}
          <Dock label="Answer the offer">
            <button className={`cs-btn${accepting ? " is-busy" : ""}`} type="submit" form={`cs-accept-${relayId}`} disabled={accepting} aria-busy={accepting || undefined}>
              {accepting ? "Accepting…" : "Accept offer"}
            </button>
          </Dock>
        </div>
        <div className="cs-decline">
          <label className="cs-field">
            <span>Or decline, telling the supplier</span>
            <input defaultValue={m?.decline_reason ?? "The financier declined this offer."} maxLength={200} aria-label="Reason sent to the supplier" ref={reason} />
            <small>Names only the kind of rule, never your numbers.</small>
          </label>
          <button
            className="cs-btn-q"
            type="button"
            disabled={declining}
            onClick={async () => {
              setDeclining(true);
              try {
                await post(`/node/console/offers/${encodeURIComponent(relayId)}/decline`, { reason: reason.current!.value });
                await reload();
              } catch (err) {
                setNote(say(err));
                setDeclining(false);
              }
            }}
          >
            Decline
          </button>
        </div>
      </form>
      <Status text={note} />
    </>
  );
}

export function Opened({ m, demo, load }: { m: Mail; demo: boolean; load: Load }): ReactNode {
  const [note, setNote] = useState("");
  const signed = m.signer !== undefined && m.signer !== null;
  const fail = (e: unknown) => setNote(say(e));
  return (
    <article className="cs-opened is-in" aria-labelledby="cs-opened-t">
      <div className="cs-o-head">
        <span className="cs-badge" lang="ja" aria-hidden="true">
          {ROLE_BADGE[m.from?.role ?? ""] ?? "外"}
        </span>
        <h3 id="cs-opened-t">{TYPE_LABEL[m.type] ?? m.type}</h3>
        {signed ? (
          <span className={m.signature_ok ? "cs-verdict" : "cs-verdict is-bad"} lang="ja" title={m.signature_ok ? "Signature holds" : "Signature does not hold"}>
            {m.signature_ok ? "認" : "拒"}
          </span>
        ) : (
          <span />
        )}
        <p>
          {`from ${m.from?.role ?? "?"} · ${ago(m.received_at)}`}
          {m.n ? (
            <>
              {" · fingerprint "}
              <span className="is-mono">{short(m.n)}</span>
            </>
          ) : null}
          {m.identity ? (
            <>
              {" · "}
              <Kyc id={m.identity} />
            </>
          ) : null}
        </p>
      </div>
      {m.offer ? <OfferBlock key={m.relay_id} relayId={m.relay_id} o={m.offer} demo={demo} reload={load} /> : null}
      {m.type === "history.chain" && m.n ? (
        <p className="cs-note">
          {"The buyer's history certificates for N "}
          <span className="is-mono">{short(m.n)}</span>. The node checks them against the board before the supplier signs.
        </p>
      ) : null}
      {m.type === "fund.withdraw" ? <p className="cs-note">A member asks to withdraw units. It waits in the fund ledger for the end of the period.</p> : null}
      <div className="cs-actions">
        {/* HNK-30.T23: a member's withdrawal waits in the fund ledger for the end of the period */}
        {m.type === "fund.withdraw" && !demo ? (
          <Act
            label="Queue for the period's end"
            run={async () => {
              const r = await post<{ units: number; period: number }>(`/node/console/fund/withdrawals/${encodeURIComponent(m.relay_id)}`);
              setNote(`Queued: ${r.units} units, paid when period ${r.period} closes.`);
              document.dispatchEvent(new Event("fund-changed"));
            }}
            fail={fail}
          />
        ) : null}
        {(m.attachments ?? []).map((a, i) => (
          <a key={i} className="cs-att" href={`/node/mail/${encodeURIComponent(m.relay_id)}/attachments/${i}`} download="">
            {a.name} <span className="is-mono">{`(${kib(a.size)})`}</span>
          </a>
        ))}
        {!demo ? (
          <Act
            className="cs-link"
            label="Remove"
            run={async () => {
              await del(`/node/mail/${encodeURIComponent(m.relay_id)}`);
              await load();
            }}
            fail={fail}
          />
        ) : null}
      </div>
      <Status text={note} />
    </article>
  );
}

/** `onOpen`: a phone (compact) opens a letter as its own screen instead of beside the list. */
export function TraySection({ mail, refused, note, demo, load, onOpen }: { mail: Mail[] | null; refused: number; note: string; demo: boolean; load: Load; onOpen?: (relayId: string) => void }): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  // keep the opened letter across reloads; open the first one otherwise
  useEffect(() => {
    if (mail && !mail.some((m) => m.relay_id === open)) setOpen(mail[0]?.relay_id ?? null);
  }, [mail, open]);
  const t = totals(null, mail);
  const opened = mail?.find((m) => m.relay_id === open) ?? null;
  return (
    <section className="cs-sec" id="tray" aria-labelledby="cs-tray-t">
      <div className="cs-cap">
        <p className="cs-eyebrow">
          <Stamp k="便" />
          Mailbox, read through the node
        </p>
        <h2 id="cs-tray-t">In-tray</h2>
        <Lede className="cs-lede">Every letter arrives sealed to your mailbox. The node opens it, checks each signature and matches an offer against your 内規 before you read it.</Lede>
        <dl className="cs-totals">
          <div className="is-act">
            <dt>financing offers to answer</dt>
            <dd>{t.offers ?? "…"}</dd>
          </div>
          {refused ? (
            <div>
              <dt>could not be opened or were addressed elsewhere</dt>
              <dd>{refused}</dd>
            </div>
          ) : null}
        </dl>
        <p className="cs-hint">An unanswered offer is declined by the node when it expires. A decline names only the kind of rule, never your numbers.</p>
        <div className="cs-actions">
          <button className="cs-btn-q" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <Status text={note} />
      </div>
      <div className="cs-tray-wrap">
        <div className="cs-tray">
          <ul className="cs-tray-list" aria-label="Letters">
            {(mail ?? []).map((m) => (
              <li key={m.relay_id} className="cs-letter-row">
                <button className="cs-lt" type="button" aria-pressed={onOpen ? undefined : m.relay_id === open} onClick={() => (onOpen ? onOpen(m.relay_id) : setOpen(m.relay_id))}>
                  <span className="cs-badge" lang="ja" aria-hidden="true">
                    {ROLE_BADGE[m.from?.role ?? ""] ?? "外"}
                  </span>
                  <span className="cs-lt-what">{TYPE_LABEL[m.type] ?? m.type}</span>
                  {m.signer !== undefined && m.signer !== null ? (
                    <span className={m.signature_ok ? "cs-verdict" : "cs-verdict is-bad"} lang="ja" title={m.signature_ok ? "Signature holds" : "Signature does not hold"}>
                      {m.signature_ok ? "認" : "拒"}
                    </span>
                  ) : (
                    <span className="cs-verdict is-none" aria-hidden="true" />
                  )}
                  <span className="cs-lt-line">
                    {`from ${m.from?.role ?? "?"} · ${ago(m.received_at)}`}
                    {m.offer?.ok && m.offer.invoice_id ? (
                      <>
                        {" · "}
                        <span className="is-mono">{m.offer.invoice_id}</span>
                      </>
                    ) : m.n ? (
                      <>
                        {" · fingerprint "}
                        <span className="is-mono">{short(m.n)}</span>
                      </>
                    ) : null}
                    {m.identity ? (
                      <>
                        {" · "}
                        <Kyc id={m.identity} />
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {mail && !mail.length ? <p className="cs-tray-empty">No messages.</p> : null}
        </div>
        {onOpen ? null : opened ? <Opened key={opened.relay_id} m={opened} demo={demo} load={load} /> : <p className="cs-note cs-opened-empty">{mail ? "No letter to open." : ""}</p>}
      </div>
    </section>
  );
}
