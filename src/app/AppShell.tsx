// The app world's shell (HNK-31.T2): top bar, nav and footer around one <main>. Pages draw into
// <main> through `Page`; the shell repaints when the session changes.
// IA port 2026-10-26 (approved prototype design-samples/ia/prototype.html): signed out, the nav is
// Home · Try it · Verify · Sign in; signed in, Home and the role's sections (src/lib/sections.ts),
// then the inbox bell with its count (the panel: InboxPanel.tsx) and the Account button with the
// role's seal (AccountMenu.tsx). On a phone the bottom tab bar holds the role's sections and the
// Inbox, Account stays in the top bar and Home is the logo.
// Nav audit 2026-10-25: a skip link first; the brand is a plain link (only the screen you are on
// carries aria-current); a thin seal line under the bar while a screen's code loads; the footer
// leads back to the landing and the spec; an applicant's line until the invite is opened.
import { AccountButton } from "./AccountMenu";
import { ApplyReminder } from "./ApplyReminder";
import { DueReminder } from "./DueReminder";
import { startInbox } from "./inbox";
import { InboxPanel, useInbox } from "./InboxPanel";
import { Mark, Wordmark } from "./Mark";
import { SkipLink } from "./SkipLink";
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { SPEC_URL } from "../lib/hosts";
import { account, accountDoor } from "../lib/app-session";
import { legacyTarget } from "../lib/legacy-url";
import { NET } from "../lib/network";
import { activeItem, hasInbox, navItems, phoneTabs } from "../lib/sections";
import { unread } from "./inbox";
import "./app-styles";

/** The phone layout of the shell (style.css and shell.css: the tab bar from 720 px down). */
const PHONE = "(max-width: 720px)";
export function usePhone(): boolean {
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
const APP_PATHS = /^\/(app|try|try\/play|verify|outsider|rates|account|apply|financier|(supplier|buyer|member)(\/[\w-]+)*)$/;

const Bell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);

/** The inbox's count; it pops once when it grows (popOver, the one bounce). */
function Count({ n }: { n: number }): ReactNode {
  const was = useRef(n);
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const b = el.current;
    if (b && n > was.current) {
      b.classList.remove("is-pop");
      void b.offsetWidth; // restart the animation
      b.classList.add("is-pop");
    }
    was.current = n;
  }, [n]);
  return (
    <b className="ia-count" data-n={n} aria-hidden="true" ref={el}>
      {n || ""}
    </b>
  );
}

export function AppShell(): ReactNode {
  const s = useSession();
  const router = useRouter();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [main, setMain] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  const [ib, setIb] = useState(false);
  const [menu, setMenu] = useState(false);
  const phone = usePhone();
  const inbox = useInbox();
  // a screen's code is loading (the router waits for its chunk): the seal line under the bar
  const loading = useRouterState({ select: (r) => r.status === "pending" || r.isLoading });

  useLayoutEffect(() => {
    document.title = "JitsuinFi App";
  }, []);
  useEffect(() => startInbox(), []);
  // a new page closes the menu; signing out closes both
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!s) {
      setIb(false);
      setMenu(false);
    }
  }, [s]);
  const closeInbox = useCallback(() => setIb(false), []);
  const closeMenu = useCallback(() => setMenu(false), []);

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

  const role = s?.role ?? null;
  const items = navItems(role);
  const tabs = phoneTabs(role);
  const on = activeItem(items, path);
  const withInbox = hasInbox(role);
  const n = withInbox ? unread(inbox) : 0;
  const bellLabel = `Inbox, ${n === 1 ? "1 letter" : `${n} letters`} to act on`;
  const door = (to: string) => (to === "/account" ? () => void (accountDoor.fresh = true) : undefined);
  return (
    <div id="app" onClick={onClick}>
      <SkipLink target="main" />
      <header className="top">
        {/* a plain link (the shell moves it inside the app): the brand never says "you are here" */}
        <a className="brand" href="/app" aria-label="JitsuinFi app, home">
          <Mark className="brand-img" small />
          <Wordmark />
        </a>
        <nav className="ia-nav" aria-label="Screens">
          {items.map((it, i) => (
            <Fragment key={it.to}>
              {role && i === 1 ? <span className="ia-sep" aria-hidden="true" /> : null}
              <Link to={it.to} className={on === it.to ? "active" : undefined} aria-current={on === it.to ? "page" : undefined} activeProps={{}} activeOptions={{ exact: true }} onClick={door(it.to)}>
                {it.label}
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className="ia-right">
          {withInbox ? (
            <button type="button" className="ia-bell" aria-haspopup="dialog" aria-expanded={ib} aria-label={bellLabel} onClick={() => (setMenu(false), setIb(true))}>
              <Bell />
              <Count n={n} />
            </button>
          ) : null}
          {s ? <AccountButton s={s} open={menu} onOpen={() => (setIb(false), setMenu(true))} onClose={closeMenu} current={path === "/account"} /> : null}
          <span className="net">{NET.short}</span>
        </div>
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
      {phone ? (
        <nav className="ia-tabs" aria-label="Sections">
          {tabs.map((t) =>
            "inbox" in t ? (
              <button key="inbox" type="button" className={ib ? "active" : undefined} aria-haspopup="dialog" aria-expanded={ib} aria-label={bellLabel} onClick={() => (setMenu(false), setIb((x) => !x))}>
                <b lang="ja" aria-hidden="true">
                  {t.k}
                </b>
                {t.short}
                <Count n={n} />
              </button>
            ) : (
              <Link key={t.to} to={t.to} className={on === t.to && !ib ? "active" : undefined} aria-current={on === t.to ? "page" : undefined} activeProps={{}} activeOptions={{ exact: true }} onClick={() => (door(t.to)?.(), setIb(false))}>
                <b lang="ja" aria-hidden="true">
                  {t.k}
                </b>
                {t.short}
              </Link>
            ),
          )}
        </nav>
      ) : null}
      {withInbox ? <InboxPanel open={ib} onClose={closeInbox} /> : null}
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
