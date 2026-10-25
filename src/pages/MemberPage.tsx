// Fund member screen (HNK-22.T2, BL-D21-06, HNK-30.T22–T23, D-49): a member holds no signing key,
// only an inbox key, so this screen never asks for a stamp. The fund's receipts, Merkle paths and
// payouts arrive in the inbox; the units they name are kept in this device's encrypted store,
// because each receipt's withdraw token is the only thing that opens those units.
//
// Laid out since HNK-34.T5 from the approved sample (design-samples/internal/member.html): the
// fund as a section through its shielded pool, the levels drawn to scale from the newest path's
// portfolio (cash on top, the advances out by due bucket, the overdue as silt, repayments as
// ripples) and the owed-to-members line from the solvency report, with the member's share on it.
// One deposit slip (受領書) per holding, stamped 認 when its path holds against the period's root,
// 偽 when it does not, 待 before the first close; a slip turns into a withdrawal request (払戻請求)
// in place. The report reads as a statement (支払能力報告), the deposit as a slip (入金票).
// The member's units are one figure everywhere: the sum of the holdings on this device.
// React since HNK-31.T10.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Page } from "../app/AppShell";
import { Banner, Button, TrustedSvg, useOut } from "../app/ui";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { wasm, zecToZat } from "../lib/core";
import { download } from "../lib/download";
import { addPath, addPayout, addReceipt, EMPTY, latestPortfolio, openPeriod, valueOf, withdrawBody, type Holding, type Portfolio, type Wallet } from "../lib/fund";
import { decodeFundCard } from "../lib/fund-card";
import { poolLevels } from "../lib/fund-pool";
import { readFundReport, type ReportReading } from "../lib/fund-report";
import { NET } from "../lib/network";
import { draft, send } from "../lib/relay";
import { encodeMessage, type Header } from "../lib/relay-message";
import { MailboxCard, type InboxAction } from "./MailboxCard";
import "./role-paper.css";
import "./member.css";

