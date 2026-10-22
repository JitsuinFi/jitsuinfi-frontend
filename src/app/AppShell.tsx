// The app world's shell (HNK-31.T2): top bar, screens nav and footer around one <main>, as the
// hash router in app.html drew them. Pages that are still DOM builders are mounted into <main>
// by `Legacy`; the shell repaints when the session changes, as before.
import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { roleLabel } from "../lib/account";
import { account } from "../lib/app-session";
import { legacyTarget } from "../lib/legacy-url";
import { NET } from "../lib/network";
import { PUBLIC, pageFor } from "./legacy-main";

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
          {Object.entries(PUBLIC).map(([to, r]) => link(to, r.label))}
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
 * A page that is still a DOM builder (before HNK-31.T3 – T11), mounted straight into <main> so
 * the old selectors (`main:has(> .auth)`) still hold. Rebuilt on every session change and on
 * every hashchange, as app.html did.
 */
export function Legacy({ path }: { path: string }): null {
  const { main, setWide } = useContext(MainSlot);
  const [v, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => account.onChange(bump), []);
  useEffect(() => {
    addEventListener("hashchange", bump);
    return () => removeEventListener("hashchange", bump);
  }, []);
  const built = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!main) return;
    const el = pageFor(path);
    built.current = el;
    main.replaceChildren(el);
    setWide(Boolean(el.dataset.wide));
    return () => {
      if (built.current?.parentNode === main) main.replaceChildren();
    };
  }, [main, path, v, setWide]);
  return null;
}
