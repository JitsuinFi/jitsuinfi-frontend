// Console home (HNK-26.T3, T4, T20, D-45): sign in with the paired passkey; signed in, the
// financier's desk. Financing offers in the mailbox are checked by the node and accepted here
// (HNK-26.T5); buyer histories are flagged against the financier's KYC registry (HNK-26.T7).
// React since HNK-31.T11. Drawn from the approved sample since HNK-34.T5 (console.html): one page
// with the console's own pill nav (Desk, In-tray, Rules, Fund, Keys). The Desk is the node slab
// (the only dark object: it is where Zcash is) with four big numbers, and the selected deal's
// paper file: the assignment letter over the 請求書, three seal boxes, index tabs per deal, the
// route 照 署 登 印 金 済 as marks and the one action as the seal-red button.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { download } from "../lib/download";
import { explain, stopReason } from "../lib/explain";
import { Act, CopyButton, Foot, PasskeyGlyph, say, Stamp, StationMark, Status, TopBar, netLabel } from "./bits";
import { agoSec, bigStamp, doubleNote, dueDay, isDouble, ROUTE, seals, short, stations, tabOf, totals, WAITING, zec } from "./model";
import { keepName } from "./name";
import { approvePayment, contactFingerprint, get, post } from "./node";
import { FundSection, KeysSection, RulesSection } from "./Sections";
import { SignIn } from "./SignIn";
import { TraySection } from "./Tray";
import type { BoardScan, DealRow, Info, Mail, Session } from "./types";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Plays a one-shot CSS animation again (the class names its keyframes). */
const replay = (el: Element | null | undefined, cls: string) => {
  if (!el || reduce()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};

/** The node: the one dark object of the page. Only what the node already says is shown. */
function NodeSlab({ info, board, boardErr, blink }: { info: Info; board: BoardScan | null; boardErr: string; blink: number }): ReactNode {
  const led = useRef<HTMLSpanElement>(null);
  const height = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!blink) return;
    replay(led.current, "is-blink");
    replay(height.current, "is-tick");
  }, [blink]);
  return (
    <div className={`cs-node${board ? "" : " is-off"}`} role="group" aria-label="Your node">
      <div className="cs-node-h">
        <span className="cs-led" ref={led} aria-hidden="true" />
        <b lang="ja">節点</b>
        <span>{board ? `Live · board scanned ${agoSec(board.scanned_at)}` : boardErr || "Asking the node for its board…"}</span>
      </div>
      <dl className="cs-node-facts">
        <div>
          <dt>Network</dt>
          <dd>{info.network === "main" ? "Zcash mainnet" : "Zcash testnet"}</dd>
        </div>
        {board ? (
          <div>
            <dt>Block</dt>
            <dd title="The height the node's board scan reached">
              <span className="cs-height is-mono" ref={height}>
                {board.tip}
              </span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Node key</dt>
          <dd className="is-mono" title="Fingerprint inside your contact card">
            {contactFingerprint(info.contact)}
          </dd>
        </div>
        <div>
          <dt>Mailbox</dt>
          <dd className="is-mono" title={info.mailbox_id}>
            {short(info.mailbox_id)}
          </dd>
          <CopyButton className="cs-cp" label="Copy" value={info.mailbox_id} />
        </div>
        <div>
          <dt>Wallet</dt>
          <dd className="is-mono" title={info.wallet_address}>
            {short(info.wallet_address)}
          </dd>
          <CopyButton className="cs-cp" label="Copy" value={info.wallet_address} />
        </div>
      </dl>
    </div>
  );
}

/** A note written on the file: the stop reason in seal ink, a node problem or the buyer history in pencil. */
function Memo({ k, title, pencil, children }: { k: string; title: string; pencil?: boolean; children: ReactNode }): ReactNode {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => replay(el.current, "is-in"), 380);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`cs-memo${pencil ? " is-pencil" : ""}`} ref={el}>
      <i lang="ja" aria-hidden="true">
        {k}
      </i>
      <b>{title}</b>
      {children}
    </div>
  );
}

