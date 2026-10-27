// An address no screen answers (audit 2026-10-27, finding 19): a small notice with the way back,
// instead of silently opening the landing. Its own small stylesheet, so no world is loaded for it;
// on a console's host Home is the console.
import "./notfound.css";
import { useLayoutEffect, type ReactNode } from "react";
import { isConsoleHost } from "../lib/hosts";

export function NotFound(): ReactNode {
  const consoleHost = isConsoleHost(location.hostname);
  useLayoutEffect(() => {
    document.title = "Not found · JitsuinFi";
  }, []);
  return (
    <main className="nf" id="main" tabIndex={-1}>
      <p className="nf-mk" lang="ja" aria-hidden="true">
        無
      </p>
      <h1>Not found</h1>
      <p className="nf-line">
        {"Nothing lives at "}
        <code>{location.pathname}</code>
        {"."}
      </p>
      <p className="nf-go">
        {/* plain links: each world loads its own page */}
        <a href={consoleHost ? "/console" : "/app"}>Back to Home</a>
        {consoleHost ? null : (
          <>
            <span aria-hidden="true"> · </span>
            <a href="/">About JitsuinFi</a>
          </>
        )}
      </p>
    </main>
  );
}
