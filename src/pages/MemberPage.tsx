// Fund member screen (HNK-22.T2, BL-D21-06, HNK-30.T22–T23, D-49): a member holds no signing key,
// only an inbox key, so this screen never asks for a stamp. The fund's receipts, Merkle paths and
// payouts arrive in the inbox; the units they name are kept in this device's encrypted store,
// because each receipt's withdraw token is the only thing that opens those units.
//
// The stage (HNK-30.T17, MASTER.md §8): the fund's vault in the registry room (hairline's vault
// door; circling the pointer turns its dial), with the member's key plate beside it and the
// receipt tray: one deposit slip (受領書) per holding, stamped 認 when its path holds against the
// period's root, 偽 when it does not, 待 before the first close. A slip turns into a withdrawal
// request (払戻請求) in place. React since HNK-31.T10.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { vault } from "@lucasmarkes/hairline";
import { Actions, Banner, Button, Card, DeskPage, Field, FileField, Kv, TrustedSvg, useOut } from "../app/ui";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { wasm, zecToZat } from "../lib/core";
import { addPath, addPayout, addReceipt, EMPTY, latestPortfolio, openPeriod, valueOf, withdrawBody, type Holding, type Wallet } from "../lib/fund";
import { decodeFundCard } from "../lib/fund-card";
import { readFundReport } from "../lib/fund-report";
import { NET } from "../lib/network";
import { draft, send } from "../lib/relay";
import { encodeMessage, type Header } from "../lib/relay-message";
import { download } from "../lib/download";
import { MailboxCard, type InboxAction } from "./MailboxCard";

