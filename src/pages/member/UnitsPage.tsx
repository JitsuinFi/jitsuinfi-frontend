// Units (HNK-22.T2, BL-D21-06, HNK-30.T22–T23, D-49; IA port part 2, 2026-10-26, approved
// prototype ia-member-units): one deposit slip (受領書) per holding on the tray, stamped 認 when its
// path holds against the period's root, 偽 when it does not, 待 before the first close; a slip
// saves its path for `jitsuin fund` and turns into a withdrawal request (払戻請求) in place. The
// caption holds your units and what was paid out. Below, how you pay in: the fund card and the
// deposit slip (入金票) with its QR (on a phone folded under its own line, one primary at a time).
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { useKept, useKeptState } from "../../app/kept";
import { LongList } from "../../app/LongList";
import { DidLine, useDid } from "../../app/outcome";
import { Banner, Button, TrustedSvg, useOut } from "../../app/ui";
import { myIdentity, relayDeps } from "../../lib/app-relay";
import { wasm, zecToZat } from "../../lib/core";
import { download } from "../../lib/download";
import { decodeFundCard } from "../../lib/fund-card";
import { latestPortfolio, openPeriod, valueOf, withdrawBody, type Holding, type Wallet } from "../../lib/fund";
import { NET } from "../../lib/network";
import { readablePrint } from "../../lib/print";
import { draft, send } from "../../lib/relay";
import { encodeMessage, type Header } from "../../lib/relay-message";
import { load, save, units, useWallet, zec } from "./data";
import { MemberTag, useVars } from "./parts";
import "../role-paper.css";
import "../member.css";

/** A withdrawal request 払戻請求, written on the slip it empties. */
function Request({ x, out }: { x: Holding; out: ReturnType<typeof useOut> }): ReactNode {
  const amount = useRef<HTMLInputElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const period = openPeriod(x);
      const u = amount.current!.value.trim().toLowerCase() === "all" ? "all" : Number(amount.current!.value.trim());
      const body = withdrawBody(x, u, address.current!.value, period);
      const hd = draft("fund.withdraw", { role: "member", mailbox_pk: myIdentity().mailbox_pk }, x.fund_mailbox, relayDeps, { body }) as Header;
      await send(x.fund_mailbox, await encodeMessage(hd), relayDeps);
      const w = await load();
      await save({ ...w, holdings: w.holdings.map((y) => (y.leaf_id === x.leaf_id ? { ...y, pending: { units: u, period, sent_at: Date.now() } } : y)) });
    } catch (err) {
      setBusy(false);
      out.error(err);
    }
  };
  return (
    <form className="fm-req" onSubmit={(e) => void submit(e)}>
      <b lang="ja">払戻請求</b>
      <label className="field">
        <span>Units</span>
        <input type="text" inputMode="numeric" enterKeyHint="next" defaultValue="all" aria-label="Units to withdraw, or all" ref={amount} />
      </label>
      <label className="field">
        <span>Pay to</span>
        <input type="text" spellCheck="false" autoCapitalize="none" autoCorrect="off" autoComplete="off" enterKeyHint="send" placeholder={NET.addressHint} aria-label="A new shielded address to be paid at" ref={address} />
      </label>
      <small>Paid from the fund's cash at the end of the period, at that period's price. A fresh address keeps your payments apart.</small>
      <div className="actions rp-small">
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send the request"}
        </button>
      </div>
    </form>
  );
}

/** One deposit slip 受領書 on the tray. */
function Slip({ x, i }: { x: Holding; i: number }): ReactNode {
  const out = useOut();
  const [asking, setAsking] = useState(false);
  const stamp = !x.path ? ["待", "wait", "Waiting for the first close of the period"] : x.path.ok ? ["認", "ok", `Your units are in the period ${x.path.period} root`] : ["偽", "bad", `The period ${x.path.period} path does not hold: tell the auditor`];
  // HNK-29.T2: the same path, checked against the root on chain with the fund's viewing key
  const body = x.path?.body;
  const tilt = ["-1.2deg", ".8deg", "-.4deg", ".5deg"][i % 4];
  return (
    <article className="fm-doc" data-stamp={stamp[1]} data-v={`--r:${tilt};--d:${i === 0 ? 0 : 100 + (i - 1) * 67}ms`}>
      <header>
        <b lang="ja">受領書</b>
        <small>{x.deposit_txid ? `Deposit ${readablePrint(x.deposit_txid)}` : "Units left after a payout"}</small>
      </header>
      <span className="fm-doc-stamp" lang="ja" role="img" aria-label={stamp[2]}>
        {stamp[0]}
      </span>
      <p className="fm-doc-units">
        {units(x.units)}
        <small>units</small>
      </p>
      <p className="fm-doc-value">{`≈ ${zec(valueOf(x.units, x.nav))}`}</p>
      <p className="fm-doc-stamp-t">{`${stamp[2]}.`}</p>
      {x.pending ? <p className="fm-doc-note">{`Withdrawal of ${x.pending.units === "all" ? "all units" : `${units(x.pending.units)} units`} asked for period ${x.pending.period}: paid at the end of that period.`}</p> : null}
      {out.el}
      <div className="actions rp-small">
        {body ? (
          <button type="button" className="secondary" onClick={() => download(`fund-path-period-${x.path!.period}.json`, JSON.stringify(body, null, 2))}>
            Save the path for jitsuin fund
          </button>
        ) : null}
        {!x.pending && !asking ? (
          <button type="button" className="secondary" onClick={() => setAsking(true)}>
            Ask to withdraw
          </button>
        ) : null}
      </div>
      {!x.pending && asking ? <Request x={x} out={out} /> : null}
    </article>
  );
}

