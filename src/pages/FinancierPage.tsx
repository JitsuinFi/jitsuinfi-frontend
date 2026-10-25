// Financier screen (HNK-05.T5 layout, HNK-05.T4 integration for the parts the browser does):
// write the assignment letter, check the buyer's history, assemble the verification bundle.
// Registering on the board and the Sign-to-Pay advance run in the financier's backend wallet.
// The real financier works from its node's console (HNK-26); this simulation stays reachable by
// address only, not in the navigation. React since HNK-31.T10; drawn after the approved sample
// design-samples/internal/financier.html since HNK-34.T5: the letter is a 債権譲渡通知書 whose
// fields are its blanks and whose code slides out from under it, the history is a chain of
// certificates anchored to the public board with a 認/滞 stamp, and the bundle gathers its
// documents under one clip until a JTSB band seals it. Every value comes from jitsuin-wasm.
import { useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { Page } from "../app/AppShell";
import { explain } from "../lib/explain";
import { download } from "../lib/download";
import { fileHash, json, today, wasm } from "../lib/core";
import { chainLinks, historyVerdict, type HistoryResult } from "../lib/financier-history";
import { NET } from "../lib/network";
import { reducedMotion } from "../landing/motion";
import "./financier.css";

type Area = HTMLInputElement & HTMLTextAreaElement;

const CONSOLE_URL = "https://jitsuinfi-console-demo.vercel.app/console";

/** A refusal: what happened in a sentence; the crate's own words stay for support (HNK-21.T9). */
interface Refusal {
  said: string;
  raw?: string;
}
function refusal(e: unknown): Refusal {
  const msg = e instanceof Error ? e.message : String(e);
  const said = explain(msg);
  return { said, raw: said !== msg ? msg : undefined };
}

function Refused({ r }: { r: Refusal | null }): ReactNode {
  if (!r) return null;
  return (
    <p className="fi-err" role="alert">
      <span className="fi-err-k" lang="ja" aria-hidden="true">
        拒
      </span>
      <span>
        <b>Refused</b> {r.said}
        {r.raw ? <small>{r.raw}</small> : null}
      </span>
    </p>
  );
}

/** CSS custom properties through the CSSOM (CSP-safe): `data-v="--name:value;…"` under `root`. */
function useVars(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>("[data-v]").forEach((el) => {
      for (const pair of el.dataset.v!.split(";")) {
        const at = pair.indexOf(":");
        if (at > 0) el.style.setProperty(pair.slice(0, at), pair.slice(at + 1));
      }
    });
  });
}

