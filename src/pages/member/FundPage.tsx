// Fund (HNK-22.T2, HNK-30.T22, HNK-32.T7, HNK-29.T3; IA port part 2, 2026-10-26, approved
// prototype ia-member-fund): what the fund holds for you. The caption is your member card and your
// units (one figure everywhere: the sum of the holdings on this device); the visual is the fund as
// a section through its shielded pool with its figures and the solvency verdict. Below: the
// report of `jitsuin fund --json`, run on your own machine with the fund's viewing key, read here
// and laid out as a statement (支払能力報告); then what this does not prove and what others can
// see, as disclosures (DS-MOB P4). Slips, withdrawals and the deposit are under Units.
import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page, usePhone } from "../../app/AppShell";
import { DidLine, useDid } from "../../app/outcome";
import { Button, useOut } from "../../app/ui";
import { account } from "../../lib/app-session";
import { latestPortfolio, valueOf } from "../../lib/fund";
import { readFundReport, type ReportReading } from "../../lib/fund-report";
import { NET } from "../../lib/network";
import { readablePrint } from "../../lib/print";
import { Basin } from "./Basin";
import { load, setReading, units, useReading, useWallet, zec } from "./data";
import { FilePill, MemberTag, useVars } from "./parts";
import "../role-paper.css";
import "../member.css";

/**
 * HNK-32.T7 (BL-D29-07, D17): the solvency report from `jitsuin fund --json`, run on the member's own
 * machine with the fund's viewing key, read here. The page checks that the report is about the root
 * of a path this device holds; the viewing key itself never comes near the page.
 */
