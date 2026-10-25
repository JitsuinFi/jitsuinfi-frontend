// The console's own shell and small pieces (HNK-34.T5): the top bar (no app shell: the console is
// its own world on the node's origin), the footer, copy and one-at-a-time buttons, and the six
// station marks of the deal's route.
import { useState, type ReactNode } from "react";
import { Mark, Wordmark } from "../app/Mark";
import { explain } from "../lib/explain";

export const say = (e: unknown) => explain(e instanceof Error ? e.message : String(e));
export type Load = () => Promise<void>;

export const netLabel = (network: string | undefined) => (network === undefined ? null : network === "main" ? "Mainnet" : "Testnet");

/** The console's top bar: the mark, what this is, then the screens and who is signed in, if anyone. */
export function TopBar({ net, where, nav, end }: { net: string | null; where?: ReactNode; nav?: ReactNode; end?: ReactNode }): ReactNode {
  return (
    <header className="cs-top">
      <a className="cs-brand" href="/console" aria-label="JitsuinFi financier console">
        <Mark className="cs-brand-img" small />
        <Wordmark />
      </a>
      {where}
      {nav}
      <div className="cs-top-end">
        {net ? <span className="cs-net">{net}</span> : null}
        {end}
      </div>
    </header>
  );
}

export function Foot(): ReactNode {
  return (
    <footer className="cs-foot">
      <p>Talks only to your node, on this origin. No trackers, no third-party requests.</p>
    </footer>
  );
}

/** A copy button: says Copied, or `failed` when the clipboard refuses. */
export function CopyButton({ label, value, className = "cs-btn-q", failed = "Copy failed", onFail }: { label: string; value: string; className?: string; failed?: string; onFail?: () => void }): ReactNode {
  const [text, setText] = useState(label);
  return (
    <button
      className={className}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setText("Copied");
        } catch {
          if (onFail) onFail();
          else setText(failed);
        }
      }}
    >
      {text}
    </button>
  );
}

/** A button that runs once at a time, its error shown by `fail`. */
export function Act({ label, className = "cs-btn-q", run, fail, children }: { label?: string; className?: string; run: () => Promise<void>; fail: (e: unknown) => void; children?: ReactNode }): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`${className}${busy ? " is-busy" : ""}`}
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
        } catch (e) {
          fail(e);
        }
        setBusy(false);
      }}
    >
      {children}
      {label}
    </button>
  );
}

/** A status line: a sentence the screen reader reads when it changes. */
export function Status({ text, id }: { text: string; id?: string }): ReactNode {
  return (
    <p className="cs-status" role="status" aria-live="polite" id={id}>
      {text}
    </p>
  );
}

/** The red kanji stamp of a caption. */
export function Stamp({ k }: { k: string }): ReactNode {
  return (
    <span className="cs-stamp" lang="ja" aria-hidden="true">
      {k}
    </span>
  );
}

export const PasskeyGlyph = () => (
  <svg viewBox="0 0 24 24" className="cs-ico" aria-hidden="true">
    <circle cx={9} cy={8} r={4} />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9" />
    <circle cx={18} cy={13} r={2.6} />
    <path d="M18 15.6V22l1.6-1.4M18 19l1.6-1" />
  </svg>
);

export const LockGlyph = () => (
  <svg viewBox="0 0 12 12" className="cs-lock-ico" aria-hidden="true">
    <rect x={2} y={5.2} width={8} height={5.8} rx={1.4} />
    <path d="M3.8 5.2V3.8a2.2 2.2 0 0 1 4.4 0v1.4" />
  </svg>
);

/** The six station marks: loupe, pen, board slab, seal, coin into the pool, settled stamp. */
export function StationMark({ mark }: { mark: string }): ReactNode {
  const body: Record<string, ReactNode> = {
    loupe: (
      <>
        <circle cx={13.5} cy={13.5} r={8.5} fill="none" stroke="currentColor" strokeWidth={2.4} />
        <path d="M10 11.5a4.5 4.5 0 0 1 4-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
        <path d="M20 20l7.5 7.5" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      </>
    ),
    pen: (
      <>
        <path d="M6 26l2.4-7.4L21.6 5.4a2.6 2.6 0 0 1 3.7 0l1.3 1.3a2.6 2.6 0 0 1 0 3.7L13.4 23.6z" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" />
        <path d="M8.4 18.6l5 5M19 8l5 5" stroke="currentColor" strokeWidth={1.6} />
        <path d="M4 29.5c6-1.6 14-1.6 24 0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </>
    ),
    board: (
      <>
        <rect x={3.5} y={7} width={25} height={18} rx={2.5} fill="currentColor" />
        <path d="M7.5 12h17M7.5 16h17M7.5 20h11" className="cs-mark-paper" strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        <path d="M5 27.5h22" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
      </>
    ),
    seal: (
      <>
        <rect x={11} y={3} width={10} height={15} rx={4} fill="none" stroke="currentColor" strokeWidth={2.2} />
        <path d="M8 18h16l1.5 5h-19z" fill="currentColor" />
        <ellipse cx={16} cy={27.5} rx={7} ry={2} fill="none" stroke="currentColor" strokeWidth={1.8} />
      </>
    ),
    coin: (
      <>
        <circle cx={16} cy={9} r={6.5} fill="none" stroke="currentColor" strokeWidth={2.2} />
        <path d="M13.5 6.6h5l-5 4.8h5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M3 22.5c4.3-2.6 8.6-2.6 13 0s8.7 2.6 13 0V28a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" />
      </>
    ),
    done: (
      <g transform="rotate(-6 16 16)">
        <rect x={4} y={4} width={24} height={24} rx={4} fill="none" stroke="currentColor" strokeWidth={2.4} />
        <text x={16} y={22.4} textAnchor="middle" className="cs-mark-kanji" fill="currentColor">
          済
        </text>
      </g>
    ),
  };
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {body[mark]}
    </svg>
  );
}
