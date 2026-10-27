// The desk's other screens (HNK-34.T5): 内規, the private rule sheet, beside the public listing
// (HNK-30.T11, T19, T21); the fund ledger (HNK-30.T22, T23); and the keys: the meishi for
// suppliers, the paired passkeys, the buyers known from KYC and the financier's name (HNK-26.T4,
// T7, T20). Every value is read from the node; the demo console shows them without the actions.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { encodeFundCard } from "../lib/fund-card";
import { Act, CopyButton, LockGlyph, PasskeyGlyph, say, Stamp, Status } from "./bits";
import { keepName } from "./name";
import { short, zec } from "./model";
import { approvePlan, del, get, post } from "./node";
import type { Buyer, ClosePlan, Device, FundNav, FundState, Info, Mail, MandateData, PrivateRules } from "./types";
import { Lede } from "../app/Lede";

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const price = (n: FundNav) => (n.assets_zat / Math.max(1, n.units)).toFixed(4);
const replay = (el: Element | null, cls: string) => {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};

/** How many rules the sheet holds. */
const ruleCount = (m: PrivateRules) =>
  [m.max_face_zat, m.max_tenor_days, m.min_discount_bps, m.min_buyer_history, m.min_on_time_pct, m.grace_days].filter((v) => v !== undefined && v !== null).length + (m.buyer_kyc ? 1 : 0) + ((m.trusted_financiers ?? []).length ? 1 : 0);