function Solvency({ reading, mine }: { reading: ReportReading | null; mine: number }): ReactNode {
  const file = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const out = useOut();
  const [run, setRun] = useState(0);
  const r = reading;
  const v = r?.report.verdict ?? null;
  const inc = r?.report.inclusion ?? null;
  const kind = !r ? "wait" : r.problems.length ? "bad" : r.solvent ? "ok" : "bad";
  const glyph = !r ? "待" : r.problems.length ? "偽" : r.solvent ? "済" : "滞";
  return (
    <section className="rp-sec" aria-labelledby="fm-ts">
      <div className="rp-cap">
        <div className="rp-h">
          <span className="rp-stamp" lang="ja" aria-hidden="true">
            算
          </span>
          <h2 id="fm-ts">Does the fund cover your units?</h2>
        </div>
        {/* audit 2026-10-27, finding 3: the ask in plain words first; the command is for whoever runs it */}
        <p className="hint">Ask your fund manager for this period's report, then choose the file. This page checks it against your units.</p>
        <div className="rp-panel">
          <div className="rp-fieldset">
            <span>This period's report</span>
            <FilePill label="This period's report" empty="no file chosen" inputRef={file} />
            <small>Read in your browser, never uploaded.</small>
          </div>
          <label className="field">
            <span>Or paste the report</span>
            <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" placeholder='{"network": "testnet", "verdict": …}' ref={text} />
          </label>
          <div className="actions">
            <Button
              onClick={async () => {
                try {
                  const raw = (await file.current!.files?.[0]?.text()) ?? text.current!.value;
                  if (!raw.trim()) throw new Error("choose the report file or paste it");
                  setReading(readFundReport(raw, await load(), NET.noun));
                  setRun((n) => n + 1);
                  out.clear();
                } catch (e) {
                  out.error(e);
                }
              }}
            >
              Read the report
            </Button>
          </div>
          {out.el}
        </div>
        <details className="fm-disc fm-tech">
          <summary>
            <span className="rp-stamp" lang="ja" aria-hidden="true">
              技
            </span>
            <h3>For technical members</h3>
          </summary>
          <p>
            You can make the report yourself. With the fund's viewing key from the manager and a path saved from a slip under Units, run <span className="rp-cmd">{"jitsuin fund --ufvk <key> --manager-pk <key> --path <saved path> --json"}</span> on your own computer and choose its output above. The viewing key stays in that command; this page only reads the result.
          </p>
        </details>
      </div>
      <div className="rp-vis">
        {!r ? (
          <p className="rp-empty">No report read yet. Once you choose it, the fund's assets against what it owes, and whether your units are counted, show here as a statement.</p>
        ) : (
          <article className="fm-stmt" data-kind={kind} key={run}>
            <header>
              <div>
                <b lang="ja">支払能力報告</b>
                <small>{`Solvency report · ${r.report.network}${v ? ` · period ${v.period}` : ""}`}</small>
              </div>
            </header>
            <span className="fm-doc-stamp" lang="ja" aria-hidden="true">
              {glyph}
            </span>
            {v ? (
              <dl>
                <div className="is-sum">
                  <dt>Assets (cash and open receivables; overdue counts 0 until repaid)</dt>
                  <dd>{zec(v.assets_zat)}</dd>
                </div>
                <div>
                  <dt>Owed to members (all members' units, at par)</dt>
                  <dd>{zec(v.liabilities_zat)}</dd>
                </div>
                <div>
                  <dt>Cash on the fund's books</dt>
                  <dd>{zec(r.report.cash_zat)}</dd>
                </div>
                {r.report.wallet_zat !== undefined ? (
                  <div>
                    <dt>{`The manager's wallet holds${v.wallet_covers === false ? ", less than that cash" : ""}`}</dt>
                    <dd>{zec(r.report.wallet_zat)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Open receivables</dt>
                  <dd>{zec(v.open_zat)}</dd>
                </div>
                <div>
                  <dt>Overdue, as counted (written off in full)</dt>
                  <dd>{zec(v.overdue_zat)}</dd>
                </div>
                <div>
                  <dt>Your units</dt>
                  <dd>{inc ? `${inc.units === mine ? units(mine) : `${units(inc.units)} of your ${units(mine)}`} · ${inc.included ? "counted" : "not counted"}` : "not checked"}</dd>
                </div>
              </dl>
            ) : null}
            {r.problems.length ? (
              <p className="rp-verdict is-bad is-land" role="alert">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  偽
                </span>
                <b>This report does not answer for your units</b>
                <span>{`${r.problems.join("; ")}.`.replace(/^./, (c) => c.toUpperCase())}</span>
              </p>
            ) : r.solvent ? (
              <p className="rp-verdict is-ok is-land" role="status">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  済
                </span>
                <b>{`Solvent in period ${v!.period}`}</b>
                <span>The fund's assets on its books cover every unit under the root your path ends in, at par, the manager's wallet holds at least the fund's cash, and your units are under it.</span>
              </p>
            ) : (
              <p className="rp-verdict is-bad is-land" role="alert">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  滞
                </span>
                <b>{`Not solvent in period ${v!.period}`}</b>
                <span>{v!.wallet_covers === false ? "The manager's wallet holds less than the fund's cash on its books." : "The fund's assets are below what it owes its members at par."} Withdraw requests are paid from cash only.</span>
              </p>
            )}
          </article>
        )}
      </div>
    </section>
  );
}

export function FundPage(): ReactNode {
  const s = account.current!;
  const root = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const { w, failed } = useWallet();
  const reading = useReading();
  const shown = useDid("/member/fund");
  useVars(root);

  // HNK-30.T22: what the fund holds, in aggregate, from the newest period's path
  const lp = w ? latestPortfolio(w) : null;
  const holdings = w?.holdings ?? [];
  // the member's units: one figure, the sum of the holdings on this device
  const mine = holdings.reduce((n, x) => n + x.units, 0);
  const held = holdings.reduce((n, x) => n + valueOf(x.units, x.nav), 0);
  const closed = lp ? holdings.filter((x) => x.path?.period === lp.period) : [];
  const under = closed.filter((x) => x.path?.ok).reduce((n, x) => n + x.units, 0);
  const fundPk = w?.fund?.fund_pk ?? holdings[0]?.fund_pk ?? null;
  const v = reading?.report.verdict ?? null;
  const fits = !!v && !!lp && v.period === lp.period;
  const nav = holdings.length ? holdings[holdings.length - 1].nav : null;

  const solv: [string, string, string, string] = !reading
    ? ["wait", "待", "No report read yet", "Choose this period's report from your fund manager below to see what the fund owes."]
    : reading.problems.length
      ? ["bad", "偽", "This report does not answer for your units", "See the statement below."]
      : reading.solvent
        ? ["ok", "済", `Solvent in period ${v!.period}`, "Assets cover every member's units, at par."]
        : ["bad", "滞", `Not solvent in period ${v?.period ?? ""}`, "Assets are below what the fund owes at par. Withdrawals are paid from cash only."];

  const figs: Array<[string, string, string, ReactNode]> = lp
    ? [
        ["is-big", "Assets", "cash and open advances; overdue counts 0", v ? zec(v.assets_zat) : "—"],
        [reading && !reading.solvent && !reading.problems.length ? "is-bad" : "", "Owed to members", "all members' units, at par", v ? zec(v.liabilities_zat) : "read the report"],
        ["", "Cash", "pays withdrawals", zec(lp.p.cash_zat)],
        ["", "Advances out", `${lp.p.open} open · ${lp.p.due_within[0]} due ≤ 30 d, ${lp.p.due_within[1]} in 31–90 d, ${lp.p.due_within[2]} later`, zec(lp.p.open_zat)],
        ["", "Overdue", `${lp.p.overdue} invoice${lp.p.overdue === 1 ? "" : "s"} unpaid, counted 0 until repaid`, zec(lp.p.overdue_face_zat ?? lp.p.overdue_zat)],
        ["", "Repaid", "advances that came back", String(lp.p.repaid)],
        ...(nav
          ? [
              [
                "",
                "Unit price",
                "the last price the fund showed you",
                <>
                  {(nav.assets_zat / Math.max(1, nav.units)).toFixed(4)}
                  <small>zat</small>
                </>,
              ] as [string, string, string, ReactNode],
            ]
          : []),
      ]
    : [];

  const lastClose = lp ? `Period ${lp.period} · ${closed.every((x) => x.path?.ok) ? "your path holds" : "a path does not hold"}` : holdings.length ? "Waiting for the first close" : "No units yet";

  return (
    <Page wide>
      <div className="rp fm" ref={root}>
        {/* ============ 1. what the fund holds | the pool in section ============ */}
        <section className="rp-sec" aria-labelledby="fm-t">
          <div className="rp-cap">
            <MemberTag />
            <h1 id="fm-t">What the fund holds for you</h1>
            <p className="rp-lede">Your units, checked against the list the manager signs each period; withdraw at the period's price.</p>
            <div className={`fm-solv is-${solv[0]} fm-solv-cap`} role="status">
              <span className="rp-hanko" lang="ja" aria-hidden="true">
                {solv[1]}
              </span>
              <span>
                <b>{solv[2]}</b>
                <span>{solv[3]}</span>
              </span>
            </div>
            <div className="fm-share">
              <small>Your units</small>
              <strong>
                {w ? units(mine) : "–"}
                <small>units</small>
              </strong>
              <span>
                {failed ? (
                  "Your units could not be read."
                ) : holdings.length ? (
                  <>
                    {"≈ "}
                    <b>{zec(held)}</b>
                    {" at the last price the fund showed you"}
                  </>
                ) : (
                  "No units yet"
                )}
              </span>
            </div>
            <dl className="fm-plate" aria-label="Your member card">
              <div>
                <dt lang="ja">会員証 · key</dt>
                <dd className="fm-fp">{s.fingerprint}</dd>
              </div>
              <div>
                <dt>Fund key</dt>
                <dd>{fundPk ? <span className="fm-fp is-sub">{readablePrint(fundPk)}</span> : <span className="fm-quiet">from the fund card the manager gives you</span>}</dd>
              </div>
              <div>
                <dt>Last close</dt>
                <dd>{w ? lastClose : ""}</dd>
              </div>
            </dl>
            {s.store?.persistent === false ? (
              <p className="fm-note is-bad">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  失
                </span>
                <span>
                  <b>This browser keeps nothing after you close it:</b> your withdraw tokens would be lost. Use a normal window.
                </span>
              </p>
            ) : (
              <p className="fm-note">
                <span className="rp-hanko" lang="ja" aria-hidden="true">
                  鍵
                </span>
                <span>An inbox key only. You never sign anything here.</span>
              </p>
            )}
            <p className="fm-note">
              <span className="rp-hanko" lang="ja" aria-hidden="true">
                受
              </span>
              <span>
                Your slips, withdrawals and deposits are under <Link className="ia-inlink" to="/member/units">Units</Link>.
              </span>
            </p>
          </div>

          <div className="rp-vis">
            {shown ? <DidLine did={shown} /> : null}
            <div className="fm-pool-h">
              <h2>{lp ? `The fund in period ${lp.period}` : "The fund's pool"}</h2>
              <p>{lp ? `From the newest path the fund sent you${reading ? ", and the report you read below" : ""}.${v && !fits ? ` The report is for period ${v.period}, so its debt is not drawn here.` : ""}` : "Drawn from the first path the fund sends you."}</p>
            </div>
            <div className="fm-pool-row">
              <Basin
                p={lp?.p ?? null}
                period={lp?.period ?? null}
                owed={fits ? v!.liabilities_zat : null}
                assets={fits ? v!.assets_zat : null}
                mine={mine}
                under={under}
                empty={failed ? "Your units could not be read" : holdings.length ? "Waiting for the first close of the period" : "No units yet"}
              />
              {figs.length ? (
                <dl className="fm-figs">
                  {figs.map(([c, a, b, val]) => (
                    <div className={c || undefined} key={a}>
                      <dt>
                        {a}
                        <small>{b}</small>
                      </dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            <ul className="fm-key" aria-label="Key">
              <li>
                <i className="k-cash" />
                cash: pays withdrawals
              </li>
              <li>
                <i className="k-open" />
                advances out, by due date
              </li>
              <li>
                <i className="k-over" />
                overdue: counted 0 until repaid
              </li>
              <li>
                <i className="k-owe" />
                owed to members at par
              </li>
              <li>
                <i className="k-mine" />
                your share of it
              </li>
            </ul>
          </div>
        </section>

        {/* ============ 2. solvency ============ */}
        <Solvency reading={reading} mine={mine} />

        {/* ============ 3. limits and privacy, as disclosures ============ */}
        <section className="rp-sec fm-prose" aria-label="Limits and privacy">
          <details className="fm-disc" open={!phone}>
            <summary>
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                限
              </span>
              <h3>What this does not prove</h3>
            </summary>
            <p>
              The path proves your units are counted in the root the fund sent you. That this root is the one the manager signed on chain (JTLR), and that the fund's assets cover it, you check with the fund's viewing key on your own device: save the path from a slip under Units, run <span className="rp-cmd">{"jitsuin fund --path <file> --json"}</span>, never on a server, and read its report above. Units are paid from cash only: money lent out comes back when buyers repay. The receivables in that check are the manager's own notes: a bad one only shows once it is overdue.
            </p>
          </details>
          {/* HNK-29.T3 (BL-S05-01, BL-D0-06): what the fund's records leak, and how the key travels */}
          <details className="fm-disc" open={!phone}>
            <summary>
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                秘
              </span>
              <h3>What others can see</h3>
            </summary>
            <p>
              Anyone holding the fund's viewing key (other members, the auditor) sees the amount of every deposit and payout, never who made it, and the shielded address each advance went to, never the supplier's name. Your path shows the units of a neighbouring part of the tree, so at least one other member's total. Take the viewing key from the manager only over a private channel, and give it only to <span className="rp-cmd">jitsuin fund</span> on your own device, never to a website.
            </p>
          </details>
        </section>
      </div>
    </Page>
  );
}