/** HNK-26.T14 / T13: the files that prove a double financing or a repayment problem to anyone. */
function Memos({ d }: { d: DealRow }): ReactNode {
  const out: ReactNode[] = [];
  if (d.state === "Stopped") {
    const twice = isDouble(d);
    out.push(
      <Memo key="stop" k={twice ? "重" : "止"} title={twice ? "Financed twice: not paid" : (d.stopped ?? "").startsWith("AlreadyFinanced") ? "Stopped at the board check" : "Stopped"}>
        <p>{stopReason(d.stopped ?? "", d.stopped_winner)}</p>
        {d.exhibit ? (
          <>
            <p>{doubleNote(d.stopped_order)}</p>
            <div className="cs-actions">
              <CopyButton label="Copy Exhibit A" value={d.exhibit} failed="Copy failed: select the code" />
              {d.proof ? <CopyButton label="Copy the full proof" value={d.proof} failed="Copy failed: select the code" /> : null}
              {/* HNK-32.T5 (BL-D27-04): files for whoever needs them, read by Verify and `jitsuin verify` */}
              <button className="cs-btn-q" type="button" onClick={() => download(`${d.invoice_id}.exhibit-a.txt`, d.exhibit!)}>
                Download Exhibit A
              </button>
              {d.proof ? (
                <button className="cs-btn-q" type="button" onClick={() => download(`${d.invoice_id}.proof.txt`, d.proof!)}>
                  Download the full proof
                </button>
              ) : null}
              <a className="cs-link" href="https://jitsuinfi.vercel.app/verify" target="_blank" rel="noopener">
                Open the Verify page
              </a>
            </div>
          </>
        ) : null}
      </Memo>,
    );
  }
  if (d.problem) {
    const said = explain(d.problem);
    out.push(
      <Memo key="problem" k="待" title="The last step did not go through" pencil>
        <p>{said}</p>
        {said !== d.problem ? <p className="cs-memo-raw">{`The node said: ${d.problem}`}</p> : null}
      </Memo>,
    );
  }
  if (d.evidence) {
    const status = d.repayment ?? "";
    const word: Record<string, string> = {
      Claimed: "The buyer says it paid, but no mined payment covers the amount yet.",
      Disputed: "The buyer's claim is past the grace period and still not covered: a dispute.",
      Overdue: "Past the due date and the grace period, with no claim from the buyer.",
    };
    out.push(
      <Memo key="evidence" k={status === "Claimed" ? "待" : "滞"} title={`Repayment ${status.toLowerCase()}`}>
        <p>{word[status] ?? ""}</p>
        <p>
          Anyone you give it to rechecks it with <span className="is-mono">{"jitsuin verify --evidence <file>"}</span>: the buyer's signatures, and the status from the file itself.
        </p>
        <div className="cs-actions">
          <CopyButton label="Copy the evidence (JTSE)" value={d.evidence} />
          {/* HNK-32.T5 (BL-D25-04) */}
          <button className="cs-btn-q" type="button" onClick={() => download(`${d.invoice_id}.evidence.txt`, d.evidence!)}>
            Download the evidence
          </button>
        </div>
      </Memo>,
    );
  }
  if (d.history_requested) {
    out.push(
      <Memo key="history" k="歴" title="Buyer history" pencil>
        <p>{d.history ? `Buyer history passed: ${d.history}.` : "Waiting for the buyer's history (your mandate asks for it before the supplier signs)."}</p>
      </Memo>,
    );
  }
  return out.length ? <div className="cs-memos">{out}</div> : <span />;
}

function SealBox({ k, role, who, wait, on }: { k: string; role: string; who: string; wait: string; on: boolean }): ReactNode {
  return (
    <div className={`cs-sbox${on ? " is-on" : ""}`}>
      <span className="cs-sk" lang="ja">
        {role}
      </span>
      <i lang="ja" aria-hidden="true">
        {k}
      </i>
      <span>
        {who}
        <br />
        {on ? "sealed" : wait}
      </span>
    </div>
  );
}

