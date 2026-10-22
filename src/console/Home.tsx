// Console home (HNK-26.T3, T4, T20, D-45): sign in with the paired passkey; signed in, the
// financier mailbox read through the node, adding devices, and the node's public facts.
// Financing offers in the mailbox are checked by the node and accepted here (HNK-26.T5); buyer
// histories are flagged against the financier's KYC registry of buyers (HNK-26.T7).
// React since HNK-31.T11.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AuthLink, Chevron, Head, LockIcon, PasskeyIcon, Row, Sheet, useMessage } from "../app/auth";
import { download } from "../lib/download";
import { explain, stopReason } from "../lib/explain";
import { encodeFundCard } from "../lib/fund-card";
import { keepName, keptName } from "./name";
import { approvePayment, approvePlan, assert, contactFingerprint, creationOptions, del, get, post, registrationJson } from "./node";

interface Session {
  signed_in: boolean;
  paired: boolean;
  console: boolean;
  name?: string | null;
  /** The judges' demo console (HNK-26.T26): no invite, nothing that moves money. */
  demo?: boolean;
}

interface Info {
  network: string;
  financier_pk: string;
  mailbox_id: string;
  wallet_address: string;
  contact: string;
}

interface Mail {
  relay_id: string;
  received_at: string;
  type: string;
  from?: { role?: string };
  n?: string;
  signer?: string | null;
  signature_ok: boolean;
  attachments?: Array<{ name: string; size: number }>;
  /** A `deal.offer` as the node checked it (HNK-26.T5). */
  offer?: Offer;
  /** A `history.chain`: whether its identity key is in the KYC registry (HNK-26.T7). */
  identity?: { registered: boolean; label?: string; missing?: boolean };
}

interface Offer {
  ok: boolean;
  problem?: string;
  n?: string;
  invoice_id?: string;
  amount_zat?: number;
  due_date?: number;
  advance_zat?: number;
  supplier_address?: string;
  accepted?: { advance_zat: number; min_confirmations: number; accepted_at: number } | null;
  /** HNK-26.T6: when the node declines it unanswered (seconds since the epoch). */
  expires_at?: number;
  /** HNK-30.T11: the offer against the private mandate, checked on the node. */
  mandate?: { verdict: "fits" | "breaks" | "waiting" | "none"; rules: Array<{ rule: string; ok: boolean | null; detail: string }>; decline_reason: string };
}

// ZEC amounts without the wasm bundle (core.ts): the console stays small.
const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/\.?0+$/, "");
const zat = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("the advance must be a positive number of ZEC");
  return Math.round(n * 1e8);
};
const dueDay = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10);

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

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s);

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const kib = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

interface Buyer {
  identity_pk: string;
  label: string;
  added_at: number;
}

interface Device {
  id: string;
  paired_at: number;
  last_used: number | null;
  usable: boolean;
  current: boolean;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

interface MandateData {
  min_zat: number;
  max_zat: number;
  max_tenor_days: number;
  buyer_kyc: boolean;
}

interface DealRow {
  n: string;
  invoice_id: string;
  amount_zat: number;
  advance_zat: number;
  due_date: number;
  state: string;
  entry_txid?: string;
  advance_txid?: string;
  stopped?: string;
  stopped_winner?: string;
  // HNK-32.T4 (BL-D23-14): the entry's confirmations at the last board check, and the minimum
  confirmations?: number | null;
  min_confirmations?: number;
  letter_sent: boolean;
  repayment?: string | null;
  paid_zat?: number | null;
  settled_txid?: string | null;
  evidence?: string | null;
  bundle?: string | null;
  bundle_sent?: boolean;
  history_requested?: boolean;
  history?: string | null;
  proof?: string | null;
  exhibit?: string | null;
  problem: string | null;
  intent?: { n: string; amount_zat: number; address: string };
}

// The deal's route on B's desk (HNK-26.T16, SEQ-03): one station per state of the node's flow.
const ROUTE: Array<{ glyph: string; label: string; states: string[] }> = [
  { glyph: "照", label: "Board checked", states: ["Check"] },
  { glyph: "署", label: "Supplier signed the entry", states: ["AwaitSupplierSignature"] },
  { glyph: "登", label: "Entry on the board", states: ["Register", "AwaitConfirmation"] },
  { glyph: "印", label: "Letter sealed by supplier and buyer", states: ["AwaitAssignment"] },
  { glyph: "金", label: "Advance paid", states: ["Pay", "AwaitAdvanceConfirmation"] },
  { glyph: "済", label: "Done", states: ["Done"] },
];

const WAITING: Record<string, string> = {
  Check: "Checking the board for this invoice.",
  AwaitSupplierSignature: "Waiting for the supplier to sign the board entry.",
  Register: "Posting the entry to the board.",
  AwaitConfirmation: "Entry posted; waiting for its confirmations.",
  AwaitAssignment: "Letter sent; waiting for the supplier's and the buyer's seals.",
  Pay: "Sealed by both. Your passkey approves the advance.",
  AwaitAdvanceConfirmation: "Advance sent; waiting for it to be mined.",
  Done: "Advance paid and mined. The buyer pays you at maturity.",
};

interface FundNav {
  assets_zat: number;
  units: number;
}

interface FundState {
  period: number;
  nav: FundNav;
  total_units: number;
  leaves: number;
  deposits: number;
  queue: Array<{ leaf: string; units: number; address: string; at: number }>;
  closes: Array<{ period: number; root: string; total_units: number; nav: FundNav; paid_zat: number; payout_txid: string | null; root_txid: string; held: boolean }>;
}

interface ClosePlan {
  plan_id: string;
  paid_zat: number;
  plan: { period: number; nav: FundNav; cash_zat: number; held: boolean; short: boolean; payouts: Array<{ leaf: string; units: number; amount_zat: number; address: string }> };
}

const price = (n: FundNav) => (n.assets_zat / Math.max(1, n.units)).toFixed(4);

interface PrivateRules {
  max_face_zat?: number;
  max_tenor_days?: number;
  min_discount_bps?: number;
  min_buyer_history?: number;
  buyer_kyc: boolean;
  /** HNK-26.T9: the history policy. */
  min_on_time_pct?: number;
  grace_days?: number;
  trusted_financiers?: string[];
}


const say = (e: unknown) => explain(e instanceof Error ? e.message : String(e));
type Load = () => Promise<void>;

/** The node's facts in a list: term, value (mono for keys), the full value on hover. */
function Fact({ term, value, mono, title }: { term: string; value: string; mono?: boolean; title?: string }): ReactNode {
  return (
    <>
      <dt>{term}</dt>
      <dd className={mono ? "is-mono" : undefined} title={title}>
        {value}
      </dd>
    </>
  );
}

/** The 印 seal of the console's plaque. */
function Seal(): ReactNode {
  return (
    <svg viewBox="0 0 100 100" className="auth-logo" aria-hidden="true">
      <circle cx={50} cy={50} r={44} className="ring" />
      <circle cx={50} cy={50} r={36} className="ring-fine" />
      <text x={50} y={67} textAnchor="middle" className="kanji">
        印
      </text>
    </svg>
  );
}

/** A copy button: says Copied, or `failed` when the clipboard refuses. */
function CopyButton({ label, value, className, failed = "Copy failed", onFail }: { label: string; value: string; className?: string; failed?: string; onFail?: () => void }): ReactNode {
  const [text, setText] = useState(label);
  return (
    <button
      className={className}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setText("Copied");
        } catch {
          if (onFail) onFail();
          else setText(failed);
        }
      }}
    >
      {text}
    </button>
  );
}

