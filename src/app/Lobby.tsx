// The 登記所 lobby (/app; HNK-34.T1, from the approved design sample of 2026-10-25): the registry
// office as the building's directory. Every room of the app is a part of the office (the try desk,
// the counter, the till, the console door, the shielded pool, and the back wall's three panes:
// public board, check, rate index); a seal pin stands over each, and the directory lists them in two
// groups. Pointing at a room (its part, its pin or its directory line) lights all three and plays
// that room's own motion; a click goes there. In view, a slow tour walks the rooms in the order an
// invoice lives them; any pointing takes over, and the tour comes back after a pause. Reduced
// motion: no tour, every room at its end state, pointing only lights.
// The office's N and blocks are read from the board copy bundled with the app (lobby-data.ts).
// Drawing: figures/lobby-office.svg (scripts/figures/lobby-office.build.mjs), loaded lazily and
// moved by figures/lobby-office.ts. Styles: pages/lobby.css; the drawing's materials are the .ro-*
// rules of chapter 6 in landing.css.
// The financier's room is the demo console, on its own host: it opens in a new tab (nav audit
// 2026-10-25: /console on the app host has no node and went back to the landing).
import "../landing/landing.css";
import "./figures/lobby-office-pins.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mounted, Page } from "./AppShell";
import { reducedMotion } from "../landing/motion";
import { useFigure } from "../landing/use-figure";
import { BOARD_COPY } from "../lib/board";
import { wasm } from "../lib/core";
import { KIT } from "../lib/kit";
import { CONSOLE_HOST, CONSOLE_URL } from "../lib/hosts";
import { storageGet, waitingApplication } from "../lib/apply-state";
import { blockText, nShort, ORDER, ROOMS, twiceOf, type Room } from "./lobby-data";
import type { LobbyOffice, OfficeData } from "./figures/lobby-office";

const GROUPS: Array<{ title: string; note: string; rooms: Room[] }> = [
  { title: "Open to anyone", note: "no account", rooms: ["try", "verify", "outsider", "rates"] },
  { title: "Counters for the parties", note: "with your keys", rooms: ["supplier", "buyer", "member", "financier"] },
];

/** The pins, back to front as the office draws its rooms. */
const PINS: Room[] = ["outsider", "verify", "rates", "financier", "member", "buyer", "supplier", "try"];

/** What the readout under the office says about a room; `mono` lines are board data. */
function roomData(room: Room, b: OfficeData | null): { lines: string[]; mono: boolean } {
  switch (room) {
    case "try":
      return { lines: ["TES-INV-0003 sold twice", "拒 refused"], mono: false };
    case "verify":
      return { lines: b ? [`${b.n} · ${b.first} counts · ${b.second} refused`] : [], mono: true };
    case "outsider":
      return { lines: b ? [`${b.n} · block ${b.first}`] : [], mono: true };
    case "rates":
      return { lines: ["five tenor classes · a class shows at k = 5 invoices"], mono: false };
    case "supplier":
      return { lines: ["TES-INV-0003 · sealed 売 買 融 on the counter"], mono: false };
    case "buyer":
      return { lines: ["the till 入金 · pay when it is due"], mono: false };
    case "member":
      return { lines: ["the shielded pool · amounts stay private"], mono: false };
    case "financier":
      return { lines: ["the console door · Sign-to-Pay advance"], mono: false };
  }
}

/** TES-INV-0003 on the bundled board copy: its N and the blocks it was registered at. */
async function readBoard(): Promise<OfficeData | null> {
  const r = await fetch(BOARD_COPY.url, { credentials: "same-origin" });
  if (!r.ok) return null;
  const t = twiceOf(await r.text(), (m) => wasm.boardMemoDescribe(m), KIT.financierA.txid);
  if (!t || t.heights.length < 2) return null;
  return { n: nShort(t.n), first: blockText(t.heights[0]), second: blockText(t.heights[1]) };
}

