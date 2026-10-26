// The app world's shell (HNK-31.T2): top bar, screens nav and footer around one <main>, as the
// hash router in app.html drew them. Pages draw into <main> through `Page`; the shell repaints
// when the session changes, as before.
// Nav audit 2026-10-25: a skip link first; the brand is a plain link (only the screen you are on
// carries aria-current); on a phone the tab bar holds five screens (src/lib/screens.ts) and keeps
// the one you are on in view; a thin seal line under the bar while a screen's code loads; the
// footer leads back to the landing and the spec; an applicant's line until the invite is opened.
import { ApplyReminder } from "./ApplyReminder";
import { DueReminder } from "./DueReminder";
import { Mark, Wordmark } from "./Mark";
import { SkipLink } from "./SkipLink";
import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { SPEC_URL } from "../lib/hosts";
import { account, accountDoor } from "../lib/app-session";
import { legacyTarget } from "../lib/legacy-url";
import { NET } from "../lib/network";
import { phoneTabs, screens } from "../lib/screens";
import "./app-styles";

/** The phone layout of the shell (style.css: the tab bar from 720 px down). */
const PHONE = "(max-width: 720px)";
function usePhone(): boolean {
  return useSyncExternalStore(
    (f) => {
      const mq = matchMedia(PHONE);
      mq.addEventListener("change", f);
      return () => mq.removeEventListener("change", f);
    },
    () => matchMedia(PHONE).matches,
  );
}

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
  const phone = usePhone();
  const nav = useRef<HTMLElement>(null);
  // a screen's code is loading (the router waits for its chunk): the seal line under the bar
  const loading = useRouterState({ select: (r) => r.status === "pending" || r.isLoading });

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

  // the phone tab bar: the screen you are on scrolls into view, and an edge fades where more scrolls
  useLayoutEffect(() => {
    const n = nav.current;
    if (!n || !phone) return;
    const edges = () => {
      const more = n.scrollWidth - n.clientWidth > 1;
      n.classList.toggle("is-more-l", more && n.scrollLeft > 1);
      n.classList.toggle("is-more-r", more && n.scrollLeft < n.scrollWidth - n.clientWidth - 1);
    };
    const on = n.querySelector<HTMLElement>("a.active");
    if (on && n.scrollWidth > n.clientWidth) n.scrollTo({ left: on.offsetLeft - (n.clientWidth - on.offsetWidth) / 2 });
    edges();
    n.addEventListener("scroll", edges, { passive: true });
    addEventListener("resize", edges);
    return () => {
      n.removeEventListener("scroll", edges);
      removeEventListener("resize", edges);
      n.classList.remove("is-more-l", "is-more-r");
    };
  }, [path, phone, s?.role]);

  const items = phone ? phoneTabs(s?.role ?? null) : screens(s?.role ?? null);
  return (
    <div id="app" onClick={onClick}>
      <SkipLink target="main" />
      <header className="top">
        {/* a plain link (the shell moves it inside the app): the brand never says "you are here" */}
        <a className="brand" href="/app" aria-label="JitsuinFi app, home">
          <Mark className="brand-img" small />
          <Wordmark />
        </a>
        <nav aria-label="Screens" ref={nav}>
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className={it.to === path ? "active" : undefined}
              activeProps={{}}
              onClick={it.to === "/account" ? () => void (accountDoor.fresh = true) : undefined}
            >
              {phone ? it.short : it.label}
            </Link>
          ))}
        </nav>
        <span className="net">{NET.short}</span>
        {loading ? <span className="route-load" aria-hidden="true" /> : null}
      </header>
      <DueReminder session={s} path={path} />
      <ApplyReminder path={path} />
      {/* A stage page (data-wide) takes the full width: its visuals need the room (HNK-30.T13, FE-M0 M3). */}
      <main ref={setMain} id="main" tabIndex={-1} className={wide ? "wide" : undefined} />
      <footer>
        <p>Runs entirely in your browser. No trackers, no third-party requests.</p>
        {/* plain links: the landing is another world, the spec another site */}
        <p className="foot-links">
          <a href="/">About JitsuinFi</a>
          <span aria-hidden="true"> · </span>
          <a href={SPEC_URL} target="_blank" rel="noopener noreferrer">
            Read the spec
          </a>
        </p>
      </footer>
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
