// Supplier screen (HNK-10.T2; HNK-24.T2, T4 – T9; HNK-22.T4): opens in a supplier session, keeps
// every deal in the encrypted device store, and walks each deal from invoice to advance.
//
// Keys: the per-invoice key comes from the supplier master (P-03, HNK-24.T1), so there is no secret
// to back up. No master stays in this tab: every action that needs a key is a stamp (one passkey
// touch, `account.stamp()`), and the jitsuin-wasm `*Bytes` call zeroes it. The invoice and its
// PDF go to the buyer through the relay, sealed to the buyer's mailbox, and the buyer's signature
// comes back the same way (HNK-23.T7); the financier's node answers through the relay too (HNK-26).
// React since HNK-31.T8. Every change redraws the page from the store (`refresh`), as before: the
// parts remount, so their fields and messages start clean.
//
// The desk (HNK-34.T5, approved sample design-samples/internal/supplier.html): the caption column
// holds who you are, three numbers and the 台帳 ledger (one line per deal); the working visual is
// the open deal's 請求書 (the /try sheet in case mode) with its invoice code on a carbon slip, the
// deal's route as six physical stations (照 署 登 印 金 済; the supplier's move in seal red, a
// station that waits on someone else dashed), the chosen station's work under it, and the mailbox
// as an in-tray of letters beside it. Styles: pages/supplier.css.
import { handToVerify } from "../lib/verify-handoff";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Page } from "../app/AppShell";
import { Actions, Banner, Button, CodeBlock, Field, FileField, Kv, useOut } from "../app/ui";
import { financierFingerprint } from "../lib/account";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { loadBoard } from "../lib/board";
import { boardStatus } from "../lib/buyer-invoices";
import { dateToDays, daysToDate, fileHash, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { download } from "../lib/download";
import { rank, recordLine, verifyDirectory, type Directory, type Fit } from "../lib/directory";
import { NET } from "../lib/network";
import { PROVIDER } from "../lib/provider";
import { draft, send, signInWasm, type Received } from "../lib/relay";
import { describeFiles, encodeMessage, type Header } from "../lib/relay-message";
import { decodeEntryRequest, encodeOffer, entryRequestProblems, invoiceIdTaken, looksShielded, nextMove, nextStep, outcomeOn, route, sortDeals, standing, STEPS, type Outcome, type StationKey, type StationState, type SupplierDeal } from "../lib/supplier-deal";
import { reducedMotion } from "../landing/motion";
import { MailboxCard, takeContact, type InboxAction } from "./MailboxCard";
import { Seikyusho, type SheetFields } from "./try/Seikyusho";
import "./supplier.css";

// The open deal, for this tab: survives moving between screens, gone when the tab closes.
let current: string | null = null;
// HNK-34.T5: the sheet is a blank invoice being written (Write an invoice), not the open deal.
let writing = false;
// HNK-25.T2 (BL-D22-01): the buyer key that arrived through the mailbox, for the next invoice.
let arrivedBuyerKey: string | null = null;
// The N just created: it resolves digit by digit on the sheet once.
let fresh: string | null = null;
// Each deal's station states as last drawn: a station that turns done is stamped 済 once.
const seen = new Map<string, string>();
// What the board said about each offered deal, kept for the redraws of this tab.
let boardSays: Record<string, string> = {};
// The 名刺 fold of the mailbox stays as the supplier left it across redraws.
let cardOpen = false;

// HNK-34 E2E (finding 1): what the supplier just did, kept as a hanko and a sentence at the top of
// the desk's work until the supplier moves on (picks a station, opens another deal, writes an
// invoice or leaves the screen). Every action redraws the desk on the next station, so the outcome
// of the action itself was never seen.
// Judge run 2026-10-26: an inbox action keeps its outcome on the desk the same way, and the desk
// brings it into view once (the mailbox sits beside or below the work, so it was never seen).
type Did = Outcome;
let did: Did | null = null;
const didIt = (d: { n: string }, glyph: string, title: string, text: string, warn?: boolean): void => void (did = { n: d.n, glyph, title, text, ...(warn ? { warn } : {}) });
/** The same, for an action taken in the mailbox. */
const didInInbox = (d: { n: string }, glyph: string, title: string, text: string, warn?: boolean): void => {
  didIt(d, glyph, title, text, warn);
  did = { ...did!, inbox: true };
};

const HEX64 = /^[0-9a-f]{64}$/i;
const LEAD = "Issue an invoice, have the buyer sign it, offer it to one financier, sign its board entry, seal the letter and receive the advance.";

function hex64(value: string, what: string): string {
  const v = value.trim().toLowerCase();
  if (!HEX64.test(v)) throw new Error(`${what}: expected 64 hex characters`);
  return v;
}

/** Per-invoice secret for `d` from one stamp; the supplier `*Bytes` function that receives it zeroes it. */
async function secretFor(d: SupplierDeal): Promise<Uint8Array> {
  return wasm.supplierInvoiceSecretBytes(await account.stamp(), d.invoice_id, d.buyer_pk);
}

async function save(d: SupplierDeal): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("sign in as supplier first");
  await store.put(d.n, d);
}

const bytesToB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const value = (r: { current: { value: string } | null }) => r.current!.value.trim();
const short = (x: string) => `${x.slice(0, 10)}…${x.slice(-6)}`;
const when = (t: number) => new Date(t).toLocaleString();

type Refresh = () => void;

/** Opens deal `n` (and leaves the blank sheet). */
function openDeal(n: string): void {
  current = n;
  writing = false;
}

/** The invoice's own issue date and terms hash, read from its canonical bytes. */
function invoiceFacts(d: SupplierDeal): { issued: string; terms: string } {
  try {
    const f = json<{ issue_date: number; terms_hash: string }>(wasm.invoiceDecode(d.invoice));
    return { issued: daysToDate(f.issue_date), terms: f.terms_hash };
  } catch {
    return { issued: "", terms: "" };
  }
}

/** 済: the financier's settlement bundle is here, or the board shows the deal settled. */
const isSettled = (d: SupplierDeal) => !!d.bundle || (boardSays[d.n] ?? "").startsWith("On the board: settled");

// The six stations, each a physical mark (照 the buyer's seal checked under a loupe, 署 the pen
// that signs the offer, 登 the public board slab, 印 the seal on the letter, 金 the coin into the
// shielded pool, 済 the settled stamp).
const STATION: Record<StationKey, { glyph: string; obj: string; label: string }> = {
  signature: { glyph: "照", obj: "sp-o-check", label: STEPS[0].label },
  offer: { glyph: "署", obj: "sp-o-pen", label: STEPS[1].label },
  entry: { glyph: "登", obj: "sp-o-board", label: STEPS[2].label },
  seal: { glyph: "印", obj: "sp-o-seal", label: STEPS[3].label },
  advance: { glyph: "金", obj: "sp-o-coin", label: STEPS[4].label },
  settled: { glyph: "済", obj: "sp-o-stamp", label: "Settled" },
};
const STATE_WORD: Record<StationState, string> = { done: "done", next: "your move", wait: "waiting", later: "later" };

/** The station to show for `d`: the one to do now, else 済. */
function nowStation(stations: ReturnType<typeof route>): ReturnType<typeof route>[number] {
  return stations.find((s) => s.state === "next" || s.state === "wait") ?? stations[5];
}

export function SupplierPage(): ReactNode {
  const [ask, setAsk] = useState(0);
  const [view, setView] = useState<{ gen: number; deals: SupplierDeal[] } | null>(null);
  const refresh = () => setAsk((g) => g + 1);
  useEffect(() => () => void (did = null), []);
  useEffect(() => {
    const store = account.current?.store;
    if (!store) return;
    let live = true;
    // the store also keeps contacts ("contact:" ids); deals are stored under their N
    void store.list<SupplierDeal>().then((all) => {
      if (live) setView({ gen: ask, deals: sortDeals(all.filter((r) => HEX64.test(r.id)).map((r) => r.doc)) });
    });
    return () => void (live = false);
  }, [ask]);
  if (!view) return null;
  return <SupplierDesk key={view.gen} deals={view.deals} refresh={refresh} />;
}