/** The private mandate 内規 (HNK-30.T11, N-15): rules that stay on this node, matched to offers. */
function RuleSheet({ demo, onCount }: { demo: boolean; onCount: (n: number) => void }): ReactNode {
  const face = useRef<HTMLInputElement>(null);
  const tenor = useRef<HTMLInputElement>(null);
  const discount = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLInputElement>(null);
  const kyc = useRef<HTMLInputElement>(null);
  const onTime = useRef<HTMLInputElement>(null);
  const grace = useRef<HTMLInputElement>(null);
  const trusted = useRef<HTMLTextAreaElement>(null);
  const seal = useRef<HTMLSpanElement>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState(false);
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
        onCount(ruleCount(m));
      },
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const opt = (v: string, f: (n: number) => number) => {
    if (!v.trim()) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error("rules are positive numbers, or empty for none");
    return f(n);
  };
  const line = (k: string, id: string, label: string, input: ReactNode, unit: string) => (
    <div className="cs-rline">
      <i lang="ja">{k}</i>
      <label htmlFor={id}>{label}</label>
      {input}
      <span className="cs-u">{unit}</span>
    </div>
  );
  return (
    <form
      className="cs-rulesheet"
      aria-label="Private mandate"
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
          onCount(ruleCount(body));
          setNote("Kept on this node only. Every offer in the mailbox is now matched against these rules.");
          setKept(true);
          requestAnimationFrame(() => replay(seal.current, "is-slam"));
        } catch (err) {
          setNote(say(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="cs-rs-h">
        <div>
          <b lang="ja">内規</b>
          <span>Private mandate · matched to every offer</span>
        </div>
        <span className="cs-rs-lock">
          <LockGlyph />
          Stays on this node
        </span>
      </div>
      {line("一", "r-face", "Largest invoice", <input id="r-face" inputMode="decimal" placeholder="no limit" autoComplete="off" ref={face} />, "ZEC")}
      {line("二", "r-tenor", "Longest tenor", <input id="r-tenor" inputMode="numeric" placeholder="no limit" autoComplete="off" ref={tenor} />, "days")}
      {line("三", "r-disc", "Smallest discount", <input id="r-disc" inputMode="decimal" placeholder="none" autoComplete="off" ref={discount} />, "%")}
      {line("四", "r-hist", "Buyer history", <input id="r-hist" inputMode="numeric" placeholder="none" autoComplete="off" ref={history} />, "invoices")}
      <div className="cs-rline is-check">
        <i lang="ja">五</i>
        <label className="cs-check">
          <input type="checkbox" ref={kyc} />
          Buyer's identity must be in my KYC list
        </label>
      </div>
      {line("六", "r-ontime", "Paid on time, at least", <input id="r-ontime" inputMode="numeric" placeholder="80" autoComplete="off" ref={onTime} />, "%")}
      {line("七", "r-grace", "Grace after due date", <input id="r-grace" inputMode="numeric" placeholder="7" autoComplete="off" ref={grace} />, "days")}
      <div className="cs-rline is-wide">
        <i lang="ja">八</i>
        <label htmlFor="r-trust">Also trust repayments to these financiers</label>
        <textarea id="r-trust" rows={2} spellCheck="false" placeholder="financier keys, one per line" ref={trusted} />
        <small>Besides you and the financiers in the provider's directory.</small>
      </div>
      <div className="cs-rs-foot">
        {demo ? null : (
          <button className={`cs-btn${saving ? " is-busy" : ""}`} type="submit" disabled={saving}>
            Keep these rules on the node
          </button>
        )}
        <Status text={note} />
      </div>
      <span className="cs-rs-seal" lang="ja" aria-hidden="true" hidden={!kept} ref={seal}>
        保
      </span>
    </form>
  );
}

/** The public mandate (HNK-30.T19, D-47): what suppliers see of this financier in the directory.
 *  The node signs it and sends it to the node provider, who lists it; the detailed rules for
 *  offers stay private on the node (N-15). */
function Listing({ name, demo }: { name: string | null | undefined; demo: boolean }): ReactNode {
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
    <form
      className="cs-plate"
      aria-label="Public mandate"
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
      <div className="cs-plate-top">
        <i lang="ja">公</i>
        <div>
          <b>{name || "Your public mandate"}</b>
          <span>As the financier directory lists you</span>
        </div>
      </div>
      <p className="cs-hint">What suppliers see of you in the directory. Your detailed rules stay on this node.</p>
      <div className="cs-pf">
        <label className="cs-field">
          <span>Smallest invoice (ZEC)</span>
          <input className="is-mono" inputMode="decimal" placeholder="0.0001" ref={min} />
        </label>
        <label className="cs-field">
          <span>Largest invoice (ZEC)</span>
          <input className="is-mono" inputMode="decimal" placeholder="1" ref={max} />
        </label>
        <label className="cs-field">
          <span>Longest tenor (days)</span>
          <input className="is-mono" inputMode="numeric" placeholder="90" ref={tenor} />
        </label>
        <label className="cs-check">
          <input type="checkbox" ref={kyc} />
          Only buyers I know from KYC
        </label>
      </div>
      {demo ? null : (
        <div className="cs-actions">
          <button className={`cs-btn${sending ? " is-busy" : ""}`} type="submit" disabled={sending}>
            Send to the directory
          </button>
          {/* HNK-30.T21 (D-48): the provider attests this financier's record from the board; only
              coarse classes appear in the directory. */}
          <button
            className="cs-link"
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
        </div>
      )}
      <Status text={note} />
    </form>
  );
}

export function RulesSection({ name, mail, demo }: { name: string | null | undefined; mail: Mail[] | null; demo: boolean }): ReactNode {
  const [count, setCount] = useState<number | null>(null);
  const breaking = mail ? mail.filter((m) => m.offer?.ok && !m.offer.accepted && m.offer.mandate?.verdict === "breaks").length : null;
  return (
    <section className="cs-sec" id="rules" aria-labelledby="cs-rules-t">
      <div className="cs-cap">
        <p className="cs-eyebrow">
          <Stamp k="規" />
          Your mandate
        </p>
        <h2 id="cs-rules-t">Rules for offers</h2>
        <Lede className="cs-lede">The 内規 sheet is your private mandate. It never leaves this node: suppliers only learn which kind of rule an offer broke.</Lede>
        <p className="cs-note">The listing beside it is your public mandate: what suppliers see of you in the financier directory, signed by the node and listed by the node provider.</p>
        <dl className="cs-totals">
          <div>
            <dt>rules on the sheet</dt>
            <dd>{count ?? "…"}</dd>
          </div>
          <div>
            <dt>{breaking === 1 ? "waiting offer that breaks one" : "waiting offers that break one"}</dt>
            <dd>{breaking ?? "…"}</dd>
          </div>
        </dl>
      </div>
      <div className="cs-rule-desk">
        <RuleSheet demo={demo} onCount={setCount} />
        <Listing name={name} demo={demo} />
      </div>
    </section>
  );
}