/** Copy and Download under a code that came out of wasm. */
function CodeSlip({ title, value, filename, children }: { title: string; value: string; filename: string; children?: ReactNode }): ReactNode {
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  return (
    <div className={`fi-slip${reducedMotion() ? "" : " is-in"}`}>
      <b>{title}</b>
      <p className="fi-code">{value}</p>
      <div className="fi-actions">
        <button
          className="fi-btn-q"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied("ok");
            } catch {
              setCopied("fail");
            }
            setTimeout(() => setCopied(""), 1400);
          }}
        >
          {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed: select the code" : "Copy"}
        </button>
        <button className="fi-btn-q" type="button" onClick={() => download(filename, value)}>
          {`Download ${filename}`}
        </button>
        {children}
      </div>
    </div>
  );
}

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 12)}…${s.slice(-6)}` : s);

export function FinancierPage(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  useVars(root);
  const v = (r: { current: Area | null }) => r.current!.value.trim();

  // 一 the letter
  const aInvoice = useRef<Area>(null);
  const aKey = useRef<Area>(null);
  const aAddress = useRef<Area>(null);
  const aTerms = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<{ name: string; hash?: string } | null>(null);
  const [letter, setLetter] = useState<{ code: string; run: number } | null>(null);
  const [aErr, setAErr] = useState<Refusal | null>(null);
  const [aBusy, setABusy] = useState(false);

  // 二 the history
  const hCerts = useRef<Area>(null);
  const hIdentity = useRef<Area>(null);
  const hAllow = useRef<Area>(null);
  const hBoard = useRef<HTMLInputElement>(null);
  const [boardName, setBoardName] = useState<string | null>(null);
  const [grace, setGrace] = useState("7");
  const [hist, setHist] = useState<{ r: HistoryResult; run: number } | null>(null);
  const [hErr, setHErr] = useState<Refusal | null>(null);
  const [hBusy, setHBusy] = useState(false);

  // 三 the bundle
  const bInvoice = useRef<Area>(null);
  const bSig = useRef<Area>(null);
  const bLetter = useRef<Area>(null);
  const bSeals = useRef<Area>(null);
  const bSettle = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState({ invoice: "", sig: "", letter: false, seals: 0, settle: false });
  const [bundle, setBundle] = useState<{ code: string; run: number } | null>(null);
  const [bErr, setBErr] = useState<Refusal | null>(null);

  const runs = useRef(0);
  const syncDocs = () =>
    setDocs({
      invoice: v(bInvoice),
      sig: v(bSig),
      letter: v(bLetter).length > 0,
      seals: v(bSeals).split(/\s+/).filter(Boolean).length,
      settle: bSettle.current!.checked,
    });

  const createLetter = async (e: FormEvent) => {
    e.preventDefault();
    setABusy(true);
    try {
      const file = aTerms.current!.files?.[0];
      if (!file) throw new Error("choose the letter document");
      const code = wasm.assignmentEncode(v(aInvoice), v(aKey), v(aAddress), await fileHash(file));
      setLetter({ code, run: ++runs.current });
      setAErr(null);
    } catch (err) {
      setLetter(null);
      setAErr(refusal(err));
    } finally {
      setABusy(false);
    }
  };

  const checkHistory = async (e: FormEvent) => {
    e.preventDefault();
    setHBusy(true);
    try {
      const board = await hBoard.current!.files?.[0]?.text();
      if (!board) throw new Error("choose the board data file");
      const lines = (s: string) => s.split(/\s+/).filter(Boolean);
      const r = json<HistoryResult>(wasm.verifyHistory(JSON.stringify(lines(v(hCerts))), v(hIdentity), JSON.stringify(lines(v(hAllow))), board, today(), Number(grace.trim())));
      setHist({ r, run: ++runs.current });
      setHErr(null);
    } catch (err) {
      setHist(null);
      setHErr(refusal(err));
    } finally {
      setHBusy(false);
    }
  };

  const buildBundle = (e: FormEvent) => {
    e.preventDefault();
    try {
      const code = wasm.bundleBuild(
        JSON.stringify({
          invoice: v(bInvoice),
          buyer_signature: v(bSig),
          assignment: v(bLetter) || undefined,
          seals: v(bSeals).split(/\s+/).filter(Boolean),
          with_settlement: bSettle.current!.checked,
        }),
      );
      setBundle({ code, run: ++runs.current });
      setBErr(null);
    } catch (err) {
      setBundle(null);
      setBErr(refusal(err));
    }
  };

  // the contents list scrolls in the page (no hash, so the router keeps the address)
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const links = hist ? chainLinks(hist.r) : [];
  const verdict = hist ? historyVerdict(hist.r) : null;
  const last = links.length ? links[links.length - 1].n : null;
  const moving = !reducedMotion();

  const stackDocs: Array<{ n: number; glyph: string; title: string; sub: string; need: string; on: boolean }> = [
    { n: 4, glyph: "済", title: "Settlement document", sub: "from the node's settlement", need: "optional", on: docs.settle },
    { n: 3, glyph: "印", title: "Letter seals", sub: docs.seals ? `${docs.seals} of 3: supplier · buyer · financier` : "supplier · buyer · financier", need: "optional", on: docs.seals > 0 },
    { n: 2, glyph: "譲", title: "Assignment letter", sub: "債権譲渡通知書", need: "optional", on: docs.letter },
    { n: 1, glyph: "買", title: "Buyer signature", sub: docs.sig ? short(docs.sig) : "128 hex characters", need: "required", on: docs.sig.length > 0 },
    { n: 0, glyph: "請", title: "Signed invoice", sub: docs.invoice ? short(docs.invoice) : "the invoice code", need: "required", on: docs.invoice.length > 0 },
  ];

  return (
    <Page wide>
      <div className="fi" ref={root}>
        {/* ============================================================ 一 the letter */}
        <section className="fi-sec" id="fi-letter" aria-labelledby="fi-t">
          <div className="fi-cap">
            <p className="fi-eyebrow">
              <span className="fi-stamp" lang="ja" aria-hidden="true">
                証
              </span>
              Financier, in your browser
            </p>
            <h1 id="fi-t">Financier</h1>
            <p className="fi-lede">Finance invoices that are provably not financed elsewhere, to buyers whose full history you can check.</p>
            <div className="fi-warn" role="note">
              <i lang="ja" aria-hidden="true">
                節
              </i>
              <b>Runs in your backend wallet</b>
              <p>Board registration, waiting for confirmation, the Sign-to-Pay advance and the repayment watchdog need your shielded wallet. They run in the financier backend (jitsuin-flow); this page covers what the browser verifies.</p>
            </div>
            <ol className="fi-toc" aria-label="On this page">
              <li>
                <a href="#fi-letter" onClick={jump("fi-letter")}>
                  <i lang="ja">一</i>
                  <strong>Write the assignment letter</strong>
                  <small>Deal</small>
                </a>
              </li>
              <li>
                <a href="#fi-hist" onClick={jump("fi-hist")}>
                  <i lang="ja">二</i>
                  <strong>Check the buyer's history</strong>
                  <small>Before you finance</small>
                </a>
              </li>
              <li>
                <a href="#fi-bun" onClick={jump("fi-bun")}>
                  <i lang="ja">三</i>
                  <strong>Verification bundle</strong>
                  <small>Evidence</small>
                </a>
              </li>
            </ol>
            <p className="fi-hint">
              {"A real financier works from its node's console, where none of this needs a terminal. "}
              <a className="fi-link" href={CONSOLE_URL} target="_blank" rel="noopener">
                Try the financier console
              </a>
            </p>
          </div>

          <div className="fi-desk">
            <div className="fi-under" aria-hidden="true">
              <div>
                <b lang="ja">請求書</b>
                <span>The invoice you finance</span>
              </div>
              <i lang="ja">買</i>
            </div>
            <form className="fi-letter" aria-label="Write the assignment letter" onSubmit={createLetter} noValidate>
              <div className="fi-l-head">
                <div>
                  <b lang="ja">債権譲渡通知書</b>
                  <span>Assignment letter</span>
                </div>
                <p>After your board entry is confirmed, send this letter to the supplier and the buyer.</p>
              </div>
              <div className="fi-blank">
                <label htmlFor="fi-a-inv">
                  <span lang="ja">請求書</span>
                  <span>Invoice code</span>
                </label>
                <textarea id="fi-a-inv" spellCheck="false" placeholder="JTSI…, the code the supplier sent you" ref={aInvoice} />
              </div>
              <div className="fi-blank">
                <label htmlFor="fi-a-key">
                  <span lang="ja">譲受人の鍵</span>
                  <span>Your financier key</span>
                </label>
                <input id="fi-a-key" type="text" placeholder="64 hex characters" spellCheck="false" autoComplete="off" ref={aKey} />
              </div>
              <div className="fi-blank">
                <label htmlFor="fi-a-addr">
                  <span lang="ja">支払先</span>
                  <span>Your shielded pay address</span>
                </label>
                <input id="fi-a-addr" type="text" placeholder={NET.addressHint} spellCheck="false" autoComplete="off" aria-describedby="fi-a-addr-h" ref={aAddress} />
                <small id="fi-a-addr-h">The buyer pays here at maturity.</small>
              </div>
              <div className="fi-blank">
                <span className="fi-lab" id="fi-a-pdf-l">
                  <span lang="ja">添付</span>
                  <span>Letter document (PDF)</span>
                </span>
                <div className="fi-file">
                  <input
                    type="file"
                    id="fi-a-pdf"
                    accept="application/pdf,.pdf"
                    aria-labelledby="fi-a-pdf-l"
                    aria-describedby="fi-a-hash"
                    ref={aTerms}
                    onChange={async (e) => {
                      const f = e.currentTarget.files?.[0];
                      if (!f) return setPdf(null);
                      setPdf({ name: f.name });
                      try {
                        const hash = await fileHash(f);
                        setPdf((p) => (p?.name === f.name ? { name: f.name, hash } : p));
                      } catch {
                        /* the hash shows again on Create letter */
                      }
                    }}
                  />
                  <label htmlFor="fi-a-pdf">Choose PDF</label>
                  <span>{pdf?.name ?? "No file chosen"}</span>
                </div>
                <small id="fi-a-hash">
                  {pdf?.hash ? (
                    <>
                      {"SHA-256 "}
                      <span className="fi-mono">{`${pdf.hash.slice(0, 26)}…`}</span>
                      {", hashed in your browser; never uploaded."}
                    </>
                  ) : (
                    "Hashed in your browser with SHA-256; never uploaded."
                  )}
                </small>
              </div>
              <div className="fi-l-foot">
                <div className="fi-actions">
                  <button className="fi-btn" type="submit" disabled={aBusy}>
                    Create letter
                  </button>
                </div>
                <div className="fi-seals" role="list" aria-label="Who seals this letter">
                  <div className="fi-sbox" role="listitem">
                    <span className="fi-sk" lang="ja">
                      譲渡人
                    </span>
                    <i lang="ja" aria-hidden="true">
                      売
                    </i>
                    Supplier seals
                  </div>
                  <div className="fi-sbox" role="listitem">
                    <span className="fi-sk" lang="ja">
                      債務者
                    </span>
                    <i lang="ja" aria-hidden="true">
                      買
                    </i>
                    Buyer seals
                  </div>
                  <div className="fi-sbox is-yours" role="listitem">
                    <span className="fi-sk" lang="ja">
                      譲受人
                    </span>
                    <i lang="ja" aria-hidden="true">
                      証
                    </i>
                    Yours, with the money
                  </div>
                </div>
              </div>
              <p className="fi-note">Your backend pays the advance only once both have sealed it, and your seal travels with the money.</p>
              <Refused r={aErr} />
            </form>
            {letter ? <CodeSlip key={letter.run} title="Assignment letter code: send it to the supplier and the buyer" value={letter.code} filename="assignment.letter.txt" /> : null}
          </div>
        </section>

        {/* ============================================================ 二 the history */}
        <section className="fi-sec" id="fi-hist" aria-labelledby="fi-t-hist">
          <div className="fi-cap">
            <p className="fi-eyebrow">
              <span className="fi-stamp" lang="ja" aria-hidden="true">
                歴
              </span>
              Before you finance
            </p>
            <h2 id="fi-t-hist">Check the buyer's history</h2>
            <p className="fi-lede">Your browser checks the chain against the board itself: every past invoice must be anchored, nothing may follow the last one, and defaults show up as unsettled entries past due.</p>
          </div>
          <div className="fi-hist">
            <form className="fi-panel" aria-label="The buyer's history" onSubmit={checkHistory} noValidate>
              <label className="fi-field">
                <span>Buyer's history certificates</span>
                <textarea spellCheck="false" ref={hCerts} />
                <small>One certificate per line, from #0 up.</small>
              </label>
              <label className="fi-field">
                <span>Buyer identity key</span>
                <input type="text" placeholder="64 hex characters" spellCheck="false" autoComplete="off" ref={hIdentity} />
              </label>
              <label className="fi-field">
                <span>Registered financiers (allowlist)</span>
                <textarea spellCheck="false" rows={2} ref={hAllow} />
                <small>One financier key per line.</small>
              </label>
              <div className="fi-field">
                <span id="fi-h-board-l">Board data (JSON from the backend)</span>
                <div className="fi-file">
                  <input type="file" id="fi-h-board" accept=".json,application/json" aria-labelledby="fi-h-board-l" ref={hBoard} onChange={(e) => setBoardName(e.currentTarget.files?.[0]?.name ?? null)} />
                  <label htmlFor="fi-h-board">Choose file</label>
                  <span>{boardName ?? "No file chosen"}</span>
                </div>
                <small>{"List of {txid, height, tx_index, output_index, memo}."}</small>
              </div>
              <div className="fi-field">
                <label htmlFor="fi-h-grace">Grace days</label>
                <div className="fi-stepper">
                  <button type="button" aria-label="Fewer days" onClick={() => setGrace(String(Math.max(0, (Number(grace) || 0) - 1)))}>
                    −
                  </button>
                  <input id="fi-h-grace" type="number" min={0} step={1} inputMode="numeric" value={grace} onChange={(e) => setGrace(e.currentTarget.value)} />
                  <button type="button" aria-label="More days" onClick={() => setGrace(String((Number(grace) || 0) + 1))}>
                    +
                  </button>
                </div>
              </div>
              <div className="fi-actions">
                <button className="fi-btn" type="submit" disabled={hBusy}>
                  Check history
                </button>
              </div>
              <Refused r={hErr} />
            </form>

            <div className="fi-chain-w" aria-live="polite">
              <div className="fi-verdict">
                <span
                  key={hist?.run ?? 0}
                  className={`fi-hanko${verdict ? (verdict.bad ? " is-bad" : "") : " is-wait"}${verdict && moving ? " is-slam" : ""}`}
                  lang="ja"
                  aria-hidden="true"
                  data-v={`--n:${links.length}`}
                >
                  {verdict ? verdict.glyph : "待"}
                </span>
                <h3>{verdict ? verdict.title : "Not checked yet"}</h3>
                <p>{verdict ? verdict.text : "Add the certificates, keys and board data, then check: the counts and the chain appear here."}</p>
              </div>
              <dl className="fi-counts">
                <div className="c-ok">
                  <dt>Paid on time</dt>
                  <dd>
                    <span>{hist ? hist.r.on_time : "–"}</span>
                    <i lang="ja" aria-hidden="true">
                      適
                    </i>
                  </dd>
                </div>
                <div className="c-late">
                  <dt>Paid late</dt>
                  <dd>
                    <span>{hist ? hist.r.late : "–"}</span>
                    <i lang="ja" aria-hidden="true">
                      遅
                    </i>
                  </dd>
                </div>
                <div className={`c-def${hist && hist.r.defaults > 0 ? " is-bad" : ""}`}>
                  <dt>Defaults</dt>
                  <dd>
                    <span>{hist ? hist.r.defaults : "–"}</span>
                    <i lang="ja" aria-hidden="true">
                      滞
                    </i>
                  </dd>
                </div>
                <div className="c-open">
                  <dt>Still open</dt>
                  <dd>
                    <span>{hist ? hist.r.open : "–"}</span>
                    <i lang="ja" aria-hidden="true">
                      開
                    </i>
                  </dd>
                </div>
              </dl>
              <div className="fi-chain">
                {links.length ? (
                  <ol key={hist!.run} className="fi-links" aria-label="Invoice by invoice">
                    {links.map((l, i) => (
                      <li key={l.n} className={`fi-cert${moving ? " is-in" : ""}`} data-o={l.kind} aria-label={l.label} data-v={`--i:${i}`}>
                        <i lang="ja" aria-hidden="true">
                          {l.glyph}
                        </i>
                        <b>{l.n}</b>
                        <span>{l.text}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="fi-chain-empty">Each certificate will hang here, anchored to its entry on the board.</p>
                )}
                <div key={`b${hist?.run ?? 0}`} className={`fi-board${hist && moving ? " is-scan" : ""}`}>
                  <b lang="ja">公開台帳</b>
                  <span>
                    {`${NET.label} board`}
                    {hist ? (
                      <>
                        {" · every certificate anchored"}
                        {last ? (
                          <>
                            {" · nothing after "}
                            <span className="fi-mono">{last}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      " · read from the board data you choose"
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ 三 the bundle */}
        <section className="fi-sec" id="fi-bun" aria-labelledby="fi-t-bun">
          <div className="fi-cap">
            <p className="fi-eyebrow">
              <span className="fi-stamp" lang="ja" aria-hidden="true">
                束
              </span>
              Evidence
            </p>
            <h2 id="fi-t-bun">Verification bundle</h2>
            <p className="fi-lede">One file with the signed invoice, the sealed letter and the settlement document. An auditor or judge verifies it offline, or against the board on the Verify page.</p>
          </div>
          <div className="fi-bun">
            <form className="fi-panel" aria-label="What goes in the bundle" onSubmit={buildBundle} onInput={syncDocs} onChange={syncDocs} noValidate>
              <label className="fi-field">
                <span>Invoice code</span>
                <textarea spellCheck="false" ref={bInvoice} />
              </label>
              <label className="fi-field">
                <span>Buyer signature</span>
                <input type="text" placeholder="128 hex characters" spellCheck="false" autoComplete="off" ref={bSig} />
              </label>
              <label className="fi-field">
                <span>Assignment letter code (optional)</span>
                <textarea spellCheck="false" rows={2} ref={bLetter} />
              </label>
              <label className="fi-field">
                <span>Letter seals (optional)</span>
                <textarea spellCheck="false" rows={3} ref={bSeals} />
                <small>One per line, in order: supplier, buyer, financier.</small>
              </label>
              <label className="fi-check">
                <input type="checkbox" ref={bSettle} /> include the settlement document
              </label>
              <div className="fi-actions">
                <button className="fi-btn" type="submit">
                  Build bundle
                </button>
              </div>
              <Refused r={bErr} />
            </form>
            <div className="fi-bun-vis">
              <div className="fi-stack" aria-hidden="true">
                <span className="fi-clip" />
                {stackDocs.map((d) => (
                  <div key={d.n} className={`fi-doc${d.on ? "" : " is-empty"}`} data-n={d.n}>
                    <i lang="ja">{d.glyph}</i>
                    <b>{d.title}</b>
                    <span>{d.sub}</span>
                    <em>{d.need}</em>
                  </div>
                ))}
                <div key={`o${bundle?.run ?? 0}`} className={`fi-obi${bundle ? " is-on" : ""}${bundle && moving ? " is-wrap" : ""}`}>
                  <b>JTSB</b>Bundle (verified)
                </div>
              </div>
              {bundle ? (
                <CodeSlip key={bundle.run} title="Bundle (verified)" value={bundle.code} filename="deal.bundle.txt">
                  <Link className="fi-link" to="/verify">
                    Check it on the Verify page
                  </Link>
                </CodeSlip>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