export function Lobby(): ReactNode {
  const reduced = useRef(reducedMotion()).current;
  const navigate = useNavigate();
  const office = useRef<HTMLElement>(null);
  const figHost = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<Room | null>(null);
  const [paused, setPaused] = useState(false);
  const [board, setBoard] = useState<OfficeData | null>(null);
  // the page is drawn into <main> through a portal: its elements are there once this turns true
  const [inDoc, setInDoc] = useState(false);
  // the tour's state, read by the timers and the figure's callbacks
  const s = useRef({ gen: 0, idx: 0, timer: 0, resume: 0, paused: false, inView: false, held: false, ready: false, lit: null as Room | null, board: null as OfficeData | null });

  const go = (room: Room) => {
    const r = ROOMS[room];
    if (r.ext) window.open(r.to, "_blank", "noopener");
    else void navigate({ to: r.to });
  };
  // an application sent from this browser, still waiting for its invite
  const [applied] = useState(() => waitingApplication(storageGet()));
  const { fig } = useFigure<typeof import("./figures/lobby-office"), LobbyOffice>(
    office,
    figHost,
    reduced,
    () => Promise.all([import("./figures/lobby-office.svg?raw"), import("./figures/lobby-office")]),
    (svg, m) => m.mountLobbyOffice(svg, { reduced, onPoint: (r) => tour.current.take(r), onLeave: () => tour.current.release(), onGo: go }),
    (f) => {
      if (s.current.board) f.setData(s.current.board);
      f.light(s.current.lit);
      tour.current.maybe();
    },
    inDoc,
  );

  // ---- rooms: part, pin and directory line light together; the tour, and the visitor taking over ----
  const light = (room: Room | null) => {
    s.current.lit = room;
    setLit(room);
    fig.current?.light(room);
  };
  const stop = () => {
    s.current.gen++;
    clearTimeout(s.current.timer);
  };
  const step = async () => {
    const f = fig.current;
    if (!f) return;
    const g = ++s.current.gen;
    const room = ORDER[s.current.idx];
    light(room);
    await f.run(room);
    if (g !== s.current.gen) return;
    s.current.timer = window.setTimeout(() => {
      if (g !== s.current.gen) return;
      s.current.idx = (s.current.idx + 1) % ORDER.length;
      if (s.current.idx) return void step();
      light(null);
      s.current.timer = window.setTimeout(() => {
        if (g !== s.current.gen) return;
        f.reset();
        void step();
      }, 1600);
    }, 1500);
  };
  const can = () => !reduced && !s.current.paused && s.current.inView && !s.current.held && s.current.ready && !document.hidden && !!fig.current;
  const maybe = () => {
    if (can()) void step();
  };
  const take = (room: Room) => {
    clearTimeout(s.current.resume);
    s.current.held = true;
    stop();
    if (s.current.lit === room) return;
    light(room);
    if (!reduced) void fig.current?.run(room);
  };
  const release = () => {
    clearTimeout(s.current.resume);
    s.current.resume = window.setTimeout(() => {
      s.current.held = false;
      if (s.current.lit) s.current.idx = (ORDER.indexOf(s.current.lit) + 1) % ORDER.length;
      light(null);
      maybe();
    }, 6000);
  };
  const tour = useRef({ take, release, maybe, stop });
  tour.current = { take, release, maybe, stop };

  // the tour starts once the pins have landed, in view, while the tab shows
  useEffect(() => {
    if (!inDoc) return;
    const st = s.current;
    const t = window.setTimeout(() => {
      st.ready = true;
      tour.current.maybe();
    }, 1500);
    const io = new IntersectionObserver(
      ([e]) => {
        st.inView = e.isIntersecting;
        if (st.inView) tour.current.maybe();
        else tour.current.stop();
      },
      { threshold: 0.35 },
    );
    io.observe(office.current!);
    const vis = () => (document.hidden ? tour.current.stop() : tour.current.maybe());
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t);
      clearTimeout(st.resume);
      st.gen++;
      clearTimeout(st.timer);
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [inDoc]);

  // the board copy's N and blocks, for the office and the readout
  useEffect(() => {
    let live = true;
    readBoard()
      .then((b) => {
        if (!live || !b) return;
        s.current.board = b;
        setBoard(b);
        fig.current?.setData(b);
      })
      .catch(() => undefined); // the office then shows no N; every room still works
    return () => {
      live = false;
    };
  }, [fig]);

  const togglePause = () => {
    const p = !s.current.paused;
    s.current.paused = p;
    setPaused(p);
    if (p) stop();
    else {
      s.current.held = false;
      maybe();
    }
  };

  const point = (room: Room) => ({
    onPointerEnter: () => take(room),
    onPointerLeave: release,
    onFocus: () => take(room),
    onBlur: release,
  });
  const on = (room: Room) => (lit === room ? " is-on" : "");
  const data = lit ? roomData(lit, board) : null;

  return (
    <Page wide>
      <div className="lobby">
        <header className="lobby-head">
          <p className="tag">
            <span className="stamp" lang="ja" aria-hidden="true">
              登
            </span>
            <span lang="ja">登記所</span>
            <span>Registry office</span>
          </p>
          <h1>
            <span className="l">Zcash stops double-spending.</span> <span className="l">JitsuinFi stops double-financing.</span>
          </h1>
          <p className="lede">Every invoice leaves one fingerprint on a public board, so it is financed once; amounts, parties and documents stay shielded.</p>
          {/* the landing tells the whole story: a plain link, it is another world */}
          <p className="what">
            <a href="/">What is this?</a>
          </p>
        </header>

        <figure className="office" ref={office} aria-labelledby="office-cap">
          <div className="office-stage">
            <div className="office-art">
              <div className="office-svg" ref={figHost} />
              {PINS.map((room) => {
                const head = (
                  <span className="pin-head">
                    <b lang="ja">{ROOMS[room].kanji}</b>
                    <span className="pin-name">{ROOMS[room].short}</span>
                  </span>
                );
                const r = ROOMS[room];
                return r.ext ? (
                  <a key={room} href={r.to} target="_blank" rel="noopener" className={`pin${on(room)}`} data-room={room} tabIndex={-1} aria-hidden="true" {...point(room)}>
                    {head}
                  </a>
                ) : (
                  <Link key={room} to={r.to} className={`pin${on(room)}`} data-room={room} tabIndex={-1} aria-hidden="true" {...point(room)}>
                    {head}
                  </Link>
                );
              })}
            </div>
          </div>
          <figcaption className="office-cap" id="office-cap">
            <p className="readout">
              {lit && data ? (
                <>
                  <b lang="ja">{ROOMS[lit].kanji}</b>
                  <strong>{ROOMS[lit].title}</strong>
                  {data.lines.map((d) => (data.mono ? <code key={d}>{d}</code> : <span key={d}>{d}</span>))}
                </>
              ) : (
                <span>Point at a room, or pick one from the directory.</span>
              )}
            </p>
            {reduced ? null : (
              <button className="tour" type="button" aria-pressed={paused} onClick={togglePause}>
                {paused ? (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 1.6v8.8L10.4 6z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="2" y="1.5" width="2.8" height="9" rx="1" />
                    <rect x="7.2" y="1.5" width="2.8" height="9" rx="1" />
                  </svg>
                )}
                <span>{paused ? "Play tour" : "Pause tour"}</span>
              </button>
            )}
          </figcaption>
        </figure>

        <nav className="lobby-dir" aria-label="Directory">
          {GROUPS.map((g, gi) => (
            <section className="group" key={g.title} aria-labelledby={`lobby-g${gi}`}>
              <h2 id={`lobby-g${gi}`}>
                {g.title} <span>{g.note}</span>
              </h2>
              <ul className="rooms">
                {g.rooms.map((room) => {
                  const r = ROOMS[room];
                  const body = (
                    <>
                      <span className="room-k" lang="ja" aria-hidden="true">
                        {r.kanji}
                      </span>
                      <span className="room-t">
                        <strong>{r.title}</strong>
                        <span>{r.text}</span>
                      </span>
                      <svg className="room-go" viewBox="0 0 18 18" aria-hidden="true">
                        <path d="M4 9h9.5M9.5 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  );
                  return (
                    <li key={room}>
                      {r.ext ? (
                        <a className={`room${on(room)}`} href={r.to} target="_blank" rel="noopener" data-room={room} {...point(room)}>
                          {body}
                          <span className="sr-only"> (opens the demo console in a new tab)</span>
                        </a>
                      ) : (
                        <Link className={`room${on(room)}`} to={r.to} data-room={room} {...point(room)}>
                          {body}
                        </Link>
                      )}
                      {room === "financier" ? (
                        <>
                          <p className="aside">
                            {"Opens the demo console. Have a node? Your console is at "}
                            <a href={CONSOLE_URL} target="_blank" rel="noopener">
                              {CONSOLE_HOST}
                            </a>
                            {". "}
                            {applied ? (
                              <>
                                {`Application sent ${applied.day} · `}
                                <Link to="/apply">Check for your invite</Link>
                              </>
                            ) : (
                              <>
                                {"No node yet? "}
                                <Link to="/apply">Apply as a financier</Link>
                                {"."}
                              </>
                            )}
                          </p>
                          <p className="aside">
                            <Link to="/financier">Write an assignment letter</Link>
                          </p>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </div>
      <Mounted then={() => setInDoc(true)} />
    </Page>
  );
}