/**
 * The fund ledger (HNK-30.T23, D-49), for a financier that runs a pooled fund: deposits seen in
 * the wallet become members' units, withdrawals wait for the period's end, and the close pays them
 * from cash with one passkey approval of the exact plan, then signs the new root into JTLR.
 */
export function FundSection({ info, demo }: { info: Info; demo: boolean }): ReactNode {
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
    <section className="cs-sec" id="fund" aria-labelledby="cs-fund-t">
      <div className="cs-cap">
        <p className="cs-eyebrow">
          <Stamp k="資" />
          For a pooled fund
        </p>
        <h2 id="cs-fund-t">Fund ledger</h2>
        <Lede className="cs-lede">Members hold units, priced from this wallet's cash and receivables at each close. Withdrawals wait for the period's end; the close pays them with one passkey approval of the exact plan.</Lede>
        {f ? (
          <dl className="cs-totals is-tight">
            <div>
              <dt>period</dt>
              <dd>{f.period}</dd>
            </div>
            <div>
              <dt>zat per unit</dt>
              <dd className="is-mono">{price(f.nav)}</dd>
            </div>
            <div>
              <dt>units out</dt>
              <dd>{f.total_units.toLocaleString("en")}</dd>
            </div>
            <div>
              <dt>{`holdings, from ${f.deposits} deposit${f.deposits === 1 ? "" : "s"}`}</dt>
              <dd>{f.leaves}</dd>
            </div>
          </dl>
        ) : null}
        {last ? (
          <p className="cs-note">
            {`Last close: period ${last.period} · `}
            <span className="is-mono" title={`root ${last.root}`}>
              {last.held ? "held, below par" : `${zec(last.paid_zat)} ZEC paid`}
            </span>
          </p>
        ) : null}
      </div>
      <div className="cs-ledger">
        <div className="cs-book">
          <div className="cs-book-h">
            <b lang="ja">出金待</b>
            <span>{f ? `Withdrawals waiting for period ${f.period}` : "Withdrawals waiting"}</span>
          </div>
          <ul className="cs-q">
            {f
              ? f.queue.length
                ? f.queue.map((r, i) => (
                    <li key={i}>
                      <b>{`${r.units.toLocaleString("en")} units`}</b>
                      <span className="is-mono">{`to ${short(r.address)}`}</span>
                    </li>
                  ))
                : [
                    <li className="is-empty" key="none">
                      No withdrawal waits for this period.
                    </li>,
                  ]
              : null}
          </ul>
          <div className="cs-plan">
            {demo ? null : (
              <div className="cs-actions">
                <button
                  className={`cs-btn-q${planning ? " is-busy" : ""}`}
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
              </div>
            )}
            {plan ? (
              <>
                <p className="cs-note">{`Period ${plan.plan.period} at ${price(plan.plan.nav)} zat per unit, valued on the fund's books: ${zec(plan.plan.cash_zat)} ZEC of the fund's cash${plan.plan.wallet_zat !== undefined ? ` (the node's wallet holds ${zec(plan.plan.wallet_zat)} ZEC)` : ""}. ${plan.plan.held ? "Below par: no withdrawal is paid this period." : plan.plan.short ? "Cash does not cover the queue: every request gets the same share, the rest waits." : ""}`}</p>
                {plan.plan.payouts.length ? (
                  <ul className="cs-q">
                    {plan.plan.payouts.map((x, i) => (
                      <li key={i}>
                        <b>{`${zec(x.amount_zat)} ZEC`}</b>
                        <span className="is-mono">{`for ${x.units.toLocaleString("en")} units · ${short(x.address)}`}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cs-note">Nothing to pay; the close signs the new root.</p>
                )}
                {demo ? null : (
                  <div className="cs-actions">
                    <button
                      className={`cs-btn${paying ? " is-busy" : ""}`}
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
                      <PasskeyGlyph />
                      {plan.plan.payouts.length ? `Approve with passkey: pay ${zec(plan.paid_zat)} ZEC and sign the root` : "Approve with passkey: sign the root"}
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <Status text={note} />
        </div>
        {demo ? null : (
          <div className="cs-panel">
            <div className="cs-panel-h">
              <h3>
                <b lang="ja">入金</b>Record a deposit
              </h3>
            </div>
            <form
              className="cs-two"
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
              <label className="cs-field">
                <span>Member's contact card</span>
                <input className="is-mono" placeholder="jitsuin-contact-v1:…" spellCheck="false" autoComplete="off" ref={member} />
              </label>
              <label className="cs-field">
                <span>Deposit transaction (mined, in this wallet)</span>
                <input className="is-mono" placeholder="transaction id" spellCheck="false" autoComplete="off" ref={txid} />
              </label>
              <div className="cs-actions">
                <button className={`cs-btn-q${recording ? " is-busy" : ""}`} type="submit" disabled={recording}>
                  Record the deposit
                </button>
              </div>
            </form>
            {/* HNK-30.T22: a fund card for a new member: a deposit address made for them, the fund's
                key and mailbox, so the member can pay in and the receipt comes back sealed to them */}
            <div className="cs-actions">
              <button
                className={`cs-btn-q${carding ? " is-busy" : ""}`}
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
            </div>
            {card ? (
              <div className="cs-fcard" key={card}>
                <div className="cs-fcard-top">
                  <div>
                    <b>Fund card</b>
                    <p className="cs-hint">Give this card to the member over a private channel. Its deposit address is new and used for this member only.</p>
                  </div>
                  <i lang="ja">資</i>
                </div>
                <p className="cs-code" ref={cardText}>
                  {card}
                </p>
                <div className="cs-actions">
                  <CopyButton key={card} label="Copy" value={card} onFail={() => cardText.current && getSelection()?.selectAllChildren(cardText.current)} />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** A value on the meishi with its copy button; the whole value is selected when the clipboard refuses. */
function MeishiItem({ label, hint, value }: { label: string; hint: string; value: string }): ReactNode {
  const text = useRef<HTMLParagraphElement>(null);
  return (
    <div className="cs-mi">
      <p>
        <strong>{label}</strong>
        {` ${hint}`}
      </p>
      <div className="cs-mi-row">
        <p className="cs-code" ref={text} title={value}>
          {value}
        </p>
        <CopyButton label="Copy" value={value} onFail={() => text.current && getSelection()?.selectAllChildren(text.current)} />
      </div>
    </div>
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
    <div className="cs-panel">
      <div className="cs-panel-h">
        <h3>
          <b lang="ja">鍵</b>Devices
        </h3>
        {demo ? null : (
          <Act
            className="cs-link"
            label="Add a device"
            run={async () => {
              const r = await post<{ link: string }>("/node/console/devices/code");
              setInvite(r.link);
            }}
            fail={(e) => setNote(say(e))}
          />
        )}
      </div>
      <ul className="cs-rows">
        {list.map((d) => {
          const what = d.current ? "This device" : d.usable ? "Passkey" : "Old passkey";
          const line = d.usable ? `paired ${day(d.paired_at)}${d.last_used ? ` · last used ${day(d.last_used)}` : " · not used yet"}` : `paired ${day(d.paired_at)} on another address; it cannot sign in here`;
          return (
            <li key={d.id} className={d.usable ? undefined : "is-old"}>
              <span className={`cs-badge${d.usable ? " is-key" : ""}`} lang="ja" aria-hidden="true">
                鍵
              </span>
              <strong>{what}</strong>
              <span className="cs-l">
                {`${line} · `}
                <span className="is-mono">{`${d.id.slice(0, 8)}…`}</span>
              </span>
              {!d.current && !demo ? (
                <Act
                  className="cs-link cs-row-act"
                  label="Remove"
                  run={async () => {
                    await del(`/node/console/devices/${encodeURIComponent(d.id)}`);
                    setNote("Passkey removed.");
                    await load();
                  }}
                  fail={(e) => setNote(say(e))}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {invite !== null ? (
        <div className="cs-invite">
          <p className="cs-note">Open this link on the new device within 15 minutes. It works once.</p>
          <p className="cs-code" ref={link}>
            {invite}
          </p>
          <div className="cs-actions">
            <CopyButton key={invite} label="Copy link" value={invite} onFail={() => link.current && getSelection()?.selectAllChildren(link.current)} />
          </div>
        </div>
      ) : null}
      <Status text={note} />
    </div>
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
    <div className="cs-panel">
      <div className="cs-panel-h">
        <h3>
          <b lang="ja">名簿</b>Buyers (KYC)
        </h3>
      </div>
      <ul className="cs-rows">
        {list.map((b) => (
          <li key={b.identity_pk}>
            <span className="cs-badge" lang="ja" aria-hidden="true">
              買
            </span>
            <strong>{b.label}</strong>
            <span className="cs-l">
              {`added ${day(b.added_at)} · `}
              <span className="is-mono">{short(b.identity_pk)}</span>
            </span>
            {!demo ? (
              <Act
                className="cs-link cs-row-act"
                label="Remove"
                run={async () => {
                  await del(`/node/console/buyers/${encodeURIComponent(b.identity_pk)}`);
                  setNote("Buyer removed.");
                  await load();
                }}
                fail={(e) => setNote(say(e))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {!demo ? (
        <form
          className="cs-two"
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
          <label className="cs-field">
            <span>Identity key</span>
            <input className="is-mono" maxLength={64} placeholder="64 hex characters" autoComplete="off" spellCheck="false" ref={key} />
            <small>From the buyer, after your KYC.</small>
          </label>
          <label className="cs-field">
            <span>Name or KYC reference</span>
            <input maxLength={80} placeholder="e.g. PT Sakura Niaga, KYC-0042" autoComplete="off" ref={label} />
            <small>Stays on your node.</small>
          </label>
          <div className="cs-actions">
            <button className="cs-btn-q" type="submit">
              Add buyer
            </button>
          </div>
        </form>
      ) : null}
      <Status text={note} />
    </div>
  );
}

/** The financier's own display name: shown only here and at sign in on this browser. */
function NameForm({ current, onSaved }: { current: string | null | undefined; onSaved: (name: string) => void }): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  return (
    <form
      className="cs-panel cs-name-form"
      aria-label="Profile"
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
      <label className="cs-field">
        <span>Your name</span>
        <input maxLength={60} placeholder="e.g. Kurogane Capital" autoComplete="organization" defaultValue={current ?? ""} ref={input} />
        <small>Shown only in your own console.</small>
      </label>
      <div className="cs-actions">
        <button className="cs-btn-q" type="submit">
          Save
        </button>
        <Status text={note} />
      </div>
    </form>
  );
}

export function KeysSection({ info, name, demo, onName }: { info: Info; name: string | null | undefined; demo: boolean; onName: (n: string) => void }): ReactNode {
  return (
    <section className="cs-sec" id="keys" aria-labelledby="cs-keys-t">
      <div className="cs-cap">
        <p className="cs-eyebrow">
          <Stamp k="鍵" />
          Who may act for this node
        </p>
        <h2 id="cs-keys-t">Keys and cards</h2>
        <Lede className="cs-lede">Your passkeys sign you in and approve every payment. The meishi is what a supplier needs to send you an offer; the KYC index is the buyers you know.</Lede>
        {demo ? null : <NameForm current={name} onSaved={onName} />}
      </div>
      <div className="cs-keys">
        <div className="cs-meishi">
          <div className="cs-meishi-h">
            <div>
              <b>{name || "Financier node"}</b>
              <span>For suppliers: offer an invoice to this node</span>
            </div>
            <i lang="ja">証</i>
          </div>
          <MeishiItem label="Contact card." hint="Suppliers send their offers sealed to this mailbox." value={info.contact} />
          <MeishiItem label="Financier key." hint="The supplier's app checks it against the card's fingerprint." value={info.financier_pk} />
        </div>
        <Devices demo={demo} />
        <Buyers demo={demo} />
      </div>
    </section>
  );
}