function SupplierDesk({ deals, refresh }: { deals: SupplierDeal[]; refresh: Refresh }): ReactNode {
  const s = account.current;
  const store = s?.store;
  const isWriting = writing || !deals.length;
  const open = isWriting ? null : (deals.find((d) => d.n === current) ?? deals[0]);
  const tray = useRef<HTMLElement>(null);

  // HNK-25.T7 (BL-D25-09): each offered deal against the live board, filled in when it loads
  const [, setBoard] = useState(0);
  useEffect(() => {
    if (!deals.some((d) => d.buyer_signature && d.offer)) return;
    let live = true;
    void loadBoard((u, i) => fetch(u, i)).then(
      (b) => {
        boardSays = Object.fromEntries(deals.map((d) => [d.n, d.buyer_signature && d.offer ? (statusOnBoard(d, b.json) ?? "") : ""]));
        if (live) setBoard((x) => x + 1);
      },
      () => undefined,
    );
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The mailbox redraws with its contact card open; the 名刺 stays folded unless the supplier opened it.
  useLayoutEffect(() => {
    const fold = tray.current?.querySelector<HTMLDetailsElement>("details.mb-card");
    if (!fold) return;
    fold.open = cardOpen;
    const keep = () => void (cardOpen = fold.open);
    fold.addEventListener("toggle", keep);
    return () => fold.removeEventListener("toggle", keep);
  });

  const handlers: Record<string, InboxAction> = {
    "invoice.signature": signatureFromInbox(refresh),
    "deal.decline": declineFromInbox(refresh),
    "key.invoice_pk": {
      label: "Use for my next invoice",
      run: async (r: Received): Promise<string> => {
        const k = String(r.message.header.body.invoice_pk);
        if (r.message.header.signer !== k) throw new Error("this key did not sign its own message");
        arrivedBuyerKey = k;
        writing = true;
        const done = `The buyer's key ${k.slice(0, 10)}… is on your next invoice (Write an invoice).`;
        didInInbox({ n: "" }, "新", "Buyer's key received", `${done} Write the number, dates and amount on the sheet, add the PDF and create it.`);
        refresh();
        return done;
      },
    },
    "deal.commitment_opening": fromFinancier(refresh, "Use this entry request", ["登", "Entry request received"], async (d, h) => {
      const b = h.body as { financier_pk: string; salt: string; discount?: number; tenor?: number; history_tag?: string };
      // HNK-26.T8: with the buyer's history checked, the entry must carry the certificate's tag
      const r = { n: d.n, financier_pk: b.financier_pk, salt: b.salt, ...(b.discount !== undefined ? { discount: b.discount, tenor: b.tenor } : {}), ...(b.history_tag ? { history_tag: b.history_tag } : {}) };
      const problems = entryRequestProblems(d, r);
      if (problems.length) throw new Error(problems.join("; "));
      await save({ ...d, entry_request: r });
      return `The financier checked the board: sign the entry for ${d.invoice_id} (Step 3).`;
    }),
    "deal.letter": fromFinancier(refresh, "Keep the letter", ["印", "Assignment letter received"], async (d, h, files) => {
      if (!files[0]) throw new Error("the letter came without its PDF");
      await save({ ...d, letter_in: { letter: String(h.body.letter), pdf: bytesToB64(files[0]), at: Date.now() } });
      return `The assignment letter for ${d.invoice_id} is here: read and seal it (Step 4).`;
    }),
    "deal.bundle": fromFinancier(refresh, "Keep the settlement bundle", ["済", "Repaid and settled"], async (d, h) => {
      const bundle = String(h.body.bundle);
      if (json<{ nullifier: string }>(wasm.verifyBundle(bundle)).nullifier !== d.n) throw new Error("this bundle is for another invoice");
      await save({ ...d, bundle });
      return `${d.invoice_id}: the buyer repaid and the financier posted the settled entry. The bundle proves the whole deal on the Verify page.`;
    }),
    "deal.advance": fromFinancier(refresh, "Note the advance", ["金", "The financier paid the advance"], async (d, h) => {
      const b = h.body as { txid: string; advance_zat: number };
      await save({ ...d, advance_notice: { txid: b.txid, advance_zat: b.advance_zat, at: Date.now() } });
      return `The financier paid ${zatToZec(b.advance_zat)} ZEC in ${b.txid.slice(0, 10)}…: check it in your wallet (Step 5).`;
    }),
  };

  const financed = deals.filter((d) => d.advance?.matches).length;
  const onRoute = deals.filter((d) => nextStep(d) !== null).length;

  return (
    <Page wide>
      <div className="sp" data-wide="true">
        <ObjectDefs />
        <div className="sp-desk">
          {/* ===== caption column: who you are, the numbers, the ledger ===== */}
          <section className="sp-cap" aria-labelledby="sp-h1">
            <p className="sp-tag">
              <b lang="ja">売</b>Supplier's counter
            </p>
            <h1 id="sp-h1">Supplier</h1>
            <p className="sp-lede">{LEAD}</p>
            <div className="sp-who">
              <svg className="sp-who-seal" viewBox="0 0 68 68" aria-hidden="true" focusable="false">
                <circle className="sp-ws-o" cx="34" cy="34" r="30" />
                <circle className="sp-ws-i" cx="34" cy="34" r="25" />
                <text className="sp-ws-g" x="34" y="46" textAnchor="middle">
                  売
                </text>
              </svg>
              <dl>
                <dt>Your key fingerprint</dt>
                <dd className="sp-print">{s?.fingerprint ?? ""}</dd>
                <dd className="sp-from">{s?.demo ? "Signed in as supplier · keys from a test secret, for test data only" : "Signed in as supplier · keys from your passkey, one touch per signature"}</dd>
              </dl>
            </div>
            {store && !store.persistent ? (
              <p className="sp-unsaved" role="status">
                <b lang="ja" aria-hidden="true">
                  注
                </b>
                <span>
                  <strong>Not saved.</strong> This browser blocks local storage here (private window?). Deals stay only until the tab closes.
                </span>
              </p>
            ) : null}
            <dl className="sp-nums" aria-label="Your invoices">
              <div>
                <dt>invoices issued</dt>
                <dd>{deals.length}</dd>
              </div>
              <div className="is-seal">
                <dt>financed, advance in</dt>
                <dd>{financed}</dd>
              </div>
              <div>
                <dt>on the route</dt>
                <dd>{onRoute}</dd>
              </div>
            </dl>
            <Ledger deals={deals} open={open} refresh={refresh} />
          </section>

          {/* ===== the working visual: the 請求書, its route, the work, the in-tray ===== */}
          <section className="sp-bench" aria-label="The supplier's desk">
            {open ? <DealView key={open.n} d={open} refresh={refresh} /> : <NewInvoice deals={deals} refresh={refresh} />}
            <aside className="sp-tray" aria-label="Mailbox" ref={tray}>
              <MailboxCard handlers={handlers} />
            </aside>
          </section>
        </div>
      </div>
    </Page>
  );
}

// ---------- the ledger (HNK-24.T9): one line per invoice, newest first ----------

function Ledger({ deals, open, refresh }: { deals: SupplierDeal[]; open: SupplierDeal | null; refresh: Refresh }): ReactNode {
  return (
    <section className="sp-ledger" aria-labelledby="sp-led">
      <div className="sp-ledger-h">
        <h2 id="sp-led">
          <b lang="ja">台帳</b>Your deals <small>newest first</small>
        </h2>
        <button
          type="button"
          className="sp-pill"
          aria-pressed={!open}
          onClick={() => {
            writing = true;
            did = null;
            refresh();
          }}
        >
          <b lang="ja" aria-hidden="true">
            新
          </b>
          Write an invoice
        </button>
      </div>
      {deals.length ? (
        <ol>
          {deals.map((d) => {
            const stations = route(d, isSettled(d));
            const now = nowStation(stations);
            const move = nextMove(d);
            const stands = standing(d, isSettled(d));
            const board = d.buyer_signature && d.offer ? (boardSays[d.n] ?? "") : "";
            return (
              <li key={d.n}>
                <button
                  type="button"
                  className="sp-ln"
                  aria-current={open?.n === d.n ? "true" : undefined}
                  onClick={() => {
                    if (d.n !== open?.n) did = null;
                    openDeal(d.n);
                    refresh();
                  }}
                >
                  <span className="sp-ln-g" lang="ja" data-s={stands === "settled" ? "done" : now.state} aria-hidden="true">
                    {STATION[now.key].glyph}
                  </span>
                  <span className="sp-ln-id">{d.invoice_id}</span>
                  <span className="sp-ln-amt">{`${zatToZec(d.amount_zat)} ZEC`}</span>
                  <span className="sp-ln-meta">
                    {`due ${daysToDate(d.due_date)}`}
                    <span className="sp-iss">{` · issued ${invoiceFacts(d).issued}`}</span>
                  </span>
                  <span className="sp-ticks" aria-hidden="true">
                    {stations.map((st) => (
                      <i key={st.key} className={st.state === "later" ? undefined : `is-${st.state}`} />
                    ))}
                  </span>
                  {move ? (
                    <span className={move.wait ? "sp-ln-next is-wait" : "sp-ln-next"}>
                      <b>Next:</b> {move.text}
                    </span>
                  ) : stands === "settled" ? (
                    <span className="sp-ln-next">
                      <b>Settled.</b> The buyer repaid the financier.
                    </span>
                  ) : (
                    <span className="sp-ln-next is-wait">
                      <b>Advance received.</b> {`Waiting for the buyer to pay the financier, due ${daysToDate(d.due_date)}.`}
                    </span>
                  )}
                  {board ? <span className="sp-ln-board">{board}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="sp-ledger-empty">
          <p>No deal yet. Write your first invoice on the sheet.</p>
          <span className="sp-rules" aria-hidden="true" />
        </div>
      )}
    </section>
  );
}

/** What the board says about this deal, from the bundle the financier sent or what this device holds. */
function statusOnBoard(d: SupplierDeal, boardJson: string): string | null {
  try {
    const bundle =
      d.bundle ??
      wasm.bundleBuild(
        JSON.stringify({
          invoice: d.invoice,
          buyer_signature: d.buyer_signature,
          ...(d.seal ? { assignment: d.seal.letter, seals: [d.seal.s0], with_settlement: true } : {}),
        }),
      );
    return `On the board: ${boardStatus(json<{ register: { status: string }; settled: { on_time: boolean } | null }>(wasm.bundleOnBoard(bundle, boardJson)))}`;
  } catch {
    return null;
  }
}

// ---------- the station objects (plain SVG, classes only) ----------

function ObjectDefs(): ReactNode {
  return (
    <svg className="sp-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {/* the ink texture of the buyer's seal on the sheet (Seikyusho case mode) */}
        <filter id="tc-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves={2} seed={4} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.7 1.25" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/** A station's object, drawn inline so the station's state can move its parts (the coin sinks). */
function StationArt({ obj }: { obj: string }): ReactNode {
  switch (obj) {
    case "sp-o-check":
      return (
        <>
          <rect className="o-sheet" x="4" y="8" width="26" height="34" rx="1.5" />
          <path className="o-ink-2" d="M9 16h14M9 21h11" />
          <circle className="o-seal" cx="18" cy="33" r="5" />
          <circle className="o-glass" cx="27" cy="25" r="11" />
          <path className="o-handle" d="M35 33l10 10" />
        </>
      );
    case "sp-o-pen":
      return (
        <>
          <path className="o-ink-2" d="M6 42c5-4 8 1 13-2s7-6 11-2" />
          <g transform="rotate(-42 30 22)">
            <rect className="o-pen" x="14" y="18" width="30" height="8" rx="4" />
            <path className="o-nib" d="M14 18l-8 4 8 4z" />
            <path className="o-ink" d="M40 18v8" />
          </g>
        </>
      );
    case "sp-o-board":
      return (
        <>
          <path className="o-slab-side" d="M5 34l4 6h36l4-6z" />
          <rect className="o-slab" x="5" y="9" width="44" height="26" rx="2.5" />
          <path className="o-slab-line" d="M11 17h20M11 23h28M11 29h16" />
          <circle className="o-glint" cx="42" cy="15" r="2.4" />
          <rect className="slab-scan" x="10" y="13" width="3" height="20" />
        </>
      );
    case "sp-o-seal":
      return (
        <>
          <circle className="o-seal" cx="27" cy="38" r="7.5" />
          <circle className="o-seal" cx="27" cy="38" r="4.5" />
          <path className="o-sheet" d="M20 6h14l-1 22H21z" />
          <path className="o-ink" d="M19 28h16" />
          <ellipse className="o-ink-2" cx="27" cy="6" rx="7" ry="2" />
        </>
      );
    case "sp-o-coin":
      return (
        <>
          <ellipse className="o-pool" cx="27" cy="38" rx="22" ry="7.5" />
          <ellipse className="o-ripple coin-ripple" cx="27" cy="38" rx="12" ry="3.6" />
          <ellipse className="o-ripple coin-ripple" cx="27" cy="38" rx="6" ry="1.8" />
          <g className="coin">
            <circle className="o-coin" cx="27" cy="16" r="9" />
            <path className="o-ink" d="M23.5 12.5h7l-7 7h7" />
          </g>
        </>
      );
    case "sp-o-stamp":
      return (
        <>
          <rect className="o-seal o-stamp-box" x="10" y="5" width="34" height="34" rx="6" />
          <text className="o-stamp-t" x="27" y="30" textAnchor="middle">
            済
          </text>
        </>
      );
    default:
      return null;
  }
}

/** The deal's route: six stations on one rail; done ones carry a small 済. */
function Rail({ stations, selected, onPick, stamp }: { stations: ReturnType<typeof route>; selected: StationKey | null; onPick?: (k: StationKey) => void; stamp?: Set<StationKey> }): ReactNode {
  const reach = Math.min(5, stations.filter((s) => s.state === "done").length);
  return (
    <ol className="sp-rail" data-reach={reach} aria-label="The deal route">
      <li className="sp-rail-fill" aria-hidden="true" />
      {stations.map((s) => {
        const st = STATION[s.key];
        const body = (
          <>
            <span className="sp-obj">
              <svg viewBox="0 0 54 48" aria-hidden="true" focusable="false">
                <StationArt obj={st.obj} />
              </svg>
              <i className="sp-st-mark" lang="ja" aria-hidden="true">
                済
              </i>
            </span>
            <b className="sp-st-k" lang="ja" aria-hidden="true">
              {st.glyph}
            </b>
            <span className="sp-st-l">{st.label}</span>
            {s.state === "next" || s.state === "wait" ? <span className="sp-st-now">{STATE_WORD[s.state]}</span> : null}
          </>
        );
        return (
          <li key={s.key} className={stamp?.has(s.key) ? "sp-st is-stamp" : "sp-st"} data-k={s.key} data-s={s.state} aria-current={selected === s.key ? "step" : undefined}>
            {onPick ? (
              <button type="button" className="sp-st-btn" aria-label={`${st.label}: ${STATE_WORD[s.state]}`} onClick={() => onPick(s.key)}>
                {body}
              </button>
            ) : (
              <span className="sp-st-b" aria-label={`${st.label}: ${STATE_WORD[s.state]}`}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A station's work: its heading and hint on the paper, its inputs grouped on one paper panel. */
function Work({ glyph, step, title, hint, children }: { glyph: string; step: string; title: string; hint: string; children?: ReactNode }): ReactNode {
  return (
    <>
      <div className="sp-work-h">
        <b lang="ja" aria-hidden="true">
          {glyph}
        </b>
        <span className="sp-stp">{step}</span>
        <h3>{title}</h3>
      </div>
      <p className="sp-hint">{hint}</p>
      {children ? <div className="sp-panel">{children}</div> : null}
    </>
  );
}

const useSheetFields = (): SheetFields => ({ id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) });

// ---------- new invoice (HNK-24.T2) ----------

function NewInvoice({ deals, refresh }: { deals: SupplierDeal[]; refresh: Refresh }): ReactNode {
  // HNK-21.T2: the invoice is written on the 請求書 itself (the same sheet as /try); only the buyer's
  // key and the PDF sit below it. The buyer's seal box stays empty until the buyer signs.
  const today = useRef(new Date().toISOString().slice(0, 10)).current;
  const fields = useSheetFields();
  const nCode = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const crack = useRef<SVGPathElement>(null);
  const art = useRef<SVGGElement>(null);
  const buyer = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const terms = useRef<HTMLInputElement>(null);
  const [to, setTo] = useState(arrivedBuyerKey ? short(arrivedBuyerKey) : "the buyer's key, below");
  const out = useOut();
  // what just happened for the blank sheet (the buyer's key from the mailbox), until the supplier moves on
  const shown = outcomeOn(did, null);
  useEffect(() => {
    const b = buyer.current!;
    const f = terms.current!;
    const onBuyer = () => {
      const v = b.value.trim();
      setTo(HEX64.test(v) ? short(v) : "the buyer's key, below");
    };
    const onFile = async () => {
      const file = f.files?.[0];
      fields.terms.current!.value = file ? await fileHash(file) : "";
    };
    b.addEventListener("input", onBuyer);
    f.addEventListener("change", onFile);
    return () => {
      b.removeEventListener("input", onBuyer);
      f.removeEventListener("change", onFile);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stations = STEPS.map((s) => ({ key: s.key as StationKey, label: s.label, state: "later" as StationState })).concat({ key: "settled", label: "Settled", state: "later" });
  return (
    <>
      <div className="sp-sheet is-new">
        <span className="sp-under" aria-hidden="true" />
        <Seikyusho
          o={{ id: "", amount: "", issued: today, due: "", terms: "", buyer: "", supplier: "", issuer: "You" }}
          fields={fields}
          changed={null}
          n={null}
          blank={{
            seal: "pending",
            to,
            by: "your key for this invoice, from your passkey",
            note: "The buyer's seal 買 goes in the box once the buyer signs these exact bytes.",
            n: "made when you create it: it needs your key for this invoice",
            placeholders: { id: "TES-INV-0007", amount: "0.0004", terms: "the PDF's SHA-256 appears here" },
            termsReadOnly: true,
          }}
          kase={{ sealed: "pending", nCode, ring, crack, art, inside: null }}
        />
      </div>
      <div className="sp-rail-area">
        <Rail stations={stations} selected={null} />
        <p className="sp-rail-cap">{deals.length ? "Writing a new invoice. Its route starts once you create it." : "Issue your first invoice on the sheet."}</p>
      </div>
      <section className="sp-work" aria-label="Write an invoice">
        {shown ? <DidLine did={shown.outcome} reveal={shown.reveal} /> : null}
        <Work glyph="新" step="New" title="Write an invoice" hint="Its key is derived from your passkey, the invoice number and the buyer's key. The canonical invoice is what the buyer signs; its fingerprint N is what financiers look up on the board. Write the number, dates and amount on the sheet above.">
          <Field label="Buyer key for this invoice" placeholder="64 hex characters from the buyer's screen" value={arrivedBuyerKey ?? undefined} help={arrivedBuyerKey ? "Arrived in your mailbox from the buyer; it is on this sheet." : "The buyer copies it from their screen (Give this key to the supplier), or sends it to your mailbox."} inputRef={buyer} />
          <FileField label="Invoice document (PDF)" help="Hashed in your browser with SHA-256. The file is never uploaded." inputRef={terms} />
          <Actions>
            <Button
              onClick={async () => {
                try {
                  const invoiceId = value(fields.id);
                  if (invoiceId.length < 1 || invoiceId.length > 32) throw new Error("invoice number: 1–32 characters");
                  if (invoiceIdTaken(deals, invoiceId)) throw new Error(`invoice number ${invoiceId} is already used on this device`);
                  const buyerPk = hex64(value(buyer), "buyer key");
                  const file = terms.current!.files?.[0];
                  if (!file) throw new Error("choose the invoice document");
                  if (!fields.due.current!.value) throw new Error("give the due date");
                  const supplierPk = wasm.supplierInvoicePublicKeyBytes(await account.stamp(), invoiceId, buyerPk);
                  const amountZat = zecToZat(value(fields.amount));
                  const dueDay = dateToDays(fields.due.current!.value);
                  const code = wasm.invoiceEncode(
                    JSON.stringify({
                      invoice_id: invoiceId,
                      supplier_pk: supplierPk,
                      buyer_pk: buyerPk,
                      amount_zat: amountZat,
                      issue_date: dateToDays(fields.issued.current!.value),
                      due_date: dueDay,
                      terms_hash: await fileHash(file),
                    }),
                  );
                  const n = json<{ nullifier: string }>(wasm.invoiceDecode(code)).nullifier;
                  await save({ n, invoice_id: invoiceId, buyer_pk: buyerPk, supplier_pk: supplierPk, amount_zat: amountZat, due_date: dueDay, invoice: code, created_at: Date.now() });
                  openDeal(n);
                  fresh = n;
                  arrivedBuyerKey = null;
                  didIt({ n }, "新", "Invoice created", `${invoiceId}: its fingerprint N is on the sheet. Next: send it to the buyer for a signature.`);
                  refresh();
                } catch (e) {
                  out.error(e);
                }
              }}
            >
              Create invoice
            </Button>
            {deals.length ? (
              <button
                type="button"
                className="sp-ink"
                onClick={() => {
                  writing = false;
                  did = null;
                  refresh();
                }}
              >
                Back to the open deal
              </button>
            ) : null}
          </Actions>
          {out.el}
        </Work>
      </section>
    </>
  );
}

// ---------- one deal (HNK-24.T4 – T8) ----------

/** N resolves digit by digit, left to right (MASTER §5: 20 ms apart, then settles). */
function resolveN(el: HTMLElement, n: string): void {
  const rows = Array.from(el.querySelectorAll("span"));
  if (rows.length !== 4) return;
  const HEX = "0123456789abcdef";
  const t0 = performance.now();
  el.classList.add("is-resolving");
  const tick = (t: number) => {
    const e = t - t0;
    let done = true;
    rows.forEach((row, r) => {
      row.textContent = Array.from(n.slice(r * 16, r * 16 + 16), (c, j) => {
        if (e > ((r * 16 + j) * 20) / 3 + 400) return c;
        done = false;
        return HEX[(Math.random() * 16) | 0];
      }).join("");
    });
    if (!done) requestAnimationFrame(tick);
    else el.classList.remove("is-resolving");
  };
  requestAnimationFrame(tick);
}

function DealView({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const settled = isSettled(d);
  const stations = route(d, settled);
  const facts = invoiceFacts(d);
  const fields = useSheetFields();
  const sheet = useRef<HTMLElement>(null);
  const nCode = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const crack = useRef<SVGPathElement>(null);
  const art = useRef<SVGGElement>(null);
  // the stations that turned done since this deal was last drawn: each gets its 済 pressed once
  const [stamp] = useState(() => {
    const was = seen.get(d.n)?.split(",");
    return new Set(was ? stations.filter((s, i) => s.state === "done" && was[i] !== "done").map((s) => s.key) : []);
  });
  seen.set(
    d.n,
    stations.map((s) => s.state).join(","),
  );
  const [view, setView] = useState<StationKey | null>(null);
  const sel = view ?? nowStation(stations).key;
  // the outcome of the action just taken on this deal, until the supplier picks a station
  const [shown, setShown] = useState(() => outcomeOn(did, d.n));
  const pick = (k: StationKey) => {
    did = null;
    setShown(null);
    setView(k);
  };
  const stands = standing(d, settled);

  useLayoutEffect(() => {
    if (reducedMotion()) {
      fresh = null;
      return;
    }
    const sk = sheet.current;
    if (fresh === d.n && nCode.current) resolveN(nCode.current, d.n);
    fresh = null;
    if (sk && stamp.has("signature")) sk.classList.add("is-press");
    if (sk && stamp.has("settled")) sk.classList.add("is-stamp");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = nextMove(d);
  const board = d.buyer_signature && d.offer ? (boardSays[d.n] ?? "") : "";
  const note = d.buyer_signature ? "The buyer sealed exactly these bytes." : d.sign_request ? `Sent to the buyer on ${when(d.sign_request.at)}; the box stays empty until the buyer signs these exact bytes.` : "The buyer's seal 買 goes in the box once the buyer signs these exact bytes.";

  return (
    <>
      <div className="sp-sheet">
        <span className="sp-under" aria-hidden="true" />
        <Seikyusho
          o={{ id: d.invoice_id, amount: zatToZec(d.amount_zat), issued: facts.issued, due: daysToDate(d.due_date), terms: facts.terms, buyer: d.buyer_pk, supplier: d.supplier_pk, issuer: "You" }}
          fields={fields}
          changed={null}
          n={d.n}
          sheet={sheet}
          readOnly
          note={note}
          kase={{
            sealed: d.buyer_signature ? true : "pending",
            nCode,
            ring,
            crack,
            art,
            inside: (
              <>
                {settled ? (
                  <span className="sp-done" aria-hidden="true">
                    <span lang="ja">済</span>
                    <small>SETTLED</small>
                  </span>
                ) : null}
              </>
            ),
          }}
        />
        <div className="sp-slip">
          <span>Invoice code</span>
          <code title={d.invoice}>{d.invoice}</code>
          <Button secondary onClick={async () => void (await navigator.clipboard.writeText(d.invoice))}>
            Copy
          </Button>
          <Button secondary onClick={() => download(`${d.invoice_id}.invoice.txt`, d.invoice)}>
            Download
          </Button>
        </div>
      </div>
      <div className="sp-rail-area">
        <Rail stations={stations} selected={sel} onPick={pick} stamp={stamp} />
        <p className="sp-rail-cap" aria-live="polite">
          {move ? (
            <span>
              <b>Next:</b> {`${move.text}.`}
            </span>
          ) : stands === "settled" ? (
            <span>
              <b>Settled:</b> the buyer repaid and the financier posted the settled entry.
            </span>
          ) : (
            <span>
              <b>Advance received:</b> {`waiting for the buyer to pay the financier at maturity, due ${daysToDate(d.due_date)}.`}
            </span>
          )}
          {board ? <span className="sp-board-line">{board}</span> : null}
        </p>
      </div>
      <section className="sp-work" aria-label="This station's work">
        {shown ? <DidLine did={shown.outcome} reveal={shown.reveal} /> : null}
        <StationWork key={sel} d={d} station={sel} stations={stations} board={board} refresh={refresh} />
      </section>
    </>
  );
}

/**
 * The outcome of the action just taken: the station's mark pressed as a hanko, and a sentence.
 * `reveal` (taken in the mailbox): scrolled into view once, when it is off screen.
 */
function DidLine({ did: x, reveal = false }: { did: Did; reveal?: boolean }): ReactNode {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reveal || !el.current) return;
    if (did === x) did = { ...x, inbox: false }; // once: a later redraw does not scroll again
    const r = el.current.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight) el.current.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={x.warn ? "sp-did is-warn" : "sp-did"} role="status" ref={el}>
      <span className="sp-did-seal" lang="ja" aria-hidden="true">
        {x.glyph}
      </span>
      <p>
        <small>{x.warn ? "Came back" : "Done"}</small>
        <strong>{x.title}</strong>
        <span>{x.text}</span>
      </p>
    </div>
  );
}

function StationWork({ d, station, stations, board, refresh }: { d: SupplierDeal; station: StationKey; stations: ReturnType<typeof route>; board: string; refresh: Refresh }): ReactNode {
  const st = stations.find((s) => s.key === station)!;
  if (st.state === "later") {
    const now = stations.find((s) => s.state === "next" || s.state === "wait");
    const ix = stations.indexOf(st) + 1;
    return <Work glyph={STATION[station].glyph} step={station === "settled" ? "Settled" : `Step ${ix}`} title={STATION[station].label} hint={`Not yet. This station opens after ${now ? `“${STATION[now.key].label.toLowerCase()}”` : "the earlier steps"}.`} />;
  }
  switch (station) {
    case "signature":
      return <SignatureWork d={d} refresh={refresh} />;
    case "offer":
      return <OfferWork d={d} refresh={refresh} />;
    case "entry":
      return <EntryWork d={d} refresh={refresh} />;
    case "seal":
      return <SealWork d={d} refresh={refresh} />;
    case "advance":
      return <AdvanceWork d={d} refresh={refresh} />;
    case "settled":
      return d.bundle || st.state === "done" ? (
        <Work glyph="済" step="Settled" title="Repaid and settled" hint="The buyer repaid and the financier posted the settled entry. The bundle proves the whole deal on the Verify page.">
          <Kv
            rows={[
              ["On the board", board ? board.replace(/^On the board: /, "") : "not read yet"],
              ...(d.advance ? [["Advance", `${zatToZec(d.advance.received_zat)} ZEC in ${short(d.advance.txid)}`] as [string, string]] : []),
            ]}
          />
          {d.bundle ? <CodeBlock label="Settlement bundle" value={d.bundle} filename={`${d.invoice_id}.bundle.txt`} /> : null}
          <Actions>
            {/* the bundle goes along to Verify's in-tray, in memory (never in the address) */}
            <a className="sp-ink" href="/verify" onClick={() => d.bundle && handToVerify(d.bundle)}>
              Check it on Verify
            </a>
          </Actions>
        </Work>
      ) : (
        <Work glyph="済" step="Waiting" title="Waiting for the buyer to pay" hint={`Your advance arrived as agreed. The buyer pays the financier at maturity, due ${daysToDate(d.due_date)}; the financier then posts the settled entry and the settlement bundle arrives in your mailbox. Nothing to do until then.`} />
      );
  }
}

/** HNK-23.T7: a buyer's signature from the inbox, checked against its deal and kept. */
function signatureFromInbox(refresh: Refresh): InboxAction {
  return {
    label: "Check and keep",
    run: async (r) => {
      const n = r.message.header.n ?? "";
      const d = await account.current?.store?.get<SupplierDeal>(n);
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      const s = String(r.message.header.body.buyer_signature);
      wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
      await save({ ...d, buyer_signature: s });
      openDeal(d.n);
      didInInbox(d, "照", "Signed by the buyer", "The buyer's signature arrived and holds for exactly this invoice. Next: offer it to one financier.");
      refresh();
      return `The buyer signed ${d.invoice_id}. Next: offer it to one financier.`;
    },
  };
}

/**
 * HNK-26.T16: a message from the financier's node about one of this device's deals, accepted only
 * from the financier the invoice was offered to (its key signed the header).
 */
function fromFinancier(refresh: Refresh, label: string, [glyph, title]: [string, string], use: (d: SupplierDeal, h: Header, files: Uint8Array[]) => Promise<string>): InboxAction {
  return {
    label,
    run: async (r) => {
      const h = r.message.header;
      const d = await account.current?.store?.get<SupplierDeal>(h.n ?? "");
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("this message is not from the financier you offered this invoice to");
      const done = await use(d, h, r.message.attachments);
      openDeal(d.n);
      didInInbox(d, glyph, title, done);
      refresh();
      return done;
    },
  };
}

/** HNK-26.T6: a financier declined the offer; the invoice is free to offer to another one. */
function declineFromInbox(refresh: Refresh): InboxAction {
  return {
    label: "Note and free the invoice",
    run: async (r) => {
      const h = r.message.header;
      const d = await account.current?.store?.get<SupplierDeal>(h.n ?? "");
      if (!d) throw new Error("no deal on this device has this fingerprint N");
      if (!d.offer || d.offer.financier_pk !== h.signer) throw new Error("this decline is not from the financier you offered this invoice to");
      if (d.entry_request || d.entry) throw new Error("this financier already moved the deal on; a late decline is ignored");
      const reason = String(h.body.reason ?? "");
      await save({ ...d, offer: undefined, declined: [...(d.declined ?? []), { financier_pk: d.offer.financier_pk, reason, at: Date.now() }] });
      openDeal(d.n);
      didInInbox(d, "署", "Offer declined", `${reason} You can offer ${d.invoice_id} to another financier.`, true);
      refresh();
      return `Declined: ${reason} You can offer ${d.invoice_id} to another financier.`;
    },
  };
}

/** T4: check the buyer's signature before offering the invoice to anyone. */
function SignatureWork({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const contact = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const sig = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const sendOut = useOut();
  const out = useOut();
  useEffect(() => {
    if (d.sign_request) sendOut.show(<Banner kind="ok" title="Sent to the buyer" text={`On ${when(d.sign_request.at)}. The signature arrives in your mailbox.`} />);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (d.buyer_signature) {
    return (
      <Work glyph="照" step="Step 1" title="Buyer signature" hint="Checked against the invoice.">
        <Banner kind="ok" title="Signed by the buyer" text="The buyer's per-invoice key signed exactly this invoice." />
      </Work>
    );
  }
  return (
    <Work glyph="照" step="Step 1" title="Get the buyer's signature" hint="Send the invoice and its document to the buyer's mailbox; the signature comes back to yours. A financier only looks at an invoice the buyer signed.">
      <Field label="Buyer's contact card" area placeholder="jitsuin-contact-v1:…" help="From the buyer. Compare its key fingerprint with the buyer before you send." inputRef={contact} />
      <FileField label="Invoice document (PDF)" help="The same file you created the invoice with; its hash must match. Sent sealed, only the buyer can open it." inputRef={pdf} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const buyer = await takeContact(value(contact), "buyer");
              const file = pdf.current!.files?.[0];
              if (!file) throw new Error("choose the invoice document");
              const terms = json<{ terms_hash: string }>(wasm.invoiceDecode(d.invoice)).terms_hash;
              if ((await fileHash(file)) !== terms) throw new Error("this PDF is not the invoice document: its hash differs from the invoice");
              const files = [{ name: file.name.endsWith(".pdf") ? file.name : `${d.invoice_id}.pdf`, mime: "application/pdf" as const, bytes: new Uint8Array(await file.arrayBuffer()) }];
              const me = myIdentity();
              const header = signInWasm(
                draft("invoice.sign_request", { role: "supplier", mailbox_pk: me.mailbox_pk }, buyer.mailbox_pk, relayDeps, { n: d.n, body: { invoice: d.invoice }, attachments: await describeFiles(files) }),
                d.supplier_pk,
                await secretFor(d),
                relayDeps,
              );
              await send(buyer.mailbox_pk, await encodeMessage(header, files), relayDeps);
              await save({ ...d, sign_request: { to: buyer.mailbox_pk, at: Date.now() } });
              refresh();
            } catch (e) {
              sendOut.error(e);
            }
          }}
        >
          Send to the buyer
        </Button>
      </Actions>
      {sendOut.el}
      <p className="sp-or">Or paste a signature the buyer gave you another way; it is checked in your browser.</p>
      <Field label="Buyer signature" placeholder="128 hex characters from the buyer's screen" inputRef={sig} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const s = value(sig).toLowerCase();
              if (!/^[0-9a-f]{128}$/.test(s)) throw new Error("expected 128 hex characters");
              wasm.bundleBuild(JSON.stringify({ invoice: d.invoice, buyer_signature: s }));
              await save({ ...d, buyer_signature: s });
              didIt(d, "照", "Buyer's signature checked", "The buyer's key for this invoice signed exactly these bytes. Next: offer it to one financier.");
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Check signature
        </Button>
      </Actions>
      {out.el}
    </Work>
  );
}

/** The signed financier directory, checked against the provider key and ranked for `d`. */
async function findFinanciers(d: SupplierDeal): Promise<Fit[]> {
  const r = await fetch("/directory.json", { credentials: "same-origin", cache: "no-cache" });
  if (!r.ok) throw new Error(`the directory answered ${r.status}`);
  const dir = (await r.json()) as Directory;
  if (!(await verifyDirectory(dir, PROVIDER.signer_pk))) throw new Error("its signature is not the node provider's");
  const today = Math.floor(Date.now() / 86_400_000);
  return rank(dir.financiers, d.amount_zat, Math.max(0, d.due_date - today));
}

/** T5: offer the invoice to one financier, with a fresh shielded address for this deal. */
function OfferWork({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const contact = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const fin = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const adv = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const addr = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  // HNK-30.T20 (D-47): the financiers that chose to be listed, matched to this invoice here, in
  // the browser. Picking one fills its contact card and key; nothing about the invoice is sent.
  const [fits, setFits] = useState<Fit[] | string | null>(null);
  useEffect(() => {
    if (d.offer) return;
    void findFinanciers(d).then(setFits, (e) => setFits(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (d.offer) {
    const facts = (
      <Kv
        rows={[
          ["Financier key", d.offer.financier_pk, true],
          ["Advance asked", `${zatToZec(d.offer.advance_zat)} ZEC`],
          ["Your address for the advance", d.offer.supplier_address, true],
        ]}
      />
    );
    const hint = "Offer this invoice to one financier only. A second offer gets caught on the board.";
    if (d.offer.sent) {
      return (
        <Work glyph="署" step="Step 2" title="Offer sent" hint={hint}>
          <Banner kind="ok" title="In the financier's mailbox" text={`Sealed and signed on ${when(d.offer.sent.at)}. The financier's node checks your signature and the buyer's before it answers.`} />
          {facts}
        </Work>
      );
    }
    const code = encodeOffer({ invoice: d.invoice, buyer_signature: d.buyer_signature!, ...d.offer });
    return (
      <Work glyph="署" step="Step 2" title="Offer sent" hint={hint}>
        {facts}
        <CodeBlock label="Offer code: send it to the financier" value={code} filename={`${d.invoice_id}.offer.txt`} />
      </Work>
    );
  }
  const finder =
    fits === null ? (
      <p className="fd-k">Reading the financier directory…</p>
    ) : typeof fits === "string" ? (
      <p className="fd-k">{`The directory could not be read (${fits}). Paste a contact card and key instead.`}</p>
    ) : !fits.length ? (
      <p className="fd-k">
        <b lang="ja">名簿</b>No financier is listed in the directory yet. Paste the contact card and key a financier gave you.
      </p>
    ) : (
      <div className="fd">
        <p className="fd-k">
          <b lang="ja">名簿</b>
          {`Financier directory, matched to this invoice in your browser (${fits.filter((f) => f.fits).length} of ${fits.length} fit)`}
        </p>
        <ol className="fd-list">
          {fits.map((f) => {
            const m = f.listing.mandate;
            return (
              <li key={f.listing.financier_pk} className={f.fits ? "fd-row is-fit" : "fd-row"}>
                <span className="fd-mark" lang="ja" aria-hidden="true">
                  {f.fits ? "適" : "否"}
                </span>
                <strong>{f.listing.name}</strong>
                <button
                  type="button"
                  className="sp-pill"
                  onClick={() => {
                    contact.current!.value = f.listing.contact;
                    fin.current!.value = f.listing.financier_pk;
                    adv.current!.focus();
                  }}
                >
                  Offer to this financier
                </button>
                <span className="fd-m">{`${zatToZec(m.min_zat)} – ${zatToZec(m.max_zat)} ZEC · up to ${m.max_tenor_days} days${m.buyer_kyc ? " · buyers it knows from KYC" : ""}`}</span>
                <span className="fd-why">{f.fits ? "Fits this invoice." : f.misses.join("; ")}</span>
                <span className={f.listing.reputation ? "fd-rep is-attested" : "fd-rep"}>
                  <b lang="ja" aria-hidden="true">
                    績
                  </b>
                  {recordLine(f.listing)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  return (
    <Work glyph="署" step="Step 2" title="Offer it to one financier" hint="Your offer goes sealed to the financier's mailbox, signed with this invoice's key. The financier checks the board for this invoice, then asks you for the board entry.">
      {/* HNK-26.T6: the last financier that declined; the invoice was never on the board, so it is free */}
      {d.declined?.length ? <Banner kind="warn" title="Declined" text={`${d.declined[d.declined.length - 1].reason} Offer it to another financier.`} /> : null}
      {finder}
      <Field label="Financier's contact card" area placeholder="jitsuin-contact-v1:…" help="From the financier's console, under For suppliers." inputRef={contact} />
      <Field label="Financier key" placeholder="64 hex characters from the same place" help="Checked against the card's fingerprint before anything is sent." inputRef={fin} />
      <div className="sp-row2">
        <Field label="Advance you ask (ZEC)" type="number" placeholder="0.00038" inputRef={adv} />
        <Field label="Your shielded address for this deal" placeholder={NET.addressHint} help="Use a new address for every deal, so deals cannot be linked by address." inputRef={addr} />
      </div>
      <Actions>
        <Button
          onClick={async () => {
            try {
              const advanceZat = zecToZat(value(adv));
              if (advanceZat > d.amount_zat) throw new Error("the advance cannot be more than the invoice amount");
              if (!looksShielded(value(addr))) throw new Error(`use a shielded ${NET.noun} address (${NET.addressHint})`);
              const financierPk = hex64(value(fin), "financier key");
              const c = await takeContact(value(contact), "financier");
              if ((await financierFingerprint(financierPk)) !== c.fingerprint) throw new Error("this key does not belong to that contact card: ask the financier again");
              const offer = { financier_pk: financierPk, advance_zat: advanceZat, supplier_address: value(addr) };
              const me = myIdentity();
              const header = signInWasm(
                draft("deal.offer", { role: "supplier", mailbox_pk: me.mailbox_pk }, c.mailbox_pk, relayDeps, {
                  n: d.n,
                  // the buyer's mailbox (from the sign request) lets the node send the letter there too
                  body: { invoice: d.invoice, buyer_signature: d.buyer_signature!, advance_zat: offer.advance_zat, supplier_address: offer.supplier_address, ...(d.sign_request ? { buyer_mailbox_pk: d.sign_request.to } : {}) },
                }),
                d.supplier_pk,
                await secretFor(d),
                relayDeps,
              );
              await send(c.mailbox_pk, await encodeMessage(header, []), relayDeps);
              const at = Date.now();
              await save({ ...d, offer: { ...offer, sent: { to: c.mailbox_pk, at } } });
              didIt(d, "署", "Offer sent: in the financier's mailbox", `Sealed and signed on ${when(at)}, asking ${zatToZec(advanceZat)} ZEC. The financier's node checks your signature and the buyer's, then asks you for the board entry.`);
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Send offer
        </Button>
      </Actions>
      {out.el}
    </Work>
  );
}

/** T6: wait for the financier's entry request (SEQ-03 part 4), then sign the board entry for it. */
function EntryWork({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const out = useOut();
  const code = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const share = useRef<HTMLInputElement>(null);
  if (d.entry) {
    return (
      <Work glyph="登" step="Step 3" title="Board entry signed" hint="The financier posts it to the board. The first valid entry for N wins.">
        <Kv
          rows={[
            ["Commitment", d.entry.commitment, true],
            ["Public index classes", d.entry.discount === 0 && d.entry.tenor === 0 ? "not disclosed" : `${d.entry.discount} / ${d.entry.tenor}`],
            ["Buyer history tag", d.entry.tagged ? "yes" : "no"],
          ]}
        />
        <CodeBlock label="Entry: send it to the financier" value={d.entry.memo} filename={`${d.invoice_id}.entry.txt`} />
        {d.entry.sent ? <Banner kind="ok" title="Sent to the financier's node" text={`On ${when(d.entry.sent)}. It posts the entry to the board.`} /> : null}
      </Work>
    );
  }
  const req = d.entry_request;
  if (!req) {
    return (
      <Work glyph="登" step="Step 3" title="Wait for the entry request" hint="The financier asks for the board entry only after it has checked the board for this invoice (and the buyer's history, if it needs it). Nothing to sign before that.">
        <Field label="Entry request code (from the financier)" area placeholder="jitsuin-entry-request-v1:…" help="It usually arrives in your mailbox on its own, as a letter: “Entry request”." inputRef={code} />
        <Actions>
          <Button
            onClick={async () => {
              try {
                const r = decodeEntryRequest(value(code));
                const problems = entryRequestProblems(d, r);
                if (problems.length) {
                  out.show(<Banner kind="bad" title="Not for this deal" text={problems.join("; ") + "."} />);
                  return;
                }
                await save({ ...d, entry_request: r });
                didIt(d, "登", "Entry request read", "It is for this invoice, from the financier you offered it to. Sign the board entry below.");
                refresh();
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Read request
          </Button>
        </Actions>
        {out.el}
      </Work>
    );
  }
  const classes = req.discount === undefined ? "none" : `${req.discount} / ${req.tenor}`;
  return (
    <Work glyph="登" step="Step 3" title="Sign the board entry" hint="The financier checked the board and asks for your entry. The entry commits to that financier without naming it.">
      <Kv
        rows={[
          ["Financier", req.financier_pk, true],
          ["Commitment salt", req.salt, true],
          ["Classes from the financier (discount / tenor)", classes],
          ["Buyer history tag", req.history_tag ?? "none", req.history_tag !== undefined],
        ]}
      />
      {/* Classes stay out of the public rate index unless the supplier opts in (D-42, W-14): anyone
          holding this invoice can find the entry by N and read them. */}
      {req.discount === undefined ? null : (
        <label className="field is-check">
          <input type="checkbox" ref={share} />
          <span>Add this deal's classes to the public rate index</span>
          <small>Off by default. Anyone who holds this invoice, such as the buyer or a financier you showed it to, can then read your discount class on the board.</small>
        </label>
      )}
      <Actions>
        <Button
          onClick={async () => {
            try {
              const [disc, ten] = share.current?.checked ? [req.discount, req.tenor] : [undefined, undefined];
              const r = json<{ memo: string; commitment: string }>(
                req.history_tag
                  ? wasm.supplierRegisterTaggedEntryBytes(await secretFor(d), d.invoice, req.financier_pk, req.salt, req.history_tag, disc, ten)
                  : wasm.supplierRegisterEntryBytes(await secretFor(d), d.invoice, req.financier_pk, req.salt, disc, ten),
              );
              const entry = { memo: r.memo, commitment: r.commitment, tagged: req.history_tag !== undefined, discount: disc ?? 0, tenor: ten ?? 0 };
              await save({ ...d, entry });
              didIt(d, "登", "Board entry signed", "Send the entry code under 登 to the financier: its node posts it to the board.");
              // HNK-26.T16: straight to the financier's node, which posts it to the board
              if (d.offer?.sent) {
                const hd = draft("deal.entry", { role: "supplier", mailbox_pk: myIdentity().mailbox_pk }, d.offer.sent.to, relayDeps, { n: d.n, body: { memo: r.memo } });
                await send(d.offer.sent.to, await encodeMessage(hd as Header), relayDeps);
                const at = Date.now();
                await save({ ...d, entry: { ...entry, sent: at } });
                didIt(d, "登", "Entry signed and sent to the financier's node", `On ${when(at)}. The node posts it to the board; the first valid entry for N wins. The assignment letter comes next.`);
              }
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Sign entry
        </Button>
      </Actions>
      {out.el}
    </Work>
  );
}

interface LetterFields {
  nullifier: string;
  amount_zat: number;
  due_date: number;
  financier_pk: string;
  financier_address: string;
  terms_hash: string;
  matches_invoice: boolean | null;
}

/** T7: read the assignment letter, check its PDF, then seal it. */
function SealWork({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const letter = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const out = useOut();
  if (d.seal) {
    return (
      <Work glyph="印" step="Step 4" title="Letter sealed" hint="Send your seal to the buyer and the financier. The buyer seals next; the financier's seal arrives with the advance.">
        <CodeBlock label="Your seal (s0)" value={d.seal.s0} filename={`${d.invoice_id}.supplier.seal.txt`} />
        {d.seal.sent ? <Banner kind="ok" title="Sent to the buyer and the financier" text={`On ${when(d.seal.sent)}.`} /> : null}
      </Work>
    );
  }
  const sealIt = (code: string) => async () => {
    try {
      const s0 = wasm.supplierSealAssignmentBytes(await secretFor(d), d.invoice, code);
      await save({ ...d, seal: { letter: code, s0 } });
      // HNK-26.T16: the seal goes to the buyer (who seals next) and the financier
      const to = [d.offer?.sent?.to, d.sign_request?.to].filter((x): x is string => !!x);
      for (const t of to) {
        const hd = draft("deal.seal", { role: "supplier", mailbox_pk: myIdentity().mailbox_pk }, t, relayDeps, { n: d.n, body: { seal: s0, index: 0 } });
        await send(t, await encodeMessage(hd as Header), relayDeps);
      }
      const at = Date.now();
      if (to.length) await save({ ...d, seal: { letter: code, s0, sent: at } });
      didIt(
        d,
        "印",
        to.length ? "Letter sealed and sent" : "Letter sealed",
        to.length ? `Your seal went to the buyer and the financier on ${when(at)}. The buyer seals next; the financier's seal arrives with the advance.` : "Send your seal under 印 to the buyer and the financier.",
      );
      refresh();
    } catch (e) {
      out.error(e);
    }
  };
  return (
    <Work glyph="印" step="Step 4" title="Read and seal the assignment letter" hint="The letter assigns this invoice to the financier and names where the buyer pays. Read it before you seal: your seal says you agree.">
      <Field label="Assignment letter code (from the financier)" area value={d.letter_in?.letter} inputRef={letter} />
      <FileField label="Assignment letter document (PDF)" help={d.letter_in ? "Already here: it came sealed with the letter. Hashed in your browser and compared with the letter." : "Hashed in your browser and compared with the letter. Never uploaded."} inputRef={pdf} />
      <Actions>
        <Button
          onClick={async () => {
            try {
              const code = value(letter);
              const f = json<LetterFields>(wasm.assignmentDecode(code, d.invoice));
              const arrived = d.letter_in && d.letter_in.letter === code ? new File([b64ToBytes(d.letter_in.pdf)], "letter.pdf", { type: "application/pdf" }) : undefined;
              const file = pdf.current!.files?.[0] ?? arrived;
              const pdfOk = file ? (await fileHash(file)) === f.terms_hash : false;
              const finOk = f.financier_pk === d.offer!.financier_pk;
              const ok = f.matches_invoice === true && pdfOk && finOk;
              const problems = [
                f.matches_invoice === true ? null : "the letter is for another invoice (N, amount or due date differ)",
                finOk ? null : "the letter names another financier than the one you offered to",
                file ? (pdfOk ? null : "the PDF is not the letter's document") : "choose the letter's PDF",
              ].filter((p): p is string => p !== null);
              const fields = (
                <Kv
                  rows={[
                    ["Financier", f.financier_pk, true],
                    ["Buyer pays to", f.financier_address, true],
                    ["Amount the buyer pays", `${zatToZec(f.amount_zat)} ZEC`],
                    ["Due", daysToDate(f.due_date)],
                    ["Letter document hash", f.terms_hash, true],
                  ]}
                />
              );
              if (!ok) {
                out.show(
                  <>
                    {fields}
                    <Banner kind="bad" title="Do not seal" text={problems.join("; ") + "."} />
                  </>,
                );
                return;
              }
              out.show(
                <>
                  {fields}
                  <Banner kind="ok" title="Letter checks out" text="Same invoice, same financier, and the PDF is the letter's document." />
                  <Actions>
                    <Button onClick={sealIt(code)}>Seal as supplier</Button>
                  </Actions>
                </>,
              );
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Check letter
        </Button>
      </Actions>
      {out.el}
    </Work>
  );
}

/** T8: compare the advance received with the advance agreed in the offer. */
function AdvanceWork({ d, refresh }: { d: SupplierDeal; refresh: Refresh }): ReactNode {
  const txid = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const got = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  const agreed = d.offer!.advance_zat;
  if (d.advance?.matches) {
    return (
      <Work glyph="金" step="Step 5" title="Advance received" hint="Matches the advance you asked for.">
        <Kv
          rows={[
            ["Transaction", d.advance.txid, true],
            ["Received", `${zatToZec(d.advance.received_zat)} ZEC`],
          ]}
        />
      </Work>
    );
  }
  return (
    <Work glyph="金" step="Step 5" title="Check the advance" hint={`You asked for ${zatToZec(agreed)} ZEC. Compare with what your wallet received in that transaction. The full check (receipt and the financier's seal in the same memo) runs with jitsuin on your own wallet.`}>
      <Field label="Advance transaction id" placeholder="64 hex characters, from the financier or your wallet" value={d.advance_notice?.txid} inputRef={txid} />
      <Field label="Amount your wallet received (ZEC)" type="number" placeholder={zatToZec(agreed)} inputRef={got} />
      {d.advance && !d.advance.matches ? <Banner kind="bad" title="Advance differs" text={`Received ${zatToZec(d.advance.received_zat)} ZEC instead of ${zatToZec(agreed)} ZEC.`} /> : null}
      <Actions>
        <Button
          onClick={async () => {
            try {
              const receivedZat = zecToZat(value(got));
              const tx = hex64(value(txid), "transaction id");
              await save({ ...d, advance: { txid: tx, received_zat: receivedZat, matches: receivedZat === agreed } });
              if (receivedZat === agreed) didIt(d, "金", "Advance received as agreed", `${zatToZec(receivedZat)} ZEC in ${short(tx)}. The buyer pays the financier at maturity, due ${daysToDate(d.due_date)}; the settlement bundle arrives in your mailbox then.`);
              refresh();
            } catch (e) {
              out.error(e);
            }
          }}
        >
          Record advance
        </Button>
      </Actions>
      {out.el}
    </Work>
  );
}