const KEY = "fund:wallet";
const zec = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;
const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-4)}`;
const units = (n: number) => n.toLocaleString("en");

async function load(): Promise<Wallet> {
  return (await account.current?.store?.get<Wallet>(KEY)) ?? EMPTY;
}

async function save(w: Wallet): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("this device cannot keep your units: sign in again");
  await store.put(KEY, w);
}

/** CSS custom properties through the CSSOM (CSP-safe): `data-v="--name:value;…"` on any element under `root`. */
function useVars(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement | SVGElement>("[data-v]").forEach((el) => {
      for (const pair of el.dataset.v!.split(";")) {
        const at = pair.indexOf(":");
        if (at > 0) el.style.setProperty(pair.slice(0, at), pair.slice(at + 1));
      }
    });
  });
}

/** A withdrawal request 払戻請求, written on the slip it empties. */
function Request({ x, done, out }: { x: Holding; done: () => Promise<void>; out: ReturnType<typeof useOut> }): ReactNode {
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
      await done();
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
        <input type="text" inputMode="numeric" defaultValue="all" aria-label="Units to withdraw, or all" ref={amount} />
      </label>
      <label className="field">
        <span>Pay to</span>
        <input type="text" spellCheck="false" autoComplete="off" placeholder={NET.addressHint} aria-label="A new shielded address to be paid at" ref={address} />
      </label>
      <small>Paid from the fund's cash at the end of the period, at that period's price. A fresh address keeps your payments apart.</small>
      <div className="actions rp-small">
        <button type="submit" disabled={busy}>
          Send the request
        </button>
      </div>
    </form>
  );
}

/** One deposit slip 受領書 on the tray. */
function Slip({ x, i, done }: { x: Holding; i: number; done: () => Promise<void> }): ReactNode {
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
        <small>
          {x.deposit_txid ? (
            <>
              {"Deposit "}
              <span className="mono">{short(x.deposit_txid)}</span>
            </>
          ) : (
            "Units left after a payout"
          )}
        </small>
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
          <button type="button" onClick={() => setAsking(true)}>
            Ask to withdraw
          </button>
        ) : null}
      </div>
      {!x.pending && asking ? <Request x={x} done={done} out={out} /> : null}
    </article>
  );
}

/** A file field as a pill (the chosen file's name, and Choose). */
function FilePill({ label, empty, inputRef }: { label: string; empty: string; inputRef: RefObject<HTMLInputElement | null> }): ReactNode {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className="rp-file">
      <input type="file" aria-label={label} ref={inputRef} onChange={(e) => setName(e.currentTarget.files?.[0]?.name ?? null)} />
      <span>{name ?? empty}</span>
      <b aria-hidden="true">Choose</b>
    </label>
  );
}

// ---------- the basin: a section through the fund's shielded pool ----------
const W = 680;
const TOP = 64;
const FLOOR = 384;
const X0T = 40;
const X1T = 560;
const X0B = 112;
const X1B = 488;
const xl = (y: number) => X0T + ((X0B - X0T) * (y - TOP)) / (FLOOR - TOP);
const xr = (y: number) => X1T + ((X1B - X1T) * (y - TOP)) / (FLOOR - TOP);
const band = (y0: number, y1: number) => `${xl(y1)},${y1} ${xr(y1)},${y1} ${xr(y0)},${y0} ${xl(y0)},${y0}`;
const BUCKET = ["≤ 30 days", "31–90 days", "later"];

function Basin({ p, period, owed, assets, mine, under, empty }: { p: Portfolio | null; period: number | null; owed: number | null; assets: number | null; mine: number; under: number; empty: string }): ReactNode {
  const svg = useRef<SVGSVGElement>(null);
  const L = p ? poolLevels({ cash_zat: p.cash_zat, open_zat: p.open_zat, overdue_zat: p.overdue_zat, owed_zat: owed, mine_units: under }, FLOOR - TOP) : null;
  const yO = FLOOR - (L?.overdue ?? 0);
  const yA = yO - (L?.open ?? 0);
  const yC = yA - (L?.cash ?? 0);
  // the pool fills again when its figures change
  const sig = p ? `${period}|${p.cash_zat}|${p.open_zat}|${p.overdue_zat}|${owed}` : "";
  useEffect(() => {
    const el = svg.current;
    if (!el || !sig) return;
    el.classList.remove("is-fill");
    void el.getBoundingClientRect();
    el.classList.add("is-fill");
  }, [sig]);

  let desc = "The fund's shielded pool in section. ";
  const right: Array<{ y: number; cls: string; lines: Array<[string, string]> }> = [];
  const parts: ReactNode[] = [];
  if (p && L && !L.empty) {
    desc += `Cash ${zec(p.cash_zat)} on top; ${p.open} advance${p.open === 1 ? "" : "s"} out, ${zec(p.open_zat)}, ${p.due_within[0]} due within 30 days, ${p.due_within[1]} within 31 to 90, ${p.due_within[2]} later; ${p.overdue} overdue, ${zec(p.overdue_zat)} after write-off; ${p.repaid} repaid.`;
    // the advances out, one block per due bucket, sized by count (the path carries counts only)
    const total = p.due_within[0] + p.due_within[1] + p.due_within[2];
    const L0 = xl(yO);
    const span = xr(yO) - L0;
    let at = 0;
    const blocks: ReactNode[] = [];
    if (L.open > 0 && total > 0) {
      p.due_within.forEach((c, i) => {
        if (!c) return;
        const xs = L0 + at;
        const w = (span * c) / total;
        if (at > 0) blocks.push(<line key={`d${i}`} x1={xs} x2={xs} y1={yA} y2={yO} className="fm-split" />);
        if (L.open >= 34 && w >= 96) {
          blocks.push(
            <text key={`t${i}`} className="t-mist opt" x={xs + 12} y={yA + 22}>
              {`${c} due ${BUCKET[i]}`}
            </text>,
          );
        }
        at += w;
      });
    }
    parts.push(
      <g clipPath="url(#fm-bc)" key="lv">
        {L.overdue > 0 ? <rect className="fm-lv d0" x="0" y={yO} width={W} height={FLOOR - yO} fill="url(#fm-silt)" /> : null}
        {L.open > 0 ? (
          <g className="fm-lv d1">
            <rect x="0" y={yA} width={W} height={yO - yA} className="fm-open" />
            {blocks}
          </g>
        ) : null}
        {L.cash > 0 ? (
          <g className="fm-lv d2">
            <rect x="0" y={yC} width={W} height={yA - yC} className="fm-cash" />
            <line x1="0" x2={W} y1={yC + 0.75} y2={yC + 0.75} className="fm-surface" />
          </g>
        ) : null}
      </g>,
    );
    if (L.cash >= 44) {
      parts.push(
        <g key="cash-t">
          <text className="t-mist" x={xl((yC + yA) / 2) + 28} y={(yC + yA) / 2 + 4}>
            Cash
          </text>
          <text className="t-num" x={xl((yC + yA) / 2) + 28} y={(yC + yA) / 2 + 24}>
            {zec(p.cash_zat)}
          </text>
          <text className="t-mist opt" x={xr((yC + yA) / 2) - 28} y={(yC + yA) / 2 + 4} textAnchor="end">
            pays withdrawals
          </text>
        </g>,
      );
    } else if (L.cash > 0) right.push({ y: yC + (yA - yC) / 2, cls: "t-ink", lines: [["t-ink", "cash"], ["t-head-mono", zec(p.cash_zat)]] });
    if (L.open >= 30) {
      parts.push(
        <text key="open-t" className="t-num" x={xl(yO) + 12} y={yO - 8}>
          {`${p.open} advance${p.open === 1 ? "" : "s"} out · ${zec(p.open_zat)}`}
        </text>,
      );
    } else if (L.open > 0) right.push({ y: yA + (yO - yA) / 2, cls: "t-ink", lines: [["t-ink", `${p.open} out`], ["t-head-mono", zec(p.open_zat)]] });
    if (L.overdue > 0) right.push({ y: yO + 4, cls: "t-ink", lines: [["t-ink", "overdue"], ["t-head-mono opt", `${p.overdue} · ${zec(p.overdue_zat)}`]] });
    if (p.repaid > 0) right.push({ y: yC, cls: "t-ink", lines: [["t-ink", `${p.repaid} repaid`], ["t-head-mono opt", "back as cash"]] });
    // the repayments came back as cash: settled ripples on the surface
    const rings = Math.min(p.repaid, 10);
    for (let i = 0; i < rings && L.cash > 0; i++) {
      parts.push(<ellipse key={`r${i}`} className={`fm-ring r${i}`} cx={330 + (i - rings / 2) * 34} cy={yC} rx={10 + (i % 2) * 4} ry="3.2" />);
    }
    if (L.owed !== null && owed !== null) {
      const yL = FLOOR - L.owed;
      const a = xl(yL) + 2;
      const b = xr(yL) - 2;
      const m = a + (b - a) * L.share;
      const over = yL < yC - 0.5;
      parts.push(
        <g className="fm-owe-g" key="owe">
          <line className={`fm-owe${over ? " is-over" : ""}`} x1={a} x2={b} y1={yL} y2={yL} />
          {L.share > 0 ? <line className="fm-mine" x1={a} x2={Math.max(a + 2, m)} y1={yL} y2={yL} /> : null}
          <text className="t-mist" x={a + 6} y={yL + 20}>
            {under === mine ? `your ${units(mine)} units` : `your ${units(mine)} units (${units(under)} under this root)`}
          </text>
        </g>,
      );
      right.push({ y: yL, cls: over ? "t-seal" : "t-head", lines: [[over ? "t-seal" : "t-head", "owed to"], [over ? "t-seal" : "t-head", "members"], ["t-head-mono", zec(owed)]] });
      desc += ` Owed to members at par: ${zec(owed)}, ${over ? "above" : "at or below"} the water line${assets !== null ? ` of ${zec(assets)}` : ""}.`;
    }
  } else {
    desc += p ? "The fund holds nothing in this period." : empty;
  }
  // labels on the ground beside the pool, kept apart
  right.sort((x, y) => x.y - y.y);
  let last = -Infinity;
  for (const r of right) {
    r.y = Math.max(r.y, last);
    last = r.y + r.lines.length * 19 + 10;
  }

  return (
    <svg className="fm-basin" viewBox={`0 0 ${W} 430`} role="img" aria-labelledby="fm-basin-d" ref={svg}>
      <desc id="fm-basin-d">{desc}</desc>
      <defs>
        <clipPath id="fm-bc">
          <polygon points={band(FLOOR, TOP)} />
        </clipPath>
        <pattern id="fm-earth" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" className="fm-earth" />
        </pattern>
        <pattern id="fm-silt" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          <rect width="6" height="6" className="fm-silt-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="fm-silt-fg" />
        </pattern>
      </defs>
      {/* the ground the pool is cut into (section hatching) */}
      <polygon points={`0,${TOP} ${X0T},${TOP} ${X0B},${FLOOR} ${X1B},${FLOOR} ${X1T},${TOP} ${W},${TOP} ${W},${FLOOR + 26} 0,${FLOOR + 26}`} fill="url(#fm-earth)" />
      <line x1="0" y1={TOP} x2={X0T} y2={TOP} className="fm-ground" />
      <line x1={X1T} y1={TOP} x2={W} y2={TOP} className="fm-ground" />
      {/* the pool itself: Cetacean, the only dark object on the page */}
      <polygon points={band(FLOOR, TOP)} className="fm-pool" />
      {parts}
      {right.map((r, i) => (
        <g key={`l${i}`}>
          <line x1={X1T - 6} x2={X1T + 14} y1={r.y} y2={r.y} className="fm-leader" />
          {r.lines.map(([cls, t], j) => (
            <text key={j} className={cls} x={X1T + 18} y={r.y + 4 + j * 17}>
              {t}
            </text>
          ))}
        </g>
      ))}
      {!p || !L || L.empty ? (
        <>
          <text className="t-mist" x={W / 2} y={(TOP + FLOOR) / 2 - 6} textAnchor="middle">
            {p ? "The fund holds nothing in this period" : empty}
          </text>
          <text className="t-num" x={W / 2} y={(TOP + FLOOR) / 2 + 18} textAnchor="middle">
            {p ? "no cash, no advances out" : "the fund's holdings show with the first path"}
          </text>
        </>
      ) : null}
      <line x1={X0B} y1={FLOOR} x2={X1B} y2={FLOOR} className="fm-ground" />
      <text className="t-ink opt" x={(X0T + X1T) / 2} y={FLOOR + 46} textAnchor="middle">
        a section through the fund's shielded pool · levels drawn to scale
      </text>
    </svg>
  );
}

export function MemberPage(): ReactNode {
  const s = account.current!;
  const root = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState("");
  const [reading, setReading] = useState<ReportReading | null>(null);
  const render = async () => setW(await load());
  useVars(root);
  useEffect(() => {
    void render().catch((e) => setFailed(e instanceof Error ? e.message : String(e)));
  }, []);

  const keep = (step: (w: Wallet, hd: Header) => Promise<Wallet>, done: string): InboxAction => ({
    label: "Keep it",
    run: async (r) => {
      await save(await step(await load(), r.message.header));
      await render();
      return done;
    },
  });

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
    ? ["wait", "待", "No report read yet", "Read the report from jitsuin fund below to draw what the fund owes."]
    : reading.problems.length
      ? ["bad", "偽", "This report does not answer for your units", "See the statement below."]
      : reading.solvent
        ? ["ok", "済", `Solvent in period ${v!.period}`, "Assets cover every unit under the root, at par."]
        : ["bad", "滞", `Not solvent in period ${v?.period ?? ""}`, "Assets are below what the fund owes at par. Withdrawals are paid from cash only."];

  const figs: Array<[string, string, string, ReactNode]> = lp
    ? [
        ["is-big", "Assets", "cash, open, overdue after write-off", v ? zec(v.assets_zat) : "—"],
        [reading && !reading.solvent && !reading.problems.length ? "is-bad" : "", "Owed to members", "root total, at par", v ? zec(v.liabilities_zat) : "read the report"],
        ["", "Cash", "pays withdrawals", zec(lp.p.cash_zat)],
        ["", "Advances out", `${lp.p.open} open · ${lp.p.due_within[0]} due ≤ 30 d, ${lp.p.due_within[1]} in 31–90 d, ${lp.p.due_within[2]} later`, zec(lp.p.open_zat)],
        ["", "Overdue", `${lp.p.overdue} invoice${lp.p.overdue === 1 ? "" : "s"}, after write-off`, zec(lp.p.overdue_zat)],
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
            <p className="rp-eyebrow">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                資
              </span>
              Fund member
            </p>
            <h1 id="fm-t">What the fund holds for you</h1>
            <p className="rp-lede">Your units, checked against the root the manager signs each period; withdraw at the period's price.</p>
            <dl className="fm-plate" aria-label="Your member card">
              <div>
                <dt lang="ja">会員証 · key</dt>
                <dd className="fm-fp">{s.fingerprint}</dd>
              </div>
              <div>
                <dt>Fund key</dt>
                <dd>{fundPk ? <span className="mono">{short(fundPk)}</span> : <span className="fm-quiet">from the fund card the manager gives you</span>}</dd>
              </div>
              <div>
                <dt>Last close</dt>
                <dd>{w ? lastClose : ""}</dd>
              </div>
            </dl>
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
          </div>

          <div className="rp-vis">
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
              <div>
                <div className={`fm-solv is-${solv[0]}`} role="status">
                  <span className="rp-hanko" lang="ja" aria-hidden="true">
                    {solv[1]}
                  </span>
                  <span>
                    <b>{solv[2]}</b>
                    <span>{solv[3]}</span>
                  </span>
                </div>
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
                overdue, after write-off
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

        {/* ============ 2. the tray: your slips ============ */}
        <section className="rp-sec" aria-labelledby="fm-tu">
          <div className="rp-cap">
            <div className="rp-h">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                受
              </span>
              <h2 id="fm-tu">Your units</h2>
            </div>
            <p className="hint">
              One deposit slip <span lang="ja">受領書</span> per holding, signed by the fund. Its withdraw token is the only thing that opens those units, so it stays on this device only. Each close, the fund sends a path: <span lang="ja">認</span> when it holds against the period's root, <span lang="ja">偽</span> when it does not, <span lang="ja">待</span> before the first close.
            </p>
            <h3>Paid out</h3>
            <ul className="fm-paid">
              {w && w.payouts.length ? (
                w.payouts
                  .slice(-6)
                  .reverse()
                  .map((p) => (
                    <li key={`${p.txid}-${p.units}`}>
                      <span className="rp-hanko is-ok" lang="ja" aria-hidden="true">
                        済
                      </span>
                      <span>
                        {`Period ${p.period}: ${zec(p.amount_zat)} paid · `}
                        <span className="mono">{short(p.txid)}</span>
                      </span>
                    </li>
                  ))
              ) : (
                <li>
                  <span />
                  <span className="hint">No payout yet.</span>
                </li>
              )}
            </ul>
          </div>
          <div className="rp-vis">
            <div className="fm-tray" role="status" aria-live="polite">
              {failed ? (
                <Banner kind="bad" title="Your units could not be read" text={failed} />
              ) : !w ? null : !holdings.length ? (
                <p className="rp-empty">Give the fund manager your contact card (below), then deposit. Their receipt lands in your inbox and becomes a slip here.</p>
              ) : (
                holdings.map((x, i) => <Slip key={`${x.leaf_id}-${x.pending ? "p" : ""}-${x.path?.period ?? ""}`} x={x} i={i} done={render} />)
              )}
            </div>
          </div>
        </section>

        {/* ============ 3. solvency ============ */}
        <Solvency reading={reading} setReading={setReading} mine={mine} />

        {/* ============ 4. deposit ============ */}
        <Deposit w={w} reload={render} />

        {/* ============ 5. mailbox ============ */}
        <div className="rp-mail">
          <div className="rp-list-h rp-mail-h">
            <h2>Inbox</h2>
            <span>opens on its own, then every minute while this screen is open</span>
          </div>
          <MailboxCard
            handlers={{
              "fund.receipt": keep(addReceipt, "Kept: the slip is on the tray. Its withdraw token stays on this device only."),
              "fund.merkle_path": keep(async (wl, hd) => (await addPath(wl, hd)).wallet, "Checked: the slip shows whether your units are under the root."),
              "fund.payout": keep(addPayout, "Recorded: the paid units are gone; what is left has a new token."),
            }}
          />
        </div>

        {/* ============ 6. limits and privacy ============ */}
        <section className="rp-sec fm-prose" aria-label="Limits and privacy">
          <article>
            <div className="rp-h">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                限
              </span>
              <h3>What this does not prove</h3>
            </div>
            <p>
              The path proves your units are counted in the root the fund sent you. That this root is the one the manager signed on chain (JTLR), and that the fund's assets cover it, you check with the fund's viewing key on your own device: save the path from a slip, run <span className="rp-cmd">{"jitsuin fund --path <file> --json"}</span>, never on a server, and read its report above. Units are paid from cash only: money lent out comes back when buyers repay. The receivables in that check are the manager's own notes: a bad one only shows once it is overdue.
            </p>
          </article>
          {/* HNK-29.T3 (BL-S05-01, BL-D0-06): what the fund's records leak, and how the key travels */}
          <article>
            <div className="rp-h">
              <span className="rp-stamp" lang="ja" aria-hidden="true">
                秘
              </span>
              <h3>What others can see</h3>
            </div>
            <p>
              Anyone holding the fund's viewing key (other members, the auditor) sees the amount of every deposit and payout, never who made it, and the shielded address each advance went to, never the supplier's name. Your path shows the units of a neighbouring part of the tree, so at least one other member's total. Take the viewing key from the manager only over a private channel, and give it only to <span className="rp-cmd">jitsuin fund</span> on your own device, never to a website.
            </p>
          </article>
        </section>
      </div>
    </Page>
  );
}

/**
 * HNK-32.T7 (BL-D29-07, D17): the solvency report from `jitsuin fund --json`, run on the member's own
 * machine with the fund's viewing key, read here next to the slips. The page checks that the report
 * is about the root of a path this device holds; the viewing key itself never comes near the page.
 */
function Solvency({ reading, setReading, mine }: { reading: ReportReading | null; setReading: (r: ReportReading | null) => void; mine: number }): ReactNode {
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
        <p className="hint">
          Run <span className="rp-cmd">{"jitsuin fund --ufvk <key> --manager-pk <key> --path <saved path> --json"}</span> on your own computer, then drop its report here. The viewing key stays in that command; this page only reads the result.
        </p>
        <div className="rp-panel">
          <div className="rp-fieldset">
            <span>Report from jitsuin fund (--json)</span>
            <FilePill label="Report from jitsuin fund (--json)" empty="no file chosen" inputRef={file} />
            <small>Read in your browser, never uploaded.</small>
          </div>
          <label className="field">
            <span>Or paste the report</span>
            <textarea spellCheck="false" placeholder='{"network": "testnet", "verdict": …}' ref={text} />
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
      </div>
      <div className="rp-vis">
        {!r ? (
          <p className="rp-empty">No report read yet. Its verdict, the fund's assets against what it owes, and whether your units are under the root show here as a statement.</p>
        ) : (
          <article className="fm-stmt" data-kind={kind} key={run}>
            <header>
              <div>
                <b lang="ja">支払能力報告</b>
                <small>{`Solvency report from jitsuin fund · ${r.report.network}${v ? ` · period ${v.period}` : ""}`}</small>
              </div>
            </header>
            <span className="fm-doc-stamp" lang="ja" aria-hidden="true">
              {glyph}
            </span>
            {v ? (
              <dl>
                <div className="is-sum">
                  <dt>Assets (cash, open receivables, overdue after write-off)</dt>
                  <dd>{zec(v.assets_zat)}</dd>
                </div>
                <div>
                  <dt>Owed to members (root total, at par)</dt>
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
                  <dt>Overdue, after write-off</dt>
                  <dd>{zec(v.overdue_zat)}</dd>
                </div>
                <div>
                  <dt>Your units</dt>
                  <dd>{inc ? `${inc.units === mine ? units(mine) : `${units(inc.units)} of your ${units(mine)}`} · ${inc.included ? "under the root" : "not under the root"}` : "not checked"}</dd>
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

/**
 * HNK-30.T22: how a member pays in. The manager hands a fund card with a deposit address made for
 * this member; the member pays it from any shielded wallet (the QR is a plain ZIP-321 request),
 * then gives the manager the transaction id and this screen's contact card for the receipt.
 */
function Deposit({ w, reload }: { w: Wallet | null; reload: () => Promise<void> }): ReactNode {
  const code = useRef<HTMLTextAreaElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const out = useOut();
  const [req, setReq] = useState<{ uri: string; svg: string } | null>(null);
  const fund = w?.fund;
  return (
    <section className="rp-sec" aria-labelledby="fm-td">
      <div className="rp-cap">
        <div className="rp-h">
          <span className="rp-stamp" lang="ja" aria-hidden="true">
            入
          </span>
          <h2 id="fm-td">Pay into the fund</h2>
        </div>
        <p className="hint">Paste the fund card the manager gave you, then pay its address from a shielded wallet. Send the manager the transaction id and your contact card below: the receipt with your withdraw token comes back to your inbox.</p>
      </div>
      <div className="rp-vis fm-dep">
        <div className="rp-panel">
          <label className="field">
            <span>Fund card from the manager</span>
            <textarea spellCheck="false" placeholder="jitsuin-fund-v1:…" ref={code} />
          </label>
          <label className="field">
            <span>Amount to deposit (ZEC)</span>
            <input type="text" inputMode="decimal" placeholder="0.01" spellCheck="false" autoComplete="off" ref={amount} />
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
                  setReq(null);
                  out.show(<Banner kind="ok" title="Fund card kept" text="Its deposit address and fund key are on the slip." />);
                  await reload();
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
              <dd>{fund ? <span className="mono">{fund.fund_pk}</span> : <span className="fm-quiet">—</span>}</dd>
            </div>
          </dl>
          {req ? <TrustedSvg svg={req.svg} /> : <div className="fm-qr-veil">The QR shows once you enter an amount and press Show the deposit QR.</div>}
          {req ? <p className="mono fm-uri">{req.uri}</p> : null}
        </article>
      </div>
    </section>
  );
}
