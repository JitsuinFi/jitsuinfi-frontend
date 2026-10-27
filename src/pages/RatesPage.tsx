// Public rate index (HNK-08.T3): "price public, participants private". Recomputes the index from
// board data in the browser with the same rule as `jitsuin index` (wasm `rateIndex`): each invoice
// counts once, with its first entry, and a class is shown only with at least k = 5 invoices.
// React since HNK-31.T6; the tenor × discount chart since HNK-34.T3 (approved sample
// design-samples/internal/rates.html). Every number on the page comes from wasm `rateIndex` over
// the board this page read (live, the last kept, the bundled copy, or the visitor's file).
import { NextRoom } from "../app/NextRoom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Page } from "../app/AppShell";
import { Button, useOut } from "../app/ui";
import { BOARD_COPY, boardLine, loadBoard, type BoardData } from "../lib/board";
import { json, wasm } from "../lib/core";
import { NET } from "../lib/network";
import { classRows, indexRows, summary, type RateIndex, type TenorRow } from "../lib/rate-index";
import { reducedMotion } from "../landing/motion";
import "./rates.css";
import { Lede } from "../app/Lede";

/** "1-2%" → "1–2%", "<= 30 days" → "≤ 30 days", "< 1%" → "<1%": the CLI's labels, typeset. */
const tenorUi = (s: string) => s.replace(/<=\s?/, "≤ ").replace(/(\d)-(\d)/g, "$1–$2");
const discUi = (s: string) => s.replace(/>=\s?/, "≥").replace(/<\s?/, "<").replace(/(\d)-(\d)/g, "$1–$2");

const K_MIN = 5;

interface Result {
  idx: RateIndex;
  /** The board read, or "file" for the visitor's own file. */
  src: BoardData | "file";
  boardJson: string;
  run: number;
  animate: boolean;
}

/**
 * CSS custom properties written through the CSSOM (CSP-safe, no style attributes): every element
 * under `root` with `data-v="--name:value;--other:value"` gets them after each render.
 */
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

function tenorParts(t: TenorRow): string[] {
  const parts = (t.discounts ?? []).map((d) => `${d.label}: ${d.invoices}`);
  if (t.other) parts.push(`other: ${t.other}`);
  return parts;
}

