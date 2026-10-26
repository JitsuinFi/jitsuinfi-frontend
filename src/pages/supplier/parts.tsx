// The supplier's shared parts (HNK-34.T5, approved sample design-samples/internal/supplier.html;
// IA port 2026-10-26): the caption column (the 売 tag, the title, who you are, three numbers), the
// deal route as six physical stations (照 署 登 印 金 済), a station's work heading, and the buyer
// named in plain words. Styles: pages/supplier.css.
import type { ReactNode } from "react";
import { account } from "../../lib/app-session";
import { readablePrint } from "../../lib/print";
import { nextStep, route, STEPS, type StationKey, type StationState, type SupplierDeal } from "../../lib/supplier-deal";
import { contactFor, type Book } from "./data";

export const LEAD = "Issue an invoice, have the buyer sign it, offer it to one financier, sign its board entry, seal the letter and receive the advance.";

// The six stations, each a physical mark (照 the buyer's seal checked under a loupe, 署 the pen
// that signs the offer, 登 the public board slab, 印 the seal on the letter, 金 the coin into the
// shielded pool, 済 the settled stamp).
export const STATION: Record<StationKey, { glyph: string; obj: string; label: string }> = {
  signature: { glyph: "照", obj: "sp-o-check", label: STEPS[0].label },
  offer: { glyph: "署", obj: "sp-o-pen", label: STEPS[1].label },
  entry: { glyph: "登", obj: "sp-o-board", label: STEPS[2].label },
  seal: { glyph: "印", obj: "sp-o-seal", label: STEPS[3].label },
  advance: { glyph: "金", obj: "sp-o-coin", label: STEPS[4].label },
  settled: { glyph: "済", obj: "sp-o-stamp", label: "Settled" },
};
export const STATE_WORD: Record<StationState, string> = { done: "done", next: "your move", wait: "waiting", later: "later" };
export const STATION_KEYS: readonly StationKey[] = ["signature", "offer", "entry", "seal", "advance", "settled"];
export const isStation = (x: unknown): x is StationKey => STATION_KEYS.includes(x as StationKey);

export type Stations = ReturnType<typeof route>;

/** The station to show for `d`: the one to do now, else 済. */
export function nowStation(stations: Stations): Stations[number] {
  return stations.find((s) => s.state === "next" || s.state === "wait") ?? stations[5];
}

/** The caption column of every supplier section: the tag, the title, the lede, who you are, the numbers. */
export function Caption({ section, title, lede, deals, children, titleClass }: { section?: string; title: ReactNode; lede: ReactNode; deals: SupplierDeal[]; children?: ReactNode; titleClass?: string }): ReactNode {
  const s = account.current;
  const store = s?.store;
  const financed = deals.filter((d) => d.advance?.matches).length;
  const onRoute = deals.filter((d) => nextStep(d) !== null).length;
  return (
    <section className="sp-cap" aria-labelledby="sp-h1">
      <p className="sp-tag">
        <b lang="ja">売</b>Supplier's counter
        {section ? (
          <>
            <i className="ia-dot" aria-hidden="true">
              ·
            </i>
            <span className="ia-sec">{section}</span>
          </>
        ) : null}
      </p>
      <h1 id="sp-h1" className={titleClass}>
        {title}
      </h1>
      <p className="sp-lede">{lede}</p>
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
      {children}
    </section>
  );
}

/** The ink texture of the buyer's seal on the sheet (Seikyusho case mode). */
export function ObjectDefs(): ReactNode {
  return (
    <svg className="sp-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
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
export function Rail({ stations, selected, onPick, stamp }: { stations: Stations; selected: StationKey | null; onPick?: (k: StationKey) => void; stamp?: Set<StationKey> }): ReactNode {
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

/** A route that has not started (the blank invoice). */
export const BLANK_ROUTE: Stations = STATION_KEYS.map((key) => ({ key, label: STATION[key].label, state: "later" as StationState }));

/** A station's work: its heading and hint on the paper, its inputs grouped on one paper panel. */
export function Work({ glyph, step, title, hint, children }: { glyph: string; step: string; title: string; hint: ReactNode; children?: ReactNode }): ReactNode {
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

/** The buyer in plain words: the name on their card, or the print of the mailbox the key came from. */
export function buyerName(book: Book | null, d: { buyer_mailbox?: string; buyer_pk: string }): { name: string; print: string } {
  const c = contactFor(book, d.buyer_mailbox);
  if (c) return { name: c.username ? `@${c.username}` : "A buyer in your contacts", print: c.fingerprint };
  return { name: d.buyer_mailbox ? "A buyer not in your contacts yet" : "The buyer", print: readablePrint(d.buyer_pk) };
}

/** The next move as one line: what to do, or where the deal stands. */
export function nextLine(move: { text: string; wait: boolean } | null, stands: "repayment" | "settled" | null, due: string): { lead: string; text: string; wait: boolean } {
  if (move) return { lead: "Next:", text: move.text, wait: move.wait };
  if (stands === "settled") return { lead: "Settled.", text: "The buyer repaid the financier.", wait: false };
  return { lead: "Advance received.", text: `Waiting for the buyer to pay the financier, due ${due}.`, wait: true };
}