/** The offer under its mailbox row: checked terms and the accept form, or why it is refused. */
function OfferBlock({ relayId, o, demo, reload }: { relayId: string; o: Offer; demo: boolean; reload: Load }): ReactNode {
  const advance = useRef<HTMLInputElement>(null);
  const confirmations = useRef<HTMLInputElement>(null);
  const reason = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  if (!o.ok) return <p className="offer-problem">{`Refused by the node: ${o.problem}. Nothing was saved.`}</p>;
  const facts = (
    <dl className="offer-facts">
      <dt>Invoice</dt>
      <dd>{o.invoice_id ?? ""}</dd>
      <dt>Amount</dt>
      <dd>{`${zec(o.amount_zat ?? 0)} ZEC`}</dd>
      <dt>Due</dt>
      <dd>{dueDay(o.due_date ?? 0)}</dd>
      <dt>Advance asked</dt>
      <dd>{`${zec(o.advance_zat ?? 0)} ZEC`}</dd>
    </dl>
  );
  const days = o.expires_at ? Math.max(0, Math.ceil((o.expires_at * 1000 - Date.now()) / 86_400_000)) : null;
  const checked = (
    <p className="mail-note offer-checked">
      The supplier's key signed this offer and the buyer signed this exact invoice.
      {days !== null && !o.accepted ? ` Unanswered, it expires in ${days} day${days === 1 ? "" : "s"}.` : ""}
    </p>
  );
  if (o.accepted) {
    return (
      <div className="offer">
        {facts}
        <p className="offer-done">{`Accepted: ${zec(o.accepted.advance_zat)} ZEC after ${o.accepted.min_confirmations} confirmation${o.accepted.min_confirmations === 1 ? "" : "s"}. The supplier has your commitment opening.`}</p>
      </div>
    );
  }
  // the private mandate's verdict, rule by rule: 適 fits, 外 breaks, 待 waiting for the buyer
  const m = o.mandate;
  const rules =
    m && m.verdict !== "none" ? (
      <ul className={`offer-rules is-${m.verdict}`}>
        {m.rules.map((r, i) => (
          <li key={i} data-ok={String(r.ok)}>
            <b lang="ja" aria-hidden="true">
              {r.ok === true ? "適" : r.ok === false ? "外" : "待"}
            </b>
            <span>{`${r.rule}: ${r.detail}`}</span>
          </li>
        ))}
      </ul>
    ) : null;
  if (demo) {
    return (
      <div className="offer">
        {facts}
        {checked}
        {rules}
      </div>
    );
  }
  const accept = async (e: FormEvent) => {
    e.preventDefault();
    setAccepting(true);
    try {
      const c = Number(confirmations.current!.value);
      if (!Number.isInteger(c) || c < 1) throw new Error("confirmations must be a whole number, at least 1");
      await post(`/node/console/offers/${encodeURIComponent(relayId)}/accept`, { advance_zat: zat(advance.current!.value), min_confirmations: c });
      await reload();
    } catch (err) {
      setNote(say(err));
      setAccepting(false);
    }
  };
  return (
    <div className="offer">
      {facts}
      {checked}
      {rules}
      <form className="offer-form" onSubmit={(e) => void accept(e)}>
        <label className="auth-field">
          <span>Advance you pay (ZEC)</span>
          <input inputMode="decimal" defaultValue={zec(o.advance_zat ?? 0)} ref={advance} />
          <small>Up to what the supplier asked.</small>
        </label>
        <label className="auth-field">
          <span>Confirmations</span>
          <input inputMode="numeric" defaultValue="1" ref={confirmations} />
          <small>Blocks the board entry waits before you pay.</small>
        </label>
        <button className="auth-link" type="submit" disabled={accepting}>
          Accept offer
        </button>
      </form>
      <div className="offer-decline">
        <label className="auth-field">
          <span>Or decline, telling the supplier</span>
          <input defaultValue={m?.decline_reason ?? "The financier declined this offer."} maxLength={200} aria-label="Reason sent to the supplier" ref={reason} />
          <small>Names only the kind of rule, never your numbers.</small>
        </label>
        <button
          className="auth-link is-quiet"
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
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </div>
  );
}

/** A button that runs once at a time, its error shown by `fail`. */
function Act({ label, className, run, fail }: { label: string; className?: string; run: () => Promise<void>; fail: (e: unknown) => void }): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
          setBusy(false);
        } catch (e) {
          fail(e);
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}

