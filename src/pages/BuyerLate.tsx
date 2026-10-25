// "If you pay late" on the 払込票 payment slip (buyer-late): from a week before the due date, the
// countdown to the on-time cut-off (the end of the due date, UTC) and the facts about paying late;
// past the due date, the fact that it will be marked late; once settled, the 済 or 遅 mark. The
// state and every word come from src/lib/buyer-late.ts, which says where each fact is made true.
// Delays go through `data-v` (BuyerPage's useVars: CSSOM, no style attributes).
import type { ReactNode } from "react";
import { sibling } from "../landing/motion";
import { countdown, lateLines, type LateFacts, type LateState } from "../lib/buyer-late";

export function LatePanel({ state, facts, cutoffMs }: { state: LateState; facts: LateFacts; cutoffMs: number }): ReactNode {
  const lines = lateLines(state, facts);
  if (!lines.length || state.kind === "paid") return null;
  if (state.kind === "paid-on-time" || state.kind === "paid-late") {
    const ok = state.kind === "paid-on-time";
    const [head, ...rest] = lines[0].text.split(": ");
    return (
      <p className={`by-late is-${ok ? "ok" : "late"}`} role="status">
        <span className="by-late-mark" lang="ja" aria-hidden="true">
          {lines[0].glyph}
        </span>
        <span>
          <b>{head}.</b> {rest.join(": ").replace(/^./, (c) => c.toUpperCase())}
        </span>
      </p>
    );
  }
  const over = state.kind === "overdue";
  return (
    <section className={`by-late is-${over ? "over" : "soon"}`} aria-label={over ? "Past due" : "If you pay late"}>
      <div className="by-late-h">
        <b>{over ? "Past due" : "If you pay late"}</b>
        <span className="by-late-count" role="timer" aria-live="off">
          <strong>{over ? `${state.days_over} day${state.days_over === 1 ? "" : "s"}` : countdown(cutoffMs)}</strong>
          <small>{over ? `past ${facts.due}` : `left · on time if mined by the end of ${facts.due} (UTC)`}</small>
        </span>
      </div>
      <ul className="by-late-lines">
        {lines.map((l, i) => (
          <li key={l.glyph + i} data-v={`--d:${sibling(i) + 120}ms`}>
            <span className="rp-hanko" lang="ja" aria-hidden="true">
              {l.glyph}
            </span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
