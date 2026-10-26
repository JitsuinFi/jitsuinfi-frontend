// A long list on paper (IA port, user feedback 2026-10-26 C; src/lib/long-list.ts): your move
// first, then what waits on someone else, then the done lines folded ("Settled · 12"); a search
// once the list is longer than one screen, and "Show more" under each group. The supplier's 台帳
// and the inbox use it, and since part 2 the buyer's ledger, its slips and the member's payouts.
import { useState, type ReactNode } from "react";
import { arrange, type Stage } from "../lib/long-list";

export function LongList<T>({
  items,
  stage,
  words,
  labels,
  render,
  keyOf,
  limit = 8,
  searchLabel,
  className,
}: {
  items: readonly T[];
  stage: (t: T) => Stage;
  words: (t: T) => string;
  labels: Record<Stage, string>;
  render: (t: T) => ReactNode;
  keyOf: (t: T) => string;
  limit?: number;
  /** The search field's words; the field shows once the list is longer than `limit`. */
  searchLabel: string;
  className?: string;
}): ReactNode {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<Set<Stage>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<Stage>>(() => new Set());
  const { groups, matched } = arrange(items, { stage, words, query, limit, opened, expanded });
  const add = (s: Set<Stage>, k: Stage) => new Set([...s, k]);
  const searchable = items.length > limit;
  const headed = groups.length > 1 || groups.some((g) => g.folded);
  return (
    <div className={className ? `ia-ll ${className}` : "ia-ll"}>
      {searchable ? (
        <label className="ia-ll-q">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4.5 4.5" />
          </svg>
          <span className="ia-sr">{searchLabel}</span>
          <input type="search" placeholder={searchLabel} value={query} spellCheck="false" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          {query ? <small role="status">{matched ? `${matched} of ${items.length}` : "none"}</small> : null}
        </label>
      ) : null}
      {groups.map((g) => (
        <section key={g.stage} className="ia-ll-g" data-stage={g.stage}>
          {g.folded ? (
            <button type="button" className="ia-ll-fold" aria-expanded="false" onClick={() => setOpened((s) => add(s, g.stage))}>
              <span>{labels[g.stage]}</span>
              <b>{g.total}</b>
              <i aria-hidden="true">show</i>
            </button>
          ) : (
            <>
              {headed ? (
                <h3 className="ia-ll-h">
                  {labels[g.stage]} <b>{g.total}</b>
                </h3>
              ) : null}
              <ol>
                {g.items.map((t) => (
                  <li key={keyOf(t)}>{render(t)}</li>
                ))}
              </ol>
              {g.more ? (
                <button type="button" className="ia-ll-more" onClick={() => setExpanded((s) => add(s, g.stage))}>
                  {`Show ${g.more} more`}
                </button>
              ) : null}
            </>
          )}
        </section>
      ))}
      {query && !matched ? <p className="ia-ll-none">{`Nothing matches “${query.trim()}”.`}</p> : null}
    </div>
  );
}