function MailRow({ m, demo, load, setNote }: { m: Mail; demo: boolean; load: Load; setNote: (t: string) => void }): ReactNode {
  const signed = m.signer !== undefined && m.signer !== null;
  const id = m.identity;
  return (
    <li className="mail-row">
      <span className="mail-badge" aria-hidden="true">
        {ROLE_BADGE[m.from?.role ?? ""] ?? "外"}
      </span>
      <span className="mail-what">{TYPE_LABEL[m.type] ?? m.type}</span>
      {signed ? (
        <span className={m.signature_ok ? "mail-verdict" : "mail-verdict is-bad"} title={m.signature_ok ? "Signature holds" : "Signature does not hold"}>
          {m.signature_ok ? "認" : "拒"}
        </span>
      ) : (
        <span />
      )}
      <span className="mail-line">
        {`from ${m.from?.role ?? "?"} · ${ago(m.received_at)}`}
        {m.n ? (
          <>
            {" · N "}
            <span className="is-mono">{short(m.n)}</span>
          </>
        ) : null}
        {id ? (
          <>
            {" · "}
            <span className={id.registered ? "kyc-ok" : "kyc-flag"}>{id.registered ? `KYC: ${id.label}` : id.missing ? "no identity key: not checked against KYC" : "identity key not in your KYC list"}</span>
          </>
        ) : null}
      </span>
      {m.offer ? <OfferBlock relayId={m.relay_id} o={m.offer} demo={demo} reload={load} /> : null}
      <div className="mail-actions">
        {/* HNK-30.T23: a member's withdrawal waits in the fund ledger for the end of the period */}
        {m.type === "fund.withdraw" && !demo ? (
          <Act
            label="Queue for the period's end"
            run={async () => {
              const r = await post<{ units: number; period: number }>(`/node/console/fund/withdrawals/${encodeURIComponent(m.relay_id)}`);
              setNote(`Queued: ${r.units} units, paid when period ${r.period} closes.`);
              document.dispatchEvent(new Event("fund-changed"));
            }}
            fail={(e) => setNote(say(e))}
          />
        ) : null}
        {(m.attachments ?? []).map((a, i) => (
          <a key={i} href={`/node/mail/${encodeURIComponent(m.relay_id)}/attachments/${i}`} download="">
            {`${a.name} (${kib(a.size)})`}
          </a>
        ))}
        {!demo ? (
          <Act
            label="Remove"
            run={async () => {
              await del(`/node/mail/${encodeURIComponent(m.relay_id)}`);
              await load();
            }}
            fail={(e) => setNote(say(e))}
          />
        ) : null}
      </div>
    </li>
  );
}