/** The selected deal's paper file: the letter, the route under it, and the one line and action. */
function DealPaper({ d, name, demo, load, paid }: { d: DealRow; name: string | null | undefined; demo: boolean; load: () => Promise<void>; paid: () => void }): ReactNode {
  const [note, setNote] = useState("");
  const letter = useRef<HTMLElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const coin = useRef<HTMLSpanElement>(null);
  const fail = (e: unknown) => setNote(say(e));
  // motion that tells: the sheet lands, the seals press, the stamp slams
  useEffect(() => {
    replay(letter.current, "is-in");
    const ts = [...(letter.current?.querySelectorAll(".cs-sbox.is-on") ?? [])].map((s, i) => setTimeout(() => replay(s, "is-press"), 260 + i * 120));
    ts.push(setTimeout(() => replay(stamp.current, "is-slam"), 520));
    return () => ts.forEach(clearTimeout);
  }, []);
  const at = stations(d);
  const [s1, s2, s3] = seals(d);
  const big = bigStamp(d);
  let line = d.state === "Stopped" ? "The deal stopped. Nothing more happens on this file." : (WAITING[d.state] ?? d.state);
  if (d.state === "AwaitConfirmation" && d.confirmations != null && d.min_confirmations) line = `Entry posted: ${d.confirmations} of ${d.min_confirmations} confirmations.`;
  if (d.state === "Done" && d.repayment) line = d.settled_txid ? `Repaid and settled on the board (${short(d.settled_txid)})${d.bundle_sent ? "; the bundle went to the supplier and the buyer" : ""}.` : `Repayment: ${d.repayment.toLowerCase()}${d.paid_zat ? `, ${zec(d.paid_zat)} ZEC received` : ""}.`;
  const tx: Array<[string, string]> = [];
  if (d.entry_txid) tx.push(["Entry", d.entry_txid]);
  if (d.advance_txid) tx.push(["Advance", d.advance_txid]);
  if (d.settled_txid) tx.push(["Settled", d.settled_txid]);
  const label = { done: "done", now: "your action", wait: "in progress", later: "later", stop: "stopped here", cut: "not reached" };
  return (
    <>
      <div className="cs-sheets">
        <div className="cs-inv" aria-hidden="true">
          <div className="cs-inv-t">
            <b lang="ja">請求書</b>
            <span>Invoice, signed by the buyer</span>
          </div>
          <div className="cs-inv-seal">
            <i lang="ja">買</i>受領印
          </div>
        </div>
        <article className="cs-letter" ref={letter} aria-label={`Assignment letter for ${d.invoice_id}`}>
          {big ? (
            <span className="cs-big-stamp" ref={stamp} lang="ja" aria-hidden="true">
              {big.glyph}
              <small>{big.word}</small>
            </span>
          ) : null}
          <div className="cs-l-head">
            <div className="cs-l-title">
              <b lang="ja">債権譲渡通知書</b>
              <span>Assignment letter · this deal's paper file</span>
            </div>
            <div className="cs-l-no">
              <span>
                No. <b>{d.invoice_id}</b>
              </span>
            </div>
          </div>
          <p className="cs-l-to">
            To the buyer<b lang="ja">御中</b>
            {` · assigned to ${name || "this financier"}, paid at maturity to its shielded address`}
          </p>
          <dl className="cs-l-grid">
            <div>
              <dt>
                ご請求金額<span>Amount</span>
              </dt>
              <dd>{`${zec(d.amount_zat)} ZEC`}</dd>
            </div>
            <div>
              <dt>
                前渡金<span>Advance</span>
              </dt>
              <dd>{`${zec(d.advance_zat)} ZEC`}</dd>
            </div>
            <div>
              <dt>
                支払期日<span>Due</span>
              </dt>
              <dd>{dueDay(d.due_date)}</dd>
            </div>
            <div className="is-n">
              <dt>
                指紋 N<span>Fingerprint on the board</span>
              </dt>
              <dd>{d.n}</dd>
            </div>
          </dl>
          <div className="cs-l-foot">
            <Memos d={d} />
            <div className="cs-seals" aria-label="Seals on the letter">
              <SealBox k="売" role="譲渡人" who="Supplier" wait="waiting" on={s1} />
              <SealBox k="買" role="債務者" who="Buyer" wait="waiting" on={s2} />
              <SealBox k="証" role="譲受人" who="You" wait="with the advance" on={s3} />
            </div>
          </div>
        </article>
      </div>
      <ol className={`cs-route${d.state === "Done" ? "" : " has-label"}`} aria-label="Where this deal is">
        {ROUTE.map((r, i) => (
          <li key={r.glyph} className="cs-st" data-at={at[i]} title={r.label} aria-label={`${r.label}: ${label[at[i]]}`}>
            <span className="cs-mark">
              <StationMark mark={r.mark} />
              {i === 4 ? <span className="cs-coin" ref={coin} /> : null}
            </span>
            <b lang="ja" aria-hidden="true">
              {r.glyph}
            </b>
            <span>{at[i] === "stop" ? "Stopped here" : r.label}</span>
          </li>
        ))}
      </ol>
      <div className="cs-now">
        <div className="cs-now-t">
          <p>
            {line}
            {d.state === "AwaitConfirmation" && d.confirmations != null && d.min_confirmations ? (
              <span className="cs-confs" aria-hidden="true">
                {Array.from({ length: d.min_confirmations }, (_, i) => (
                  <i key={i} className={i < (d.confirmations ?? 0) ? "is-on" : undefined} />
                ))}
              </span>
            ) : null}
          </p>
          {d.state === "Pay" && d.intent ? <p className="cs-sub">{`Your passkey approves this exact payment: ${zec(d.intent.amount_zat)} ZEC to the supplier for N ${short(d.n)}.`}</p> : null}
          {tx.length ? (
            <ul className="cs-txids">
              {tx.map(([k, v]) => (
                <li key={k}>
                  {k}{" "}
                  <span className="is-mono" title={v}>
                    {short(v)}
                  </span>
                  <CopyButton className="cs-tx-copy" label="Copy" value={v} />
                </li>
              ))}
            </ul>
          ) : null}
          <Status text={note} />
        </div>
        <div className="cs-actions">
          {!demo && d.state === "Pay" && d.intent ? (
            <Act
              className="cs-btn"
              label={`Pay the advance, ${zec(d.advance_zat)} ZEC`}
              run={async () => {
                setNote("Waiting for your passkey…");
                const approval = await approvePayment(d.intent!);
                await post(`/node/console/deals/${d.n}/pay`, { approval });
                // approved: the coin drops into the pool, the node's light blinks
                replay(coin.current, "is-drop");
                paid();
                setNote("Approved with your passkey. The advance is on its way.");
                await load();
              }}
              fail={fail}
            >
              <PasskeyGlyph />
            </Act>
          ) : null}
          {!demo && !["Pay", "Done", "Stopped"].includes(d.state) ? (
            <Act
              label="Move on now"
              run={async () => {
                await post(`/node/console/deals/${d.n}/step`);
                setNote("Asked the node to move this deal on now.");
                await load();
              }}
              fail={fail}
            />
          ) : null}
          {/* BL-D28-03: the settled deal's verification bundle, for an auditor or a court (Verify page) */}
          {d.bundle ? (
            <>
              <CopyButton label="Copy the verification bundle (JTSB)" value={d.bundle} />
              <a className="cs-link" href="https://jitsuinfi.vercel.app/verify" target="_blank" rel="noopener">
                Check it on the Verify page
              </a>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** The deals after Accept, moved by the node, as folders with index tabs. */
function DealFile({ deals, note, name, demo, load, paid }: { deals: DealRow[] | null; note: string; name: string | null | undefined; demo: boolean; load: () => Promise<void>; paid: () => void }): ReactNode {
  const [sel, setSel] = useState<string | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (deals && !deals.some((d) => d.n === sel)) setSel((deals.find((d) => d.state === "Pay") ?? deals[0])?.n ?? null);
  }, [deals, sel]);
  // the selected folder's tab stays in view when the tabs scroll sideways (phones)
  useEffect(() => {
    const t = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const box = tabs.current;
    if (t && box) box.scrollLeft = Math.max(0, Math.min(box.scrollLeft, t.offsetLeft - 10), t.offsetLeft + t.offsetWidth - box.clientWidth);
  }, [sel]);
  const d = deals?.find((x) => x.n === sel) ?? null;
  const move = (dir: number) => {
    if (!deals?.length) return;
    const i = Math.max(0, deals.findIndex((x) => x.n === sel));
    const next = deals[(i + dir + deals.length) % deals.length];
    setSel(next.n);
    requestAnimationFrame(() => tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
  };
  return (
    <div className="cs-file">
      <div className="cs-tabs-row">
        <div
          className="cs-tabs"
          role="tablist"
          aria-label="Deals"
          ref={tabs}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move(1);
            else if (e.key === "ArrowLeft") move(-1);
          }}
        >
          {(deals ?? []).map((x) => {
            const t = tabOf(x);
            const id = x.invoice_id.length > 9 ? `…${x.invoice_id.slice(-8)}` : x.invoice_id;
            return (
              <button key={x.n} className="cs-tab" type="button" role="tab" data-k={t.kind} aria-selected={x.n === sel} aria-controls="cs-deal-panel" tabIndex={x.n === sel ? 0 : -1} title={`${x.invoice_id}: ${t.line}`} onClick={() => setSel(x.n)}>
                <i lang="ja" aria-hidden="true">
                  {t.glyph}
                </i>
                <b>{id}</b>
                <small>{t.line}</small>
              </button>
            );
          })}
        </div>
        <button className="cs-link cs-tabs-refresh" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div className="cs-desk" role="tabpanel" id="cs-deal-panel" aria-label={d ? d.invoice_id : "Deals"}>
        {d ? (
          <DealPaper key={d.n} d={d} name={name} demo={demo} load={load} paid={paid} />
        ) : (
          <div className="cs-sheets">
            <article className="cs-letter is-blank">
              <div className="cs-l-head">
                <div className="cs-l-title">
                  <b lang="ja">債権譲渡通知書</b>
                  <span>Assignment letter · this deal's paper file</span>
                </div>
              </div>
              <p className="cs-note">{deals ? "No deal yet: accept an offer from the mailbox." : note || "Opening your deals…"}</p>
            </article>
          </div>
        )}
      </div>
      {d && note ? <Status text={note} /> : null}
    </div>
  );
}

const NAV: Array<[string, string]> = [
  ["desk", "Desk"],
  ["tray", "In-tray"],
  ["rules", "Rules"],
  ["fund", "Fund"],
  ["keys", "Keys"],
];

/** Signed in: the financier's desk, one page with the console's own nav. */
function Desk({ session, info, rerender }: { session: Session; info: Info; rerender: () => void }): ReactNode {
  const demo = session.demo === true;
  const [name, setName] = useState(session.name);
  const [mail, setMail] = useState<Mail[] | null>(null);
  const [refused, setRefused] = useState(0);
  const [mailNote, setMailNote] = useState("");
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [dealsNote, setDealsNote] = useState("");
  const [board, setBoard] = useState<BoardScan | null>(null);
  const [boardErr, setBoardErr] = useState("");
  const [blink, setBlink] = useState(0);
  const [current, setCurrent] = useState("desk");
  const lastTip = useRef<number | null>(null);

  const loadMail = useCallback(async () => {
    setMailNote("Opening sealed messages…");
    try {
      const j = await get<{ messages: Mail[]; refused: number }>("/node/mail");
      setMail(j.messages);
      setRefused(j.refused);
      const r = j.refused ? ` ${j.refused} could not be opened or were addressed elsewhere.` : "";
      setMailNote(j.messages.length ? r.trim() : `No messages.${r}`);
    } catch (e) {
      setMailNote(say(e));
    }
  }, []);
  const loadBoard = useCallback(async () => {
    try {
      const b = await get<BoardScan>("/node/board");
      if (typeof b.tip !== "number" || typeof b.scanned_at !== "number") return;
      if (lastTip.current !== null && lastTip.current !== b.tip) setBlink((n) => n + 1);
      lastTip.current = b.tip;
      setBoard({ tip: b.tip, scanned_at: b.scanned_at });
      setBoardErr("");
    } catch (e) {
      setBoardErr(say(e));
    }
  }, []);
  const loadDeals = useCallback(async () => {
    try {
      const r = await get<{ deals: DealRow[] }>("/node/console/deals");
      setDeals(r.deals);
      setDealsNote("");
    } catch (e) {
      setDealsNote(say(e));
    }
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    void loadMail();
    void loadDeals();
    // the board scan moves on by itself: read its height again now and then while the page is seen
    const t = setInterval(() => document.visibilityState === "visible" && void loadBoard(), 60_000);
    return () => clearInterval(t);
  }, [loadMail, loadDeals, loadBoard]);

  // the nav follows the section in view
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((en) => en.isIntersecting && setCurrent(en.target.id)), { rootMargin: "-45% 0px -50% 0px" });
    NAV.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const t = totals(deals, mail);
  return (
    <div className={`cs${demo ? " is-demo" : ""}`}>
      <TopBar
        net={netLabel(info.network)}
        where={<span className="cs-brand-sub">Financier console</span>}
        nav={
          <nav className="cs-nav" aria-label="Console">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} aria-current={current === id ? "true" : undefined}>
                {label}
                {id === "tray" && t.offers ? <span className="cs-n-count">{t.offers}</span> : null}
              </a>
            ))}
          </nav>
        }
        end={
          <span className="cs-who">
            {name ? <span>{name}</span> : null}
            <button
              className="cs-link"
              type="button"
              onClick={async () => {
                await post("/node/console/logout").catch(() => undefined);
                rerender();
              }}
            >
              Sign out
            </button>
          </span>
        }
      />
      <main id="cs-main" tabIndex={-1}>
        <section className="cs-sec is-desk" id="desk" aria-labelledby="cs-desk-t">
          <div className="cs-cap">
            <p className="cs-eyebrow">
              <Stamp k="証" />
              <span>{demo ? "Demo console: payments, invites, removals and the profile are off" : "Financier node · the keys and wallet stay on the node"}</span>
            </p>
            <h1 id="cs-desk-t">{name ? `Welcome, ${name}` : "Financier console"}</h1>
            <NodeSlab info={info} board={board} boardErr={boardErr} blink={blink} />
            <dl className="cs-totals" aria-label="Your desk at a glance">
              <div className="is-act">
                <dt>offers waiting in the in-tray</dt>
                <dd>{t.offers ?? "…"}</dd>
              </div>
              <div>
                <dt>deals on the route</dt>
                <dd>{t.route ?? "…"}</dd>
              </div>
              <div>
                <dt>{`advanced, in ${t.advancedDeals} deal${t.advancedDeals === 1 ? "" : "s"}`}</dt>
                <dd>
                  {t.advanced === null ? "…" : zec(t.advanced)}
                  <small>ZEC</small>
                </dd>
              </div>
              <div>
                <dt>repaid and settled</dt>
                <dd>{t.settled ?? "…"}</dd>
              </div>
            </dl>
          </div>
          <div className="cs-vis">
            <DealFile deals={deals} note={dealsNote} name={name} demo={demo} load={loadDeals} paid={() => setBlink((n) => n + 1)} />
          </div>
        </section>
        <TraySection mail={mail} refused={refused} note={mailNote} demo={demo} load={loadMail} />
        <RulesSection name={name} mail={mail} demo={demo} />
        <FundSection info={info} demo={demo} />
        <KeysSection info={info} name={name} demo={demo} onName={setName} />
      </main>
      <Foot />
    </div>
  );
}

/** The console home: the door, or the desk once signed in. */
export function Home({ session, info, rerender }: { session: Session; info: Info; rerender: () => void }): ReactNode {
  useEffect(() => {
    if (session.signed_in) keepName(session.name);
  }, [session]);
  return session.signed_in ? <Desk session={session} info={info} rerender={rerender} /> : <SignIn session={session} info={info} rerender={rerender} />;
}

export type { Info, Session };