export function RatesPage(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const band = useRef<HTMLElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [k, setK] = useState(K_MIN);
  const [kText, setKText] = useState(String(K_MIN));
  const [res, setRes] = useState<Result | null>(null);
  const [status, setStatus] = useState("Reading the board…");
  const [tip, setTip] = useState<{ title: string; text: string } | null>(null);
  const runs = useRef(0);
  const out = useOut();
  useVars(root);

  // the class definitions do not depend on the board
  const [classes] = useState(() => json<RateIndex>(wasm.rateIndex("[]", K_MIN)).classes);
  const disc = classes.discount_bps;

  const kOf = (v: string | number) => Math.max(K_MIN, Math.floor(Number(String(v).trim()) || K_MIN));

  const run = async () => {
    try {
      setStatus("Reading the board…");
      const text = await file.current?.files?.[0]?.text();
      const b = text === undefined ? await loadBoard((u, i) => fetch(u, i)) : undefined;
      const boardJson = text ?? b!.json;
      const kv = kOf(kText);
      const idx = json<RateIndex>(wasm.rateIndex(boardJson, kv));
      setK(kv);
      setKText(String(kv));
      setRes({ idx, src: b ?? "file", boardJson, run: ++runs.current, animate: true });
      setStatus(`${summary(idx)}.`);
      out.clear();
    } catch (e) {
      setStatus("");
      out.error(e);
    }
  };

  /** A new k recomputes the index from the board already read. */
  const changeK = (v: number) => {
    const kv = kOf(v);
    setK(kv);
    setKText(String(kv));
    if (!res) return;
    try {
      const idx = json<RateIndex>(wasm.rateIndex(res.boardJson, kv));
      setRes({ ...res, idx, animate: false });
      setStatus(`${summary(idx)}.`);
    } catch (e) {
      out.error(e);
    }
  };

  // The page reads the board on arrival.
  useEffect(() => {
    void run();
  }, []);

  // the source band: a light passes along it each time the board is read
  useEffect(() => {
    const el = band.current;
    if (!el || !res?.animate || reducedMotion()) return;
    el.classList.remove("is-scan");
    void el.offsetWidth;
    el.classList.add("is-scan");
  }, [res?.run, res?.animate]);

  // the tooltip leaves with a scroll
  useEffect(() => {
    const off = () => setTip(null);
    addEventListener("scroll", off, { passive: true });
    return () => removeEventListener("scroll", off);
  }, []);
  const showTip = (x: number, y: number, t: { title: string; text: string }) => {
    setTip(t);
    const w = 260;
    tipEl.current?.style.setProperty("transform", `translate(${Math.max(8, Math.min(innerWidth - w - 12, x + 14))}px, ${y + 16}px)`);
  };

  const idx = res?.idx ?? null;
  const tenors = idx?.tenors ?? classes.tenor_days.map((t): TenorRow => ({ tenor: t.class, label: t.label, published: false }));
  // the meter: published · under k · not disclosed (all derivable from the published totals)
  const total = idx?.invoices ?? 0;
  const pub = idx ? idx.tenors.filter((t) => t.published).reduce((s, t) => s + (t.invoices ?? 0), 0) : 0;
  const no = idx ? Math.min(total, idx.undisclosed) : 0;
  const under = Math.max(0, total - no - pub);
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;

  const src = res?.src;
  const line = src === undefined ? null : src === "file" ? null : boardLine(src);
  const tipNo = src && src !== "file" ? String(src.tip) : "";

  return (
    <Page wide>
      <div className="ri" ref={root}>
        <section className="ri-sec" aria-labelledby="ri-t">
          <div className="ri-cap">
            <p className="ri-eyebrow">
              <span className="ri-stamp" lang="ja" aria-hidden="true">
                価
              </span>
              Public rate index
            </p>
            <h1 id="ri-t">Rate index</h1>
            <Lede className="ri-lede">Each board entry carries a discount class and a tenor class (how long until it is due), never an amount or a party. Anyone can recompute the market's prices from the public board; nobody learns who financed whom.</Lede>
            <dl className="ri-totals" aria-label="What the board holds">
              <div>
                <dt>register entries</dt>
                <dd>{idx ? idx.entries : "–"}</dd>
              </div>
              <div>
                <dt>invoices (each counted once, by its first entry)</dt>
                <dd>{idx ? idx.invoices : "–"}</dd>
              </div>
              <div className="is-quiet">
                <dt>not disclosed (entries with 0/0)</dt>
                <dd>{idx ? idx.undisclosed : "–"}</dd>
              </div>
              <div className="is-quiet">
                <dt>invalid</dt>
                <dd>{idx ? idx.invalid : "–"}</dd>
              </div>
            </dl>
            <p className="ri-knote">
              <b>{`At least ${k} per class`}</b>
              <span>{`No single deal's rate shows. Anyone can raise this threshold, k; nobody can lower it below ${K_MIN}.`}</span>
            </p>
          </div>

          <div className="ri-vis">
            <div className="ri-ch-head">
              <h2>Median discount by tenor</h2>
              <Lede className="ri-ch-note">{`One row per tenor class (time from advance to due date), the ${disc.length} discount classes across. Discount is (face − advance) / face.`}</Lede>
            </div>
            <div>
              <div key={res?.run ?? 0} className={`ri-chart${res && !res.animate ? " is-still" : ""}${idx ? "" : " is-waiting"}`} role="group" aria-label="Median discount class for each tenor class" data-v={`--nd:${disc.length}`}>
                <div className="ri-row is-axis" aria-hidden="true" data-v={`--nd:${disc.length}`}>
                  <span>Tenor</span>
                  {disc.map((d) => (
                    <span key={d.class}>{discUi(d.label)}</span>
                  ))}
                  <span>Invoices</span>
                </div>
                {tenors.map((t, i) => {
                  const ui = tenorUi(t.label);
                  const parts = tenorParts(t);
                  const med = t.published ? t.median_discount : undefined;
                  const tipText = !idx
                    ? { title: "reading", text: `${ui} · the board is being read` }
                    : t.published
                      ? { title: `median ${med ? discUi(med.label) : "-"}`, text: `${ui} · ${t.invoices ?? 0} invoices · discount classes: ${parts.join(", ")}` }
                      : { title: "withheld", text: `${ui} · fewer than ${idx.k} invoices, so neither its count nor its rates show` };
                  const aria = !idx ? `${ui}: reading the board` : t.published ? `${ui}: ${t.invoices ?? 0} invoices, median discount ${med?.label ?? "-"}; discount classes ${parts.join(", ")}` : `${ui}: withheld, fewer than ${idx.k} invoices`;
                  return (
                    <div
                      key={t.tenor}
                      className="ri-row"
                      tabIndex={0}
                      aria-label={aria}
                      data-v={`--i:${i};--nd:${disc.length}`}
                      onPointerMove={(e) => showTip(e.clientX, e.clientY, tipText)}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => {
                        const b = e.currentTarget.getBoundingClientRect();
                        showTip(b.left + b.width * 0.45, b.top + b.height * 0.6, tipText);
                      }}
                      onBlur={() => setTip(null)}
                    >
                      <div className="ri-rl">
                        <strong>{ui}</strong>
                        <small>{`tenor ${t.tenor}`}</small>
                      </div>
                      <div className="ri-track">
                        {disc.map((d) => {
                          const n = t.published ? t.discounts?.find((x) => x.class === d.class)?.invoices : undefined;
                          const isMed = med?.class === d.class;
                          return (
                            <span key={d.class} className={`ri-c${isMed ? " is-med" : ""}`}>
                              {n ? <span className="ri-cls" data-v={`--h:${Math.min(40, 6 + n * 3)}px`} /> : null}
                              {isMed ? (
                                <>
                                  <span className="ri-med" />
                                  <span className="ri-med-l">{`median ${discUi(d.label)}`}</span>
                                </>
                              ) : null}
                            </span>
                          );
                        })}
                        {t.published && t.other ? <span className="ri-spread" /> : null}
                        {idx && !t.published ? (
                          <span className="ri-gate">
                            <span>{`withheld · fewer than ${idx.k} invoices`}</span>
                          </span>
                        ) : null}
                      </div>
                      <div className="ri-rn">
                        {t.published ? (
                          <>
                            {t.invoices ?? 0}
                            <small>invoices</small>
                          </>
                        ) : (
                          <small>—</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="ri-axis-t" data-v={`--nd:${disc.length}`}>
                <span>discount class →</span>
              </p>
              <ul className="ri-key" aria-label="Key">
                <li>
                  <i className="k-med" />
                  median discount class of a published tenor
                </li>
                <li>
                  <i className="k-spread" />
                  its invoices whose own class holds fewer than k (“other”)
                </li>
                <li>
                  <i className="k-gate" />
                  withheld: fewer than k invoices in the tenor
                </li>
              </ul>
            </div>

            <div key={`m${res?.run ?? 0}`} className={`ri-meter${res && !res.animate ? " is-still" : ""}`} aria-labelledby="ri-m-h" data-v={`--rows:${tenors.length}`}>
              <p className="ri-meter-h" id="ri-m-h">
                <strong>{idx ? `${total} invoice${total === 1 ? "" : "s"} on the board` : "Invoices on the board"}</strong>
                <span>where each one counts</span>
              </p>
              <div className="ri-bar" aria-hidden="true">
                <span className="s-pub" data-v={`flex-basis:${pct(pub)}`} />
                <span className="s-k" data-v={`flex-basis:${pct(under)}`} />
                <span className="s-no" data-v={`flex-basis:${pct(no)}`} />
              </div>
              <ul className="ri-mlabels">
                <li className="l-pub" hidden={!idx || pub === 0} data-v={`flex-basis:${pct(pub)}`}>
                  <b>
                    <i />
                    {pub}
                  </b>
                  <small>in a published tenor</small>
                </li>
                <li className="l-k" hidden={!idx || under === 0} data-v={`flex-basis:${pct(under)}`}>
                  <b>
                    <i />
                    {under}
                  </b>
                  <small>{`in tenors still under k`}</small>
                </li>
                <li className="l-no" hidden={!idx || no === 0}>
                  <b>
                    <i />
                    {no}
                  </b>
                  <small>not disclosed (0/0)</small>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* the public board: the only dark element, a thin full-bleed band */}
        <aside className="ri-src" ref={band} aria-label="Board data source">
          <b lang="ja">公開台帳</b>
          <p>
            {"Board data: "}
            {src === undefined
              ? "reading the board…"
              : src === "file"
                ? "the file you added."
                : line!.split(tipNo).map((part, i, all) => (
                    <span key={i}>
                      {part}
                      {i < all.length - 1 ? <code>{tipNo}</code> : null}
                    </span>
                  ))}
            {src && src !== "file" ? "." : null}
          </p>
          <ul aria-label="Where the board data came from">
            <li aria-current={src !== undefined && src !== "file" && src.source === "live" ? "true" : undefined}>live scan</li>
            <li aria-current={src !== undefined && src !== "file" && src.source === "kept" ? "true" : undefined}>last kept</li>
            <li aria-current={src !== undefined && src !== "file" && src.source === "copy" ? "true" : undefined}>{`bundled copy · ${BOARD_COPY.upToHeight}`}</li>
          </ul>
        </aside>

        <section className="ri-sec" aria-labelledby="ri-t-re">
          <div className="ri-cap">
            <h2 id="ri-t-re">Recompute it yourself</h2>
            <p className="ri-hint">Runs in your browser with the same rule as the jitsuin index command. Nothing is sent anywhere.</p>
          </div>
          <div className="ri-panel">
            <div className="ri-fields">
              <div className="ri-field">
                <span className="ri-lab" id="ri-f-board">
                  A board file (optional)
                </span>
                <div className="ri-file">
                  <input type="file" id="ri-board" accept=".json,application/json" aria-labelledby="ri-f-board" ref={file} onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)} />
                  <label htmlFor="ri-board">Choose file</label>
                  <span>{fileName ?? "No file: the live board"}</span>
                </div>
                <small>{`Without a file the page reads the live ${NET.noun} board from the financier node (the last one this browser saw, or a bundled copy, if the node does not answer).`}</small>
              </div>
              <div className="ri-field">
                <label htmlFor="ri-k">Fewest invoices per class (k)</label>
                <div className="ri-stepper">
                  <button type="button" aria-label="Lower k" disabled={k <= K_MIN} onClick={() => changeK(k - 1)}>
                    −
                  </button>
                  <input id="ri-k" type="number" min={K_MIN} step={1} inputMode="numeric" value={kText} onChange={(e) => setKText(e.currentTarget.value)} onBlur={() => changeK(kOf(kText))} onKeyDown={(e) => e.key === "Enter" && changeK(kOf(kText))} />
                  <button type="button" aria-label="Raise k" onClick={() => changeK(k + 1)}>
                    +
                  </button>
                </div>
                <small>{`A class is shown only with at least k invoices; k can be raised, not lowered below ${K_MIN}.`}</small>
              </div>
            </div>
            <div className="ri-actions">
              <Button onClick={run}>Recompute</Button>
              <span className="ri-status" aria-live="polite">
                {status}
              </span>
            </div>
            {out.el}
            {idx ? (
              <div className="ri-tbl-wrap">
                <table className="ri-tbl" aria-label="The index as a table">
                  <thead>
                    <tr>
                      <th>Tenor</th>
                      <th>Invoices</th>
                      <th>Median discount</th>
                      <th>Discount classes (invoices)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexRows(idx).map((r, i) => (
                      <tr key={i} className={idx.tenors[i]?.published ? undefined : "is-gated"}>
                        {r.map((c, j) => (
                          <td key={j} className={j === 1 ? "num" : undefined}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section className="ri-sec" aria-labelledby="ri-t-codes">
          <div className="ri-cap">
            <h2 id="ri-t-codes">What the codes mean</h2>
            <p className="ri-hint">The supplier signs both codes into the entry.</p>
          </div>
          <div className="ri-panel">
            <p className="ri-note">Discount is (face − advance) / face; tenor runs from the advance to the due date. Entries without classes (0/0) are counted as not disclosed.</p>
            <div className="ri-tbl-wrap">
              <table className="ri-tbl" aria-label="Class codes">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Tenor</th>
                  </tr>
                </thead>
                <tbody>
                  {classRows({ k: K_MIN, entries: 0, invoices: 0, undisclosed: 0, invalid: 0, tenors: [], classes }).map((r) => (
                    <tr key={r[0]}>
                      <td className="num">{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <div className={`ri-tip${tip ? " is-on" : ""}`} ref={tipEl} role="status">
          <strong>{tip?.title}</strong>
          <span>{tip?.text}</span>
        </div>
      </div>
      <NextRoom from="rates" />
    </Page>
  );
}