function Mailbox({ demo }: { demo: boolean }): ReactNode {
  const [mail, setMail] = useState<Mail[]>([]);
  const [note, setNote] = useState("");
  const load = async () => {
    setNote("Opening sealed messages…");
    try {
      const j = await get<{ messages: Mail[]; refused: number }>("/node/mail");
      setMail(j.messages);
      const refused = j.refused ? ` ${j.refused} could not be opened or were addressed elsewhere.` : "";
      setNote(j.messages.length ? refused.trim() : `No messages.${refused}`);
    } catch (e) {
      setNote(say(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="mail is-tray" aria-labelledby="mail-title">
      <div className="mail-head">
        <h2 className="mail-title" id="mail-title">
          Mailbox
        </h2>
        <button className="auth-link" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <ul className="mail-list">
        {mail.map((m) => (
          <MailRow key={m.relay_id} m={m} demo={demo} load={load} setNote={setNote} />
        ))}
      </ul>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/** Buyers the financier knows from KYC (HNK-26.T7): their identity keys, kept on the node. */
function Buyers({ demo }: { demo: boolean }): ReactNode {
  const [list, setList] = useState<Buyer[]>([]);
  const [note, setNote] = useState("");
  const key = useRef<HTMLInputElement>(null);
  const label = useRef<HTMLInputElement>(null);
  const load = async () => {
    try {
      const j = await get<{ buyers: Buyer[] }>("/node/console/buyers");
      setList(j.buyers);
      if (!j.buyers.length) setNote("No buyers yet. A buyer's identity key is in the buyer's app, under its invoice keys.");
    } catch (e) {
      setNote(say(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="mail is-index" aria-labelledby="buyers-title">
      <div className="mail-head">
        <h2 className="mail-title" id="buyers-title">
          Buyers (KYC)
        </h2>
      </div>
      <ul className="mail-list">
        {list.map((b) => (
          <li className="mail-row" key={b.identity_pk}>
            <span className="mail-badge" aria-hidden="true">
              買
            </span>
            <span className="mail-what">{b.label}</span>
            <span />
            <span className="mail-line">
              {`added ${day(b.added_at)} · `}
              <span className="is-mono">{short(b.identity_pk)}</span>
            </span>
            <div className="mail-actions">
              {!demo ? (
                <Act
                  label="Remove"
                  run={async () => {
                    await del(`/node/console/buyers/${encodeURIComponent(b.identity_pk)}`);
                    setNote("Buyer removed.");
                    await load();
                  }}
                  fail={(e) => setNote(say(e))}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!demo ? (
        <form
          className="offer-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post("/node/console/buyers", { identity_pk: key.current!.value.trim(), label: label.current!.value });
              key.current!.value = "";
              label.current!.value = "";
              setNote("Buyer added.");
              await load();
            } catch (err) {
              setNote(say(err));
            }
          }}
        >
          <label className="auth-field">
            <span>Identity key</span>
            <input maxLength={64} placeholder="64 hex characters" autoComplete="off" spellCheck="false" ref={key} />
            <small>From the buyer, after your KYC.</small>
          </label>
          <label className="auth-field">
            <span>Name or KYC reference</span>
            <input maxLength={80} placeholder="e.g. PT Sakura Niaga, KYC-0042" autoComplete="off" ref={label} />
            <small>Stays on your node.</small>
          </label>
          <button className="auth-link" type="submit">
            Add buyer
          </button>
        </form>
      ) : null}
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

function Devices({ demo }: { demo: boolean }): ReactNode {
  const [list, setList] = useState<Device[]>([]);
  const [note, setNote] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const link = useRef<HTMLParagraphElement>(null);
  const load = async () => {
    try {
      const j = await get<{ devices: Device[] }>("/node/console/devices");
      setList(j.devices);
    } catch (e) {
      setNote(say(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="mail is-keys" aria-labelledby="devices-title">
      <div className="mail-head">
        <h2 className="mail-title" id="devices-title">
          Devices
        </h2>
        {demo ? null : (
          <button
            className="auth-link"
            type="button"
            onClick={async () => {
              try {
                const r = await post<{ link: string }>("/node/console/devices/code");
                setInvite(r.link);
              } catch (e) {
                setNote(say(e));
              }
            }}
          >
            Add a device
          </button>
        )}
      </div>
      <ul className="mail-list">
        {list.map((d) => {
          const what = d.current ? "This device" : d.usable ? "Passkey" : "Old passkey";
          const line = d.usable ? `paired ${day(d.paired_at)}${d.last_used ? ` · last used ${day(d.last_used)}` : " · not used yet"}` : `paired ${day(d.paired_at)} on another address; it cannot sign in here`;
          return (
            <li className="mail-row" key={d.id}>
              <span className="mail-badge" aria-hidden="true">
                鍵
              </span>
              <span className="mail-what">{what}</span>
              <span />
              <span className="mail-line">
                {line}
                {" · "}
                <span className="is-mono">{`${d.id.slice(0, 8)}…`}</span>
              </span>
              <div className="mail-actions">
                {!d.current && !demo ? (
                  <Act
                    label="Remove"
                    run={async () => {
                      await del(`/node/console/devices/${encodeURIComponent(d.id)}`);
                      setNote("Passkey removed.");
                      await load();
                    }}
                    fail={(e) => setNote(say(e))}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="invite" hidden={invite === null}>
        <p className="mail-note">Open this link on the new device within 15 minutes. It works once.</p>
        <p className="invite-link is-mono" ref={link}>
          {invite ?? ""}
        </p>
        <CopyButton className="auth-link" label="Copy link" value={invite ?? ""} onFail={() => link.current && getSelection()?.selectAllChildren(link.current)} />
      </div>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

function AuthFoot(): ReactNode {
  return (
    <div className="auth-foot">
      <p className="auth-protected">
        <LockIcon />
        Protected by your device passkey
      </p>
      <p className="auth-host">{`Works only on ${location.host}`}</p>
    </div>
  );
}

function LoginView({ session, rerender }: { session: Session; rerender: () => void }): ReactNode {
  const name = keptName();
  const msg = useMessage();
  const off = !session.console;
  useEffect(() => {
    if (off) msg.show("The console is off on this node. Ask your node provider.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (off) {
    return (
      <main className="auth">
        <Sheet>
          <Head title="Financier console" />
          {msg.el}
          <AuthFoot />
        </Sheet>
      </main>
    );
  }
  if (session.demo) return <DemoLogin rerender={rerender} />;
  if (!session.paired) {
    return (
      <main className="auth">
        <Sheet>
          <Head title="Financier console" sub="No passkey is set up for this console yet. Open the invite link your node provider sent you." />
          <AuthFoot />
        </Sheet>
      </main>
    );
  }
  return (
    <main className="auth">
      <Sheet>
        <Head title={name ? `Welcome back, ${name}` : "Log in to your console"} sub="Use the passkey you set up for this console." />
        <div className="auth-list">
          <Row
            lead={<PasskeyIcon />}
            label="Continue with passkey"
            line="Fingerprint, face or device PIN"
            trail={<Chevron />}
            run={async () => {
              msg.clear();
              try {
                await assert("/node/console/login/start", "/node/console/login/finish");
                rerender();
              } catch (e) {
                msg.error(e);
              }
            }}
          />
        </div>
        {msg.el}
        <p className="auth-switch">
          New device? <AuthLink label="Open an invite link" run={() => void (location.href = "/console/pair")} />
        </p>
        <AuthFoot />
      </Sheet>
    </main>
  );
}

/** The demo console's door: a visitor creates a passkey (no invite) or comes back with one. */
function DemoLogin({ rerender }: { rerender: () => void }): ReactNode {
  const msg = useMessage();
  return (
    <main className="auth">
      <Sheet>
        <Head title="Try the financier console" sub="A demo node on Zcash testnet. Sign in as its financier: read its sealed mailbox and see how payments wait for your passkey. Nothing here moves money." />
        <div className="auth-list">
          <Row
            lead={
              <span className="auth-badge" aria-hidden="true">
                証
              </span>
            }
            label="Create a passkey to try it"
            line="No invite and no account: a passkey for this demo only"
            trail={<Chevron />}
            run={async () => {
              msg.clear();
              try {
                const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> } }>("/node/console/pair/start", { code: "" });
                const cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
                await post("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
                rerender();
              } catch (e) {
                msg.error(e instanceof DOMException && e.name === "NotAllowedError" ? new Error("The passkey was not created.") : e);
              }
            }}
          />
          <Row
            lead={<PasskeyIcon />}
            label="I tried it before"
            line="Continue with the passkey you made here"
            trail={<Chevron />}
            run={async () => {
              msg.clear();
              try {
                await assert("/node/console/login/start", "/node/console/login/finish");
                rerender();
              } catch (e) {
                msg.error(e);
              }
            }}
          />
        </div>
        {msg.el}
        <AuthFoot />
      </Sheet>
    </main>
  );
}

/** The financier's own display name: shown only here and at log in on this browser. */
function NameSection({ current, onSaved }: { current: string | null | undefined; onSaved: (name: string) => void }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  return (
    <section className="mail is-name" aria-labelledby="name-title">
      <div className="mail-head">
        <h2 className="mail-title" id="name-title">
          Profile
        </h2>
      </div>
      <form
        className="name-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await post<{ name: string }>("/node/console/name", { name: input.current!.value });
            keepName(r.name);
            setNote("Saved.");
            onSaved(r.name);
          } catch (err) {
            setNote(say(err));
          }
        }}
      >
        <label className="auth-field">
          <span>Your name</span>
          <input maxLength={60} placeholder="e.g. Kurogane Capital" autoComplete="organization" defaultValue={current ?? ""} ref={input} />
          <small>Shown only in your own console.</small>
        </label>
        <button className="auth-link" type="submit">
          Save
        </button>
      </form>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/** The public mandate (HNK-30.T19, D-47): what suppliers see of this financier in the directory.
 *  The node signs it and sends it to the node provider, who lists it; the detailed rules for
 *  offers stay private on the node (N-15). */
function Mandate({ demo }: { demo: boolean }): ReactNode {
  const min = useRef<HTMLInputElement>(null);
  const max = useRef<HTMLInputElement>(null);
  const tenor = useRef<HTMLInputElement>(null);
  const kyc = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const toZat = (v: string) => Math.round(Number(v) * 1e8);
  useEffect(() => {
    void get<{ mandate: MandateData | null }>("/node/console/mandate").then(
      (r) => {
        if (!r.mandate) return;
        min.current!.value = zec(r.mandate.min_zat);
        max.current!.value = zec(r.mandate.max_zat);
        tenor.current!.value = String(r.mandate.max_tenor_days);
        kyc.current!.checked = r.mandate.buyer_kyc;
        setNote("This is what the directory shows now, once the provider listed it.");
      },
      () => undefined,
    );
  }, []);
  return (
    <section className="mail is-mandate" aria-labelledby="mandate-title">
      <div className="mail-head">
        <h2 className="mail-title" id="mandate-title">
          Public mandate
        </h2>
      </div>
      <p className="mail-note mandate-lede">What suppliers see of you in the financier directory. Your detailed rules for offers stay on this node.</p>
      <form
        className="offer-form mandate-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          try {
            const body: MandateData = { min_zat: toZat(min.current!.value), max_zat: toZat(max.current!.value), max_tenor_days: Math.round(Number(tenor.current!.value)), buyer_kyc: kyc.current!.checked };
            if (![body.min_zat, body.max_zat, body.max_tenor_days].every(Number.isFinite)) throw new Error("fill in the three numbers");
            await post("/node/console/mandate", body);
            setNote("Signed and sent to the node provider. Suppliers see it once the provider lists it.");
          } catch (err) {
            setNote(say(err));
          } finally {
            setSending(false);
          }
        }}
      >
        <label className="auth-field">
          <span>Smallest invoice (ZEC)</span>
          <input inputMode="decimal" placeholder="0.0001" ref={min} />
        </label>
        <label className="auth-field">
          <span>Largest invoice (ZEC)</span>
          <input inputMode="decimal" placeholder="1" ref={max} />
        </label>
        <label className="auth-field">
          <span>Longest tenor (days)</span>
          <input inputMode="numeric" placeholder="90" ref={tenor} />
        </label>
        <label className="mandate-kyc">
          <input type="checkbox" ref={kyc} />
          <span>Only buyers I know from KYC</span>
        </label>
        {demo ? (
          <span />
        ) : (
          <button className="auth-link" type="submit" disabled={sending}>
            Send to the directory
          </button>
        )}
      </form>
      {/* HNK-30.T21 (D-48): the provider attests this financier's record from the board; only
          coarse classes appear in the directory. */}
      {demo ? null : (
        <button
          className="auth-link"
          type="button"
          disabled={attesting}
          onClick={async () => {
            setAttesting(true);
            try {
              const r = await post<{ deals: number }>("/node/console/reputation");
              setNote(`Sent ${r.deals} deal fingerprint(s) with their salts, sealed to the node provider. It checks them on the board and lists only classes (deals settled, share on time).`);
            } catch (err) {
              setNote(say(err));
            } finally {
              setAttesting(false);
            }
          }}
        >
          Ask the provider to attest my record
        </button>
      )}
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/**
 * HNK-26.T14: another financier registered this invoice first, so the supplier signed it twice.
 * Exhibit A shows that without the deal; the full proof stays with you.
 */
function Evidence({ name, exhibit, proof }: { name: string; exhibit: string; proof: string }): ReactNode {
  return (
    <div className="pl-proof">
      <b className="pl-proof-stamp" lang="ja" aria-hidden="true">
        重
      </b>
      <div>
        <p className="pl-proof-k">Financed twice: not paid</p>
        <p className="mail-note">Another financier registered this invoice first; the supplier signed it for both of you. No money left this node. Exhibit A proves it to anyone without showing the deal.</p>
        <div className="mail-actions">
          <CopyButton label="Copy Exhibit A" value={exhibit} failed="Copy failed: select the code" />
          {proof ? <CopyButton label="Copy the full proof" value={proof} failed="Copy failed: select the code" /> : null}
          {/* HNK-32.T5 (BL-D27-04): files for whoever needs them, read by Verify and `jitsuin verify` */}
          <button type="button" onClick={() => download(`${name}.exhibit-a.txt`, exhibit)}>
            Download Exhibit A
          </button>
          {proof ? (
            <button type="button" onClick={() => download(`${name}.proof.txt`, proof)}>
              Download the full proof
            </button>
          ) : null}
          <a href="https://jitsuinfi.vercel.app/verify" target="_blank" rel="noopener">
            Open the Verify page
          </a>
        </div>
      </div>
    </div>
  );
}

/** BL-D28-03: the settled deal's verification bundle, for an auditor or a court (Verify page). */
function BundleCopy({ bundle }: { bundle: string }): ReactNode {
  return (
    <div className="mail-actions">
      <CopyButton label="Copy the verification bundle (JTSB)" value={bundle} />
      <a href="https://jitsuinfi.vercel.app/verify" target="_blank" rel="noopener">
        Check it on the Verify page
      </a>
    </div>
  );
}

/**
 * HNK-26.T13: a repayment claimed without a covering payment, disputed or overdue. The evidence
 * file (JTSE) carries the buyer's signed claims and every repayment output with its receipt, so
 * whoever receives it recomputes the status instead of trusting this console.
 */
function RepaymentEvidence({ name, status, file }: { name: string; status: string; file: string }): ReactNode {
  const word: Record<string, string> = {
    Claimed: "The buyer says it paid, but no mined payment covers the amount yet.",
    Disputed: "The buyer's claim is past the grace period and still not covered: a dispute.",
    Overdue: "Past the due date and the grace period, with no claim from the buyer.",
  };
  return (
    <div className="pl-proof">
      <b className="pl-proof-stamp" lang="ja" aria-hidden="true">
        {status === "Claimed" ? "待" : "滞"}
      </b>
      <div>
        <p className="pl-proof-k">{`Repayment ${status.toLowerCase()}`}</p>
        <p className="mail-note">{word[status] ?? ""}</p>
        <p className="mail-note">Anyone you give it to rechecks it with `jitsuin verify --evidence &lt;file&gt;`: the buyer's signatures, and the status from the file itself.</p>
        <div className="mail-actions">
          <CopyButton label="Copy the evidence (JTSE)" value={file} />
          {/* HNK-32.T5 (BL-D25-04) */}
          <button type="button" onClick={() => download(`${name}.evidence.txt`, file)}>
            Download the evidence
          </button>
        </div>
      </div>
    </div>
  );
}

/** The deals after Accept, moved by the node; the advance waits for the operator's passkey. */
function Pipeline({ demo }: { demo: boolean }): ReactNode {
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [note, setNote] = useState("");
  const load = async () => {
    try {
      const r = await get<{ deals: DealRow[] }>("/node/console/deals");
      setDeals(r.deals);
    } catch (e) {
      setNote(say(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fail = (e: unknown) => setNote(say(e));
  return (
    <section className="mail is-deals" aria-labelledby="deals-title">
      <div className="mail-head">
        <h2 className="mail-title" id="deals-title">
          Deals
        </h2>
        <button className="auth-link" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <ol className="pl-list">
        {deals === null
          ? null
          : deals.length
            ? deals.map((d) => {
                const at = ROUTE.findIndex((r) => r.states.includes(d.state));
                return (
                  <li className="pl-deal" key={d.n}>
                    <p className="pl-head">
                      <strong>{d.invoice_id}</strong>
                      {` · ${zec(d.amount_zat)} ZEC due ${dueDay(d.due_date)} · advance ${zec(d.advance_zat)} ZEC`}
                    </p>
                    <ol className="pl-route" aria-label="Where this deal is">
                      {ROUTE.map((r, i) => (
                        <li key={r.glyph} data-at={d.state === "Stopped" ? "stopped" : i < at ? "done" : i === at ? "now" : "later"} title={r.label}>
                          <b lang="ja" aria-hidden="true">
                            {r.glyph}
                          </b>
                          <span>{r.label}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mail-note">{d.state === "Stopped" ? stopReason(d.stopped ?? "", d.stopped_winner) : d.state === "AwaitConfirmation" && d.confirmations != null && d.min_confirmations ? `Entry posted: ${d.confirmations} of ${d.min_confirmations} confirmations.` : (WAITING[d.state] ?? d.state)}</p>
                    {d.history_requested ? <p className="mail-note">{d.history ? `Buyer history passed: ${d.history}.` : "Waiting for the buyer's history (your mandate asks for it before the supplier signs)."}</p> : null}
                    {d.state === "Done" && d.repayment ? (
                      <p className="mail-note">
                        {d.settled_txid ? `Repaid and settled on the board (${short(d.settled_txid)})${d.bundle_sent ? "; the bundle went to the supplier and the buyer" : ""}.` : `Repayment: ${d.repayment.toLowerCase()}${d.paid_zat ? `, ${zec(d.paid_zat)} ZEC received` : ""}.`}
                      </p>
                    ) : null}
                    {d.exhibit ? <Evidence name={d.invoice_id} exhibit={d.exhibit} proof={d.proof ?? ""} /> : null}
                    {d.evidence ? <RepaymentEvidence name={d.invoice_id} status={d.repayment ?? ""} file={d.evidence} /> : null}
                    {d.bundle ? <BundleCopy bundle={d.bundle} /> : null}
                    {d.problem ? <p className="offer-problem">{explain(d.problem)}</p> : null}
                    {d.advance_txid ? <p className="mail-note is-mono">{`Advance ${short(d.advance_txid)}`}</p> : d.entry_txid ? <p className="mail-note is-mono">{`Entry ${short(d.entry_txid)}`}</p> : null}
                    <div className="mail-actions">
                      {!demo && d.state === "Pay" && d.intent ? (
                        <Act
                          className="auth-link"
                          label={`Approve with passkey: pay ${zec(d.advance_zat)} ZEC`}
                          run={async () => {
                            const approval = await approvePayment(d.intent!);
                            await post(`/node/console/deals/${d.n}/pay`, { approval });
                            await load();
                          }}
                          fail={fail}
                        />
                      ) : null}
                      {!demo && !["Pay", "Done", "Stopped"].includes(d.state) ? (
                        <Act
                          label="Move on now"
                          run={async () => {
                            await post(`/node/console/deals/${d.n}/step`);
                            await load();
                          }}
                          fail={fail}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })
            : [
                <li className="pl-empty" key="empty">
                  No deal yet: accept an offer from the mailbox.
                </li>,
              ]}
      </ol>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/**
 * The fund ledger (HNK-30.T23, D-49), for a financier that runs a pooled fund: deposits seen in
 * the wallet become members' units, withdrawals wait for the period's end, and the close pays them
 * from cash with one passkey approval of the exact plan, then signs the new root into JTLR.
 */
function FundLedger({ info, demo }: { info: Info; demo: boolean }): ReactNode {
  const [f, setF] = useState<FundState | null>(null);
  const [note, setNote] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [plan, setPlan] = useState<ClosePlan | null>(null);
  const [recording, setRecording] = useState(false);
  const [carding, setCarding] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [paying, setPaying] = useState(false);
  const member = useRef<HTMLInputElement>(null);
  const txid = useRef<HTMLInputElement>(null);
  const cardText = useRef<HTMLParagraphElement>(null);
  const fail = (e: unknown) => setNote(say(e));
  const load = async () => {
    try {
      setF(await get<FundState>("/node/console/fund"));
    } catch (e) {
      fail(e);
    }
  };
  useEffect(() => {
    void load();
    const on = () => void load();
    document.addEventListener("fund-changed", on);
    return () => document.removeEventListener("fund-changed", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const last = f?.closes[0];
  return (
    <section className="mail is-fund" aria-labelledby="fund-title">
      <div className="mail-head">
        <h2 className="mail-title" id="fund-title">
          Fund ledger
        </h2>
      </div>
      <p className="mail-note">For a pooled fund: members hold units, priced from this wallet's cash and receivables at each close.</p>
      <dl className="fd-book">
        {f ? (
          <>
            <Fact term="Period" value={String(f.period)} />
            <Fact term="Price per unit" value={`${price(f.nav)} zat`} />
            <Fact term="Units out" value={f.total_units.toLocaleString("en")} />
            <Fact term="Holdings" value={`${f.leaves} from ${f.deposits} deposits`} />
            {last ? <Fact term="Last close" value={`period ${last.period} · ${last.held ? "held, below par" : `${zec(last.paid_zat)} ZEC paid`}`} mono title={last.root} /> : null}
          </>
        ) : null}
      </dl>
      <ol className="fd-queue">
        {f
          ? f.queue.length
            ? f.queue.map((r, i) => (
                <li key={i}>
                  <b>{`${r.units.toLocaleString("en")} units`}</b>
                  <span className="is-mono">{` to ${short(r.address)}`}</span>
                </li>
              ))
            : [
                <li className="is-empty" key="none">
                  No withdrawal waits for this period.
                </li>,
              ]
          : null}
      </ol>
      {demo ? null : (
        // HNK-30.T22: a fund card for a new member: a deposit address made for them, the fund's key
        // and mailbox, so the member can pay in and the receipt comes back sealed to them
        <button
          className="auth-link"
          type="button"
          disabled={carding}
          onClick={async () => {
            setCarding(true);
            try {
              const { address } = await post<{ address: string }>("/node/console/fund/deposit-address");
              const contact = JSON.parse(atob(info.contact.slice("jitsuin-contact-v1:".length).replace(/-/g, "+").replace(/_/g, "/"))) as { mailbox_pk: string };
              setCard(encodeFundCard({ v: 1, fund_pk: info.financier_pk, mailbox_pk: contact.mailbox_pk, deposit_address: address }));
            } catch (err) {
              fail(err);
            } finally {
              setCarding(false);
            }
          }}
        >
          Fund card for a new member
        </button>
      )}
      <div className="fd-plan">
        {card ? (
          <>
            <p className="mail-note">Give this card to the member over a private channel. Its deposit address is new and used for this member only.</p>
            <p className="invite-link is-mono" ref={cardText}>
              {card}
            </p>
            <CopyButton key={card} label="Copy" value={card} onFail={() => cardText.current && getSelection()?.selectAllChildren(cardText.current)} />
          </>
        ) : null}
      </div>
      {demo ? null : (
        <form
          className="offer-form fd-deposit"
          onSubmit={async (e) => {
            e.preventDefault();
            setRecording(true);
            try {
              const r = await post<{ amount_zat: number; units: number; receipt_sent: boolean }>("/node/console/fund/deposits", { member: member.current!.value.trim(), txid: txid.current!.value.trim() });
              setNote(`${zec(r.amount_zat)} ZEC bought ${r.units.toLocaleString("en")} units. ${r.receipt_sent ? "The receipt, with its withdraw token, is sealed to the member." : "The units are recorded, but the receipt did not reach the relay: the member cannot withdraw them until they have it."}`);
              member.current!.value = txid.current!.value = "";
              await load();
            } catch (err) {
              fail(err);
            } finally {
              setRecording(false);
            }
          }}
        >
          <label className="auth-field">
            <span>Member's contact card</span>
            <input placeholder="jitsuin-contact-v1:…" spellCheck="false" autoComplete="off" ref={member} />
          </label>
          <label className="auth-field">
            <span>Deposit transaction (mined, in this wallet)</span>
            <input placeholder="transaction id" spellCheck="false" autoComplete="off" ref={txid} />
          </label>
          <button className="auth-link" type="submit" disabled={recording}>
            Record the deposit
          </button>
        </form>
      )}
      {demo ? null : (
        <button
          className="auth-link"
          type="button"
          disabled={planning}
          onClick={async () => {
            setPlanning(true);
            setPlan(null);
            try {
              setNote("Syncing the wallet and valuing the fund…");
              setPlan(await post<ClosePlan>("/node/console/fund/plan"));
              setNote("");
            } catch (err) {
              fail(err);
            } finally {
              setPlanning(false);
            }
          }}
        >
          Plan the period's close
        </button>
      )}
      <div className="fd-plan">
        {plan ? (
          <>
            <p className="mail-note">{`Period ${plan.plan.period} at ${price(plan.plan.nav)} zat per unit, ${zec(plan.plan.cash_zat)} ZEC in cash. ${plan.plan.held ? "Below par: no withdrawal is paid this period." : plan.plan.short ? "Cash does not cover the queue: every request gets the same share, the rest waits." : ""}`}</p>
            {plan.plan.payouts.length ? (
              <ol className="fd-queue">
                {plan.plan.payouts.map((x, i) => (
                  <li key={i}>
                    <b>{`${zec(x.amount_zat)} ZEC`}</b>
                    {` for ${x.units.toLocaleString("en")} units · `}
                    <span className="is-mono">{short(x.address)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mail-note">Nothing to pay; the close signs the new root.</p>
            )}
            {demo ? (
              <span />
            ) : (
              <button
                className="auth-link fd-pay"
                type="button"
                disabled={paying}
                onClick={async () => {
                  setPaying(true);
                  try {
                    const approval = await approvePlan(plan.plan_id);
                    const r = await post<{ period: number; paid_zat: number; root: string; root_txid: string | null; root_error: string | null; undelivered: number }>("/node/console/fund/close", { plan_id: plan.plan_id, approval });
                    setNote(`Period ${r.period} closed: ${zec(r.paid_zat)} ZEC paid, root ${short(r.root)} ${r.root_txid ? "signed on chain" : `not posted yet (${r.root_error})`}. ${r.undelivered ? `${r.undelivered} message(s) did not reach the relay.` : "Every member has their path."}`);
                    setPlan(null);
                    setPaying(false);
                    await load();
                  } catch (err) {
                    fail(err);
                    setPaying(false);
                  }
                }}
              >
                {plan.plan.payouts.length ? `Approve with passkey: pay ${zec(plan.paid_zat)} ZEC and sign the root` : "Approve with passkey: sign the root"}
              </button>
            )}
          </>
        ) : null}
      </div>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/** The private mandate 内規 (HNK-30.T11, N-15): rules that stay on this node, matched to offers. */
function PrivateMandate({ demo }: { demo: boolean }): ReactNode {
  const face = useRef<HTMLInputElement>(null);
  const tenor = useRef<HTMLInputElement>(null);
  const discount = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLInputElement>(null);
  const kyc = useRef<HTMLInputElement>(null);
  const onTime = useRef<HTMLInputElement>(null);
  const grace = useRef<HTMLInputElement>(null);
  const trusted = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void get<{ mandate: PrivateRules }>("/node/console/mandate/private").then(
      ({ mandate: m }) => {
        if (m.max_face_zat) face.current!.value = zec(m.max_face_zat);
        if (m.max_tenor_days) tenor.current!.value = String(m.max_tenor_days);
        if (m.min_discount_bps) discount.current!.value = String(m.min_discount_bps / 100);
        if (m.min_buyer_history) history.current!.value = String(m.min_buyer_history);
        kyc.current!.checked = m.buyer_kyc;
        if (m.min_on_time_pct !== undefined) onTime.current!.value = String(m.min_on_time_pct);
        if (m.grace_days !== undefined) grace.current!.value = String(m.grace_days);
        trusted.current!.value = (m.trusted_financiers ?? []).join("\n");
      },
      () => undefined,
    );
  }, []);
  const opt = (v: string, f: (n: number) => number) => {
    if (!v.trim()) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error("rules are positive numbers, or empty for none");
    return f(n);
  };
  const field = (label: string, input: ReactNode, cls = "auth-field") => (
    <label className={cls}>
      <span>{label}</span>
      {input}
    </label>
  );
  return (
    <section className="mail is-rules" aria-labelledby="rules-title">
      <div className="mail-head">
        <h2 className="mail-title" id="rules-title">
          Private mandate
        </h2>
      </div>
      <p className="mail-note mandate-lede">Your own rules for offers. They never leave this node: suppliers only learn which kind of rule an offer broke.</p>
      <form
        className="offer-form mandate-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            const body: PrivateRules = {
              max_face_zat: opt(face.current!.value, (n) => Math.round(n * 1e8)),
              max_tenor_days: opt(tenor.current!.value, Math.round),
              min_discount_bps: opt(discount.current!.value, (n) => Math.round(n * 100)),
              min_buyer_history: opt(history.current!.value, Math.round),
              buyer_kyc: kyc.current!.checked,
              min_on_time_pct: opt(onTime.current!.value, Math.round),
              grace_days: opt(grace.current!.value, Math.round),
              trusted_financiers: trusted.current!.value
                .split(/\s+/)
                .map((k) => k.trim().toLowerCase())
                .filter(Boolean),
            };
            await post("/node/console/mandate/private", body);
            setNote("Kept on this node only. Every offer in the mailbox is now matched against these rules.");
          } catch (err) {
            setNote(say(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        {field("Largest invoice (ZEC)", <input inputMode="decimal" placeholder="no limit" ref={face} />)}
        {field("Longest tenor (days)", <input inputMode="numeric" placeholder="no limit" ref={tenor} />)}
        {field("Smallest discount (%)", <input inputMode="decimal" placeholder="none" ref={discount} />)}
        {field("Buyer history (invoices)", <input inputMode="numeric" placeholder="none" ref={history} />)}
        <label className="mandate-kyc">
          <input type="checkbox" ref={kyc} />
          <span>Buyer's identity must be in my KYC list</span>
        </label>
        {field("Paid on time, at least (%)", <input inputMode="numeric" placeholder="80" ref={onTime} />)}
        {field("Grace after due date (days)", <input inputMode="numeric" placeholder="7" ref={grace} />)}
        <label className="auth-field mandate-wide">
          <span>Also trust repayments to these financiers</span>
          <textarea rows={2} spellCheck="false" placeholder="financier keys, one per line" ref={trusted} />
          <small>Besides you and the financiers in the provider's directory.</small>
        </label>
        {demo ? (
          <span />
        ) : (
          <button className="auth-link" type="submit" disabled={saving}>
            Keep these rules on the node
          </button>
        )}
      </form>
      <p className="mail-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}

/** What a supplier needs to offer this node an invoice: the contact card and the financier key. */
function Share({ info }: { info: Info }): ReactNode {
  const Item = ({ label, value, hint }: { label: string; value: string; hint: string }) => {
    const text = useRef<HTMLParagraphElement>(null);
    return (
      <div className="invite">
        <p className="mail-note offer-checked">
          <strong>{label}</strong>
          {` ${hint}`}
        </p>
        <p className="invite-link is-mono" ref={text}>
          {value}
        </p>
        <CopyButton className="auth-link" label="Copy" value={value} onFail={() => text.current && getSelection()?.selectAllChildren(text.current)} />
      </div>
    );
  };
  return (
    <section className="mail is-meishi" aria-labelledby="share-title">
      <div className="mail-head">
        <h2 className="mail-title" id="share-title">
          For suppliers
        </h2>
      </div>
      <Item label="Contact card." value={info.contact} hint="Suppliers send their offers sealed to this mailbox." />
      <Item label="Financier key." value={info.financier_pk} hint="The supplier's app checks it against the card's fingerprint." />
    </section>
  );
}

/** Signed in (HNK-30.T16, MASTER.md §8): the financier sits on B's side of the 登記所 counter,
 *  in the registry room. The mailbox is the in-tray of letters, the contact card a meishi, the
 *  KYC registry an index box, the paired passkeys keys on a rack. */
function Desk({ session, info, rerender }: { session: Session; info: Info; rerender: () => void }): ReactNode {
  const demo = session.demo === true;
  const [name, setName] = useState(session.name);
  return (
    <main className="auth dk">
      <span className="dk-lamp" aria-hidden="true" />
      <header className="dk-plaque">
        <Seal />
        <div className="dk-who">
          <p className="dk-eyebrow">
            <span lang="ja">登記所</span>
            {demo ? "Demo console: payments, invites, removals and the profile are off" : "Financier node · the keys and wallet stay on the node"}
          </p>
          <h1 className="dk-title">{name ? `Welcome, ${name}` : "Financier console"}</h1>
          <dl className="dk-facts">
            <Fact term="Network" value={info.network === "main" ? "Zcash mainnet" : "Zcash testnet"} />
            <Fact term="Node key" value={contactFingerprint(info.contact)} mono />
            <Fact term="Mailbox" value={short(info.mailbox_id)} mono title={info.mailbox_id} />
            <Fact term="Wallet" value={short(info.wallet_address)} mono title={info.wallet_address} />
          </dl>
        </div>
        <button
          className="auth-link"
          type="button"
          onClick={async () => {
            await post("/node/console/logout").catch(() => undefined);
            rerender();
          }}
        >
          Sign out
        </button>
      </header>
      <div className="dk-desk">
        <div className="dk-left">
          <Mailbox demo={demo} />
          <Pipeline demo={demo} />
          <FundLedger info={info} demo={demo} />
        </div>
        <div className="dk-right">
          <Share info={info} />
          <Mandate demo={demo} />
          <PrivateMandate demo={demo} />
          <Buyers demo={demo} />
          <Devices demo={demo} />
          {demo ? null : <NameSection current={session.name} onSaved={(n) => setName(n)} />}
        </div>
      </div>
    </main>
  );
}

/** The console home: the sign-in sheet, or the desk once signed in. */
export function Home({ session, info, rerender }: { session: Session; info: Info; rerender: () => void }): ReactNode {
  useEffect(() => {
    if (session.signed_in) keepName(session.name);
  }, [session]);
  return session.signed_in ? <Desk session={session} info={info} rerender={rerender} /> : <LoginView session={session} rerender={rerender} />;
}

export type { Info, Session };
