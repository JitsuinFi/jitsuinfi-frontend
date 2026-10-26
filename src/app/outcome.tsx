// What the person just did (HNK-34 E2E finding 1; IA port 2026-10-26): a hanko and a sentence at
// the top of the page the action led to, until they move on. An action taken in the inbox panel
// leaves its outcome on the page the panel opened, marked "Done · from your inbox". Every role's
// pages use it. On a phone the first screen shows what happened (the hanko and the title); a long
// sentence about it folds under "Details" (DS-MOB P4: no text block over 3 lines above the fold).
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { reducedMotion } from "../landing/motion";
import { usePhone } from "./phone";

/** About one line of the outcome's sentence at 390 px: a longer one folds on a phone. */
const ONE_LINE = 44;

export interface Did {
  /** The page (path) it belongs to; another page draws nothing. */
  at: string;
  glyph: string;
  title: string;
  text: string;
  /** Someone else turned it back (a declined offer). */
  warn?: boolean;
  /** Taken in the inbox panel. */
  inbox?: boolean;
}

let did: Did | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function setDid(d: Did | null): void {
  did = d;
  emit();
}

/** Forgets the outcome when the person moves on (another station, another page). */
export function clearDid(): void {
  if (did) setDid(null);
}

/** The outcome for the page at `path`, if any. */
export function useDid(path: string): Did | null {
  const d = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => did,
  );
  return d && d.at === path ? d : null;
}

/** The outcome as a hanko pressed and a sentence; one from the inbox is brought into view once. */
export function DidLine({ did: x }: { did: Did }): ReactNode {
  const el = useRef<HTMLDivElement>(null);
  const fold = usePhone() && x.text.length > ONE_LINE;
  useEffect(() => {
    if (!x.inbox || !el.current) return;
    const r = el.current.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight - 90) el.current.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [x]);
  return (
    <div className={x.warn ? "ia-did is-warn" : "ia-did"} role="status" ref={el}>
      <span className="ia-did-seal" lang="ja" aria-hidden="true">
        {x.glyph}
      </span>
      <div className="ia-did-t">
        <p>
          <small>
            {x.warn ? "Came back" : "Done"}
            {x.inbox ? <span className="ia-from-inbox"> · from your inbox</span> : null}
          </small>
          <strong>{x.title}</strong>
          {fold ? null : <span>{x.text}</span>}
        </p>
        {fold ? (
          <details className="ia-did-more">
            <summary>Details</summary>
            <p>{x.text}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
