// What the person just did (HNK-34 E2E finding 1; IA port 2026-10-26): a hanko and a sentence at
// the top of the page the action led to, until they move on. An action taken in the inbox panel
// leaves its outcome on the page the panel opened, marked "Done · from your inbox". Every role's
// pages use it.
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { reducedMotion } from "../landing/motion";

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
      <p>
        <small>
          {x.warn ? "Came back" : "Done"}
          {x.inbox ? <span className="ia-from-inbox"> · from your inbox</span> : null}
        </small>
        <strong>{x.title}</strong>
        <span>{x.text}</span>
      </p>
    </div>
  );
}