/**
 * HNK-30.T22: how a member pays in. The manager hands a fund card with a deposit address made for
 * this member; the member pays it from any shielded wallet (the QR is a plain ZIP-321 request),
 * then gives the manager the transaction id and their contact card for the receipt.
 * A phone draws it in a fold and a desktop in an open section (two trees): what is written in it
 * and the QR it made are kept above that switch (app/kept.ts, DS-MOB L5), so a resize keeps them.
 */
function Deposit({ w }: { w: Wallet | null }): ReactNode {
  const code = useRef<HTMLTextAreaElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const out = useOut();
  const kd = useKept("member/units/deposit");
  const [req, setReq] = useKeptState<{ uri: string; svg: string } | null>("member/units/deposit", "qr", null);
  const fund = w?.fund;
  return (
    <div className="rp-vis fm-dep">
      <div className="rp-panel">
        <label className="field">
          <span>Fund card from the manager</span>
          <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" placeholder="jitsuin-fund-v1:…" ref={code} {...kd.field("card")} />
        </label>
        <label className="field">
          <span>Amount to deposit (ZEC)</span>
          <input type="text" inputMode="decimal" enterKeyHint="done" placeholder="0.01" spellCheck="false" autoComplete="off" ref={amount} {...kd.field("amount")} />
        </label>
        <div className="actions">
          <Button
            secondary
            onClick={async () => {
              try {
                const f = decodeFundCard(code.current!.value.trim());
                const wl = await load();
                await save({ ...wl, fund: f });
                code.current!.value = "";
                kd.set("card", undefined);
                setReq(null);
                out.show(<Banner kind="ok" title="Fund card kept" text="Its deposit address and fund key are on the slip." />);
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Keep the fund card
          </Button>
          <Button
            onClick={async () => {
              try {
                const wl = await load();
                if (!wl.fund) throw new Error("keep the fund card first");
                const zat = zecToZat(amount.current!.value.trim());
                const r = JSON.parse(wasm.paymentRequest(wl.fund.deposit_address, BigInt(zat))) as { uri: string; qr_svg: string };
                code.current!.value = "";
                kd.set("card", undefined);
                setReq({ uri: r.uri, svg: r.qr_svg });
                out.clear();
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Show the deposit QR
          </Button>
        </div>
        {out.el}
      </div>
      <article className="fm-dslip" aria-label="Deposit slip">
        <header>
          <b lang="ja">入金票</b>
          <small>Deposit slip · made for you by the fund</small>
        </header>
        <dl>
          <div>
            <dt>Deposit address (made for you)</dt>
            <dd>{fund ? <span className="mono">{fund.deposit_address}</span> : <span className="fm-quiet">Keep the fund card to fill this slip.</span>}</dd>
          </div>
          <div>
            <dt>Fund key (signs your receipts)</dt>
            <dd>{fund ? <span className="fm-fp is-sub">{readablePrint(fund.fund_pk)}</span> : <span className="fm-quiet">—</span>}</dd>
          </div>
        </dl>
        {req ? <TrustedSvg svg={req.svg} /> : <div className="fm-qr-veil">The QR shows once you enter an amount and press Show the deposit QR.</div>}
        {req ? <p className="mono fm-uri">{req.uri}</p> : null}
      </article>
    </div>
  );
}

export function UnitsPage(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const { w, failed } = useWallet();
  const shown = useDid("/member/units");
  useVars(root);
  const holdings = w?.holdings ?? [];
  const mine = holdings.reduce((n, x) => n + x.units, 0);
  const lp = w ? latestPortfolio(w) : null;
  const under = lp ? holdings.filter((x) => x.path?.period === lp.period && x.path.ok).reduce((n, x) => n + x.units, 0) : 0;
  const payouts = w ? [...w.payouts].reverse() : [];
  // DS-MOB L5: the phone's fold opens on what was already written into the deposit (on either layout)
  const dep = useKept("member/units/deposit");
  const [fold, setFold] = useState(() => dep.get<boolean>("open") ?? !!(dep.get("card") || dep.get("amount") || dep.get("qr")));

  const depositHead = (
    <div className="rp-cap">
      <div className="rp-h">
        <span className="rp-stamp" lang="ja" aria-hidden="true">
          入
        </span>
        <h2 id="fm-td">Pay into the fund</h2>
      </div>
      <p className="hint">
        Paste the fund card the manager gave you, then pay its address from a shielded wallet. Send the manager the transaction id and <Link className="ia-inlink" to="/member/contacts">your contact card</Link>: the receipt with your withdraw token comes back to your inbox.
      </p>
    </div>
  );

  return (
    <Page wide>
      <div className="rp fm" ref={root}>
        <section className="rp-sec" aria-labelledby="fm-tu">
          <div className="rp-cap">
            <MemberTag k="受" section="Units" />
            <h1 id="fm-tu">Your units</h1>
            <div className="fm-share">
              <small>Your units</small>
              <strong>
                {w ? units(mine) : "–"}
                <small>units</small>
              </strong>
              <span>{failed ? "Your units could not be read." : lp ? `${units(under)} under the period ${lp.period} root` : holdings.length ? "waiting for the first close" : "No units yet"}</span>
            </div>
            <details className="fm-disc fm-how" open={!phone}>
              <summary>
                <span className="rp-stamp" lang="ja" aria-hidden="true">
                  認
                </span>
                <h3>What the slips and stamps mean</h3>
              </summary>
              <p className="hint">
                One deposit slip <span lang="ja">受領書</span> per holding, signed by the fund. Its withdraw token is the only thing that opens those units, so it stays on this device only. Each close, the fund sends a path: <span lang="ja">認</span> when it holds against the period's root, <span lang="ja">偽</span> when it does not, <span lang="ja">待</span> before the first close.
              </p>
            </details>
            <h3>Paid out</h3>
            {payouts.length ? (
              <LongList
                items={payouts}
                keyOf={(p) => `${p.txid}-${p.units}`}
                stage={() => "done"}
                words={(p) => `period ${p.period} ${zec(p.amount_zat)} ${units(p.units)} units`}
                labels={{ move: "", wait: "", done: "Paid out" }}
                limit={6}
                searchLabel="Search payouts by period"
                className="fm-paid"
                render={(p) => (
                  <span className="fm-paid-l">
                    <span className="rp-hanko is-ok" lang="ja" aria-hidden="true">
                      済
                    </span>
                    <span>
                      {`Period ${p.period}: ${zec(p.amount_zat)} paid for ${units(p.units)} units · `}
                      <span className="mono">{readablePrint(p.txid)}</span>
                    </span>
                  </span>
                )}
              />
            ) : (
              <p className="hint">No payout yet.</p>
            )}
          </div>
          <div className="rp-vis">
            {shown ? <DidLine did={shown} /> : null}
            <div className="fm-tray" role="status" aria-live="polite">
              {failed ? (
                <Banner kind="bad" title="Your units could not be read" text={failed} />
              ) : !w ? null : !holdings.length ? (
                <p className="rp-empty">
                  {/* a phone: the first screen says what to do; where the receipt goes is in the deposit below (DS-MOB P4) */}
                  Give the fund manager <Link className="ia-inlink" to="/member/contacts">your contact card</Link>
                  {phone ? ", then deposit below: the receipt becomes a slip here." : ", then deposit below. Their receipt lands in your inbox and becomes a slip here."}
                </p>
              ) : (
                holdings.map((x, i) => <Slip key={`${x.leaf_id}-${x.pending ? "p" : ""}-${x.path?.period ?? ""}`} x={x} i={i} />)
              )}
            </div>
          </div>
        </section>

        {phone ? (
          <details
            className="rp-sec fm-dep-fold"
            open={fold}
            onToggle={(e) => {
              const open = e.currentTarget.open;
              dep.set("open", open);
              setFold(open);
            }}
          >
            <summary>
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                入
              </span>
              <span>
                <b>Pay into the fund</b>
                <small>the fund card and the deposit slip 入金票</small>
              </span>
            </summary>
            {depositHead}
            <Deposit w={w} />
          </details>
        ) : (
          <section className="rp-sec" aria-labelledby="fm-td">
            {depositHead}
            <Deposit w={w} />
          </section>
        )}
      </div>
    </Page>
  );
}