const KEY = "fund:wallet";
const zec = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;
const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-4)}`;

async function load(): Promise<Wallet> {
  return (await account.current?.store?.get<Wallet>(KEY)) ?? EMPTY;
}

async function save(w: Wallet): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("this device cannot keep your units: sign in again");
  await store.put(KEY, w);
}

/** A withdrawal request 払戻請求, written on the slip it empties. */
function Request({ x, done, out }: { x: Holding; done: () => Promise<void>; out: ReturnType<typeof useOut> }): ReactNode {
  const units = useRef<HTMLInputElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const period = openPeriod(x);
      const u = units.current!.value.trim().toLowerCase() === "all" ? "all" : Number(units.current!.value.trim());
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
    <form className="mb-req" onSubmit={(e) => void submit(e)}>
      <p lang="ja" className="mb-req-k">
        払戻請求
      </p>
      <label>
        <span>Units</span>
        <input type="text" inputMode="numeric" defaultValue="all" aria-label="Units to withdraw, or all" ref={units} />
      </label>
      <label>
        <span>Pay to</span>
        <input type="text" spellCheck="false" autoComplete="off" placeholder="utest1…" aria-label="A new shielded address to be paid at" ref={address} />
      </label>
      <small>Paid from the fund's cash at the end of the period, at that period's price. A fresh address keeps your payments apart.</small>
      <button type="submit" disabled={busy}>
        Send the request
      </button>
    </form>
  );
}

/** One deposit slip 受領書 on the tray. */
function Slip({ x, done }: { x: Holding; done: () => Promise<void> }): ReactNode {
  const out = useOut();
  const [asking, setAsking] = useState(false);
  const stamp = !x.path ? ["待", "wait", "Waiting for the first close of the period"] : x.path.ok ? ["認", "ok", `Your units are in the period ${x.path.period} root`] : ["偽", "bad", `The period ${x.path.period} path does not hold: tell the auditor`];
  // HNK-29.T2: the same path, checked against the root on chain with the fund's viewing key
  const body = x.path?.body;
  return (
    <article className="mb-doc" data-stamp={stamp[1]}>
      <header>
        <b lang="ja">受領書</b>
        <small>{x.deposit_txid ? `Deposit ${short(x.deposit_txid)}` : "Units left after a payout"}</small>
      </header>
      <p className="mb-doc-units">
        {x.units.toLocaleString("en")}
        <small> units</small>
      </p>
      <p className="mb-doc-value">{`≈ ${zec(valueOf(x.units, x.nav))}`}</p>
      <span className="mb-doc-stamp" lang="ja" title={stamp[2]} aria-label={stamp[2]}>
        {stamp[0]}
      </span>
      {x.pending ? <p className="mb-doc-note">{`Withdrawal of ${x.pending.units === "all" ? "all units" : `${x.pending.units} units`} asked for period ${x.pending.period}: paid at the end of that period.`}</p> : null}
      {out.el}
      {body ? (
        <button type="button" className="mb-doc-save" onClick={() => download(`fund-path-period-${x.path!.period}.json`, JSON.stringify(body, null, 2))}>
          Save the path for jitsuin fund
        </button>
      ) : null}
      {!x.pending ? (
        asking ? (
          <Request x={x} done={done} out={out} />
        ) : (
          <button type="button" className="mb-doc-ask" onClick={() => setAsking(true)}>
            Ask to withdraw
          </button>
        )
      ) : null}
    </article>
  );
}

export function MemberPage(): ReactNode {
  const s = account.current!;
  const door = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState("");
  const render = async () => setW(await load());
  useEffect(() => {
    requestAnimationFrame(() => door.current && vault(door.current, { intensity: 0.6, play: true, label: "The fund's vault: what it holds for its members" }));
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
  const holds = lp
    ? `Period ${lp.period}: ${lp.p.open} open receivable${lp.p.open === 1 ? "" : "s"} (${zec(lp.p.open_zat)}), ${lp.p.overdue} overdue, ${lp.p.repaid} repaid; due within 30 days ${lp.p.due_within[0]}, 31 – 90 days ${lp.p.due_within[1]}, later ${lp.p.due_within[2]}; cash ${zec(lp.p.cash_zat)}.`
    : "";
  const held = w ? w.holdings.reduce((n, x) => n + valueOf(x.units, x.nav), 0) : 0;
  const stage = (
    <section className="ds mb" aria-label="The fund's vault">
      <div className="mb-plate">
        <p className="mb-plate-k" lang="ja">
          会員証
        </p>
        <p className="mb-plate-sub">Fund member · key fingerprint</p>
        <p className="mb-plate-v">{s.fingerprint}</p>
        <p className="mb-plate-sum">{w ? (w.holdings.length ? `${zec(held)} at the last price the fund showed you` : "No units yet") : ""}</p>
        <p className="mb-plate-note">{holds}</p>
        <p className="mb-plate-note">{s.store?.persistent === false ? "This browser keeps nothing after you close it: your withdraw tokens would be lost. Use a normal window." : "An inbox key only. You never sign anything here."}</p>
      </div>
      <div className="mb-room">
        <div className="mb-vault" ref={door} />
        <div className="mb-tray" role="status">
          <p>
            <b lang="ja">受領書</b>
            Your units
          </p>
          <div className="mb-slips" aria-live="polite">
            {failed ? (
              <Banner kind="bad" title="Your units could not be read" text={failed} />
            ) : !w ? null : !w.holdings.length ? (
              <span className="mb-slip is-empty">Give the fund manager your contact card (below), then deposit. Their receipt lands in your inbox and becomes a slip here.</span>
            ) : (
              <>
                {w.holdings.map((x) => (
                  <Slip key={`${x.leaf_id}-${x.pending ? "p" : ""}-${x.path?.period ?? ""}`} x={x} done={render} />
                ))}
                {w.payouts
                  .slice(-3)
                  .reverse()
                  .map((p) => (
                    <p className="mb-paid" key={p.txid}>
                      <b lang="ja">済</b>
                      {`Period ${p.period}: ${zec(p.amount_zat)} paid · ${short(p.txid)}`}
                    </p>
                  ))}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <DeskPage wrapped glyph="資" eyebrow="Fund member" title="What the fund holds for you" lede="Your units, checked against the root the manager signs each period; withdraw at the period's price." stage={stage}>
      <DepositCard />
      <MailboxCard
        handlers={{
          "fund.receipt": keep(addReceipt, "Kept: the slip is on the tray. Its withdraw token stays on this device only."),
          "fund.merkle_path": keep(async (wl, hd) => (await addPath(wl, hd)).wallet, "Checked: the slip shows whether your units are under the root."),
          "fund.payout": keep(addPayout, "Recorded: the paid units are gone; what is left has a new token."),
        }}
      />
      <SolvencyCard />
      <Card
        step="Limits"
        title="What this does not prove"
        hint="The path proves your units are counted in the root the fund sent you. That this root is the one the manager signed on chain (JTLR), and that the fund's assets cover it, you check with the fund's viewing key on your own device: save the path from a slip, run `jitsuin fund --path <file> --json`, never on a server, and read its report in Solvency above. Units are paid from cash only: money lent out comes back when buyers repay. The receivables in that check are the manager's own notes: a bad one only shows once it is overdue."
      />
      {/* HNK-29.T3 (BL-S05-01, BL-D0-06): what the fund's records leak, and how the key travels */}
      <Card
        step="Privacy"
        title="What others can see"
        hint="Anyone holding the fund's viewing key (other members, the auditor) sees the amount of every deposit and payout, never who made it, and the shielded address each advance went to, never the supplier's name. Your path shows the units of a neighbouring part of the tree, so at least one other member's total. Take the viewing key from the manager only over a private channel, and give it only to `jitsuin fund` on your own device, never to a website."
      />
    </DeskPage>
  );
}

/**
 * HNK-32.T7 (BL-D29-07, D17): the solvency report from `jitsuin fund --json`, run on the member's own
 * machine with the fund's viewing key, read here next to the slips. The page checks that the report
 * is about the root of a path this device holds; the viewing key itself never comes near the page.
 */
function SolvencyCard(): ReactNode {
  const file = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  return (
    <Card step="Solvency" title="Does the fund cover your units?" hint="Run `jitsuin fund --ufvk <key> --manager-pk <key> --path <saved path> --json` on your own computer, then drop its report here. The viewing key stays in that command; this page only reads the result.">
      <FileField label="Report from jitsuin fund (--json)" help="Read in your browser, never uploaded." inputRef={file} />
      <Field label="Or paste the report" area placeholder='{"network": "testnet", "verdict": …}' inputRef={text} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const raw = (await file.current!.files?.[0]?.text()) ?? text.current!.value;
              if (!raw.trim()) throw new Error("choose the report file or paste it");
              const r = readFundReport(raw, await load(), NET.noun);
              const v = r.report.verdict;
              const inc = r.report.inclusion;
              out.show(
                <>
                  {r.problems.length ? (
                    <Banner kind="bad" title="This report does not answer for your units" text={r.problems.join("; ") + "."} glyph="偽" />
                  ) : r.solvent ? (
                    <Banner kind="ok" title={`Solvent in period ${v!.period}`} text="The fund's assets cover every unit under the root your path ends in, at par, and your units are under it." glyph="済" />
                  ) : (
                    <Banner kind="bad" title={`Not solvent in period ${v!.period}`} text="The fund's assets are below what it owes its members at par. Withdraw requests are paid from cash only." glyph="滞" />
                  )}
                  {v ? (
                    <Kv
                      rows={[
                        ["Assets (cash, open receivables, overdue after write-off)", zec(v.assets_zat)],
                        ["Owed to members (root total, at par)", zec(v.liabilities_zat)],
                        ["Cash", zec(r.report.cash_zat)],
                        ["Open receivables", zec(v.open_zat)],
                        ["Overdue, after write-off", zec(v.overdue_zat)],
                        ["Your units", inc ? `${inc.units.toLocaleString("en")} · ${inc.included ? "under the root" : "not under the root"}` : "not checked"],
                      ]}
                    />
                  ) : null}
                </>,
              );
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Read the report
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}

/**
 * HNK-30.T22: how a member pays in. The manager hands a fund card with a deposit address made for
 * this member; the member pays it from any shielded wallet (the QR is a plain ZIP-321 request),
 * then gives the manager the transaction id and this screen's contact card for the receipt.
 */
function DepositCard(): ReactNode {
  const code = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const amount = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  const facts = (wl: Wallet) => (
    <Kv
      rows={[
        ["Deposit address (made for you)", wl.fund!.deposit_address, true],
        ["Fund key (signs your receipts)", wl.fund!.fund_pk, true],
      ]}
    />
  );
  const show = (wl: Wallet) => {
    if (!wl.fund) return;
    code.current!.value = "";
    out.show(facts(wl));
  };
  useEffect(() => {
    void load().then(show, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card step="Deposit" title="Pay into the fund" hint="Paste the fund card the manager gave you, then pay its address from a shielded wallet. Send the manager the transaction id and your contact card below: the receipt with your withdraw token comes back to your inbox.">
      <Field label="Fund card from the manager" area placeholder="jitsuin-fund-v1:…" inputRef={code} />
      <Field label="Amount to deposit (ZEC)" type="number" placeholder="0.01" inputRef={amount} />
      <Actions>
        <Button
          secondary
          onClick={async () => {
            try {
              const fund = decodeFundCard(code.current!.value.trim());
              const wl = await load();
              await save({ ...wl, fund });
              show({ ...wl, fund });
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
              out.show(
                <>
                  {facts(wl)}
                  <TrustedSvg svg={r.qr_svg} />
                  <p className="hint">{r.uri}</p>
                </>,
              );
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Show the deposit QR
        </Button>
      </Actions>
      {out.el}
    </Card>
  );
}
