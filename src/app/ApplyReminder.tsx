// The shell's line for a would-be financier (nav audit 2026-10-25): after an application is sent
// from this browser, every app screen but /apply (whose caption says it) carries one line until the
// provider's invite is opened, as the buyer's due reminder does (DueReminder.tsx). Read from this
// browser's storage on each screen; nothing leaves the browser.
import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { storageGet, waitingApplication } from "../lib/apply-state";

export function ApplyReminder({ path }: { path: string }): ReactNode {
  const waiting = useMemo(() => waitingApplication(storageGet()), [path]);
  if (!waiting || path === "/apply") return null;
  return (
    <p className="due-note is-apply" role="status">
      <span className="due-note-hk" lang="ja" aria-hidden="true">
        待
      </span>
      <span>
        <b>{`Application sent ${waiting.day}.`}</b> The node provider sends your invite back to this browser.{" "}
        <Link to="/apply">Check for your invite</Link>
      </span>
    </p>
  );
}
