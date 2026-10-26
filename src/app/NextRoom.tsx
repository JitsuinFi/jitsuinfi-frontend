// The end of a public page (nav audit 2026-10-25): one row to the next room of the visitor's walk,
// as the lobby's directory draws a room (kanji, title, one line, arrow): Try, Verify, What
// outsiders see, Rate index, then back to the lobby (src/app/lobby-data.ts PUBLIC_WALK).
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { nextRoom, type Room } from "./lobby-data";

export function NextRoom({ from }: { from: Room }): ReactNode {
  const r = nextRoom(from);
  return (
    <nav className="next-room" aria-label="Next room">
      <p className="next-room-k">Next room</p>
      <Link className="next-room-row" to={r.to}>
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
      </Link>
    </nav>
  );
}
