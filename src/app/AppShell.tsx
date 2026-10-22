// The app world's shell (HNK-31.T2): top bar, screens nav and footer around one <main>, as the
// hash router in app.html drew them. Pages draw into <main> through `Page`; the shell repaints
// when the session changes, as before.
import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { roleLabel } from "../lib/account";
import { account } from "../lib/app-session";
import { legacyTarget } from "../lib/legacy-url";
import { NET } from "../lib/network";
import "./app-styles";

// Public pages need no account (BL-PG-01).
const PUBLIC: Array<[string, string]> = [
  ["/try", "Try it"],
  ["/verify", "Verify"],
  ["/outsider", "What outsiders see"],
  ["/rates", "Rate index"],
];

const MainSlot = createContext<{ main: HTMLElement | null; setWide: (w: boolean) => void }>({ main: null, setWide: () => undefined });

/** Repaints on every session change. */
function useSession() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => account.onChange(bump), []);
  return account.current;
}

/** Paths of the app world: links to them stay in the page instead of reloading the document. */
const APP_PATHS = /^\/(app|try|try\/play|verify|outsider|rates|account|supplier|buyer|member|apply|financier)$/;

export function AppShell(): ReactNode {
  const s = useSession();
  const router = useRouter();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [main, setMain] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    document.title = "JitsuinFi App";
  }, []);

  // Old in-app links (#/supplier) and plain links to app paths move inside the app.
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    const to = legacyTarget(url.pathname, url.search, url.hash) ?? url.pathname;
    if (!APP_PATHS.test(to) || (to === url.pathname && url.hash)) return;
    e.preventDefault();
    void router.navigate({ to });
  };

  const link = (to: string, label: string) => (
    <Link key={to} to={to} className={to === path ? "active" : undefined} activeProps={{}}>
      {label}
    </Link>
  );
  return (
    <div id="app" onClick={onClick}>
      <header className="top">
        <Link className="brand" to="/app">
          <img src="/seal.svg" alt="" />
          JitsuinFi
        </Link>
        <nav aria-label="Screens">
          {link("/app", "Home")}
          {s ? link(`/${s.role}`, roleLabel(s.role)) : null}
          {PUBLIC.map(([to, label]) => link(to, label))}
          {link("/account", s ? "Account" : "Sign in")}
        </nav>
        <span className="net">{NET.short}</span>
      </header>
      {/* A stage page (data-wide) takes the full width: its visuals need the room (HNK-30.T13, FE-M0 M3). */}
      <main ref={setMain} className={wide ? "wide" : undefined} />
      <footer>Runs entirely in your browser. No trackers, no third-party requests.</footer>
      <MainSlot.Provider value={{ main, setWide }}>
        <Outlet />
      </MainSlot.Provider>
    </div>
  );
}

/**
 * A page written as components (HNK-31.T3 on): drawn straight into <main>, like the old pages,
 * and `wide` for a stage page that takes the full width.
 */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }): ReactNode {
  const { main, setWide } = useContext(MainSlot);
  useLayoutEffect(() => setWide(wide), [wide, setWide]);
  return main ? createPortal(children, main) : null;
}

/**
 * Calls `then` once, after the elements before it are in the document: put it last inside a Page,
 * whose children mount through a portal after the page component itself.
 */
export function Mounted({ then }: { then: () => void }): null {
  const done = useRef(false);
  useLayoutEffect(() => {
    if (done.current) return;
    done.current = true;
    then();
  });
  return null;
}
