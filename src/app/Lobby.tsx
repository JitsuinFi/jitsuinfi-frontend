// The 登記所 lobby (/app; HNK-30.T15, MASTER.md §8): every screen is a counter behind a noren
// curtain with its seal glyph: 試 try, 売 sell, 買 buy, 資 fund, 証 verify, 外 outside, 価 price.
// Role counters hang plum noren (people and their documents), public counters navy (what anyone
// can check). The curtain parts on hover; the counter opens on click. Styles: pages/lobby.css.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Page } from "./AppShell";

type Door = { to: string; kanji: string; title: string; text: string; kind: "role" | "public" };

const DOORS: Door[] = [
  { to: "/try", kanji: "試", title: "Try to double-finance", text: "Sell one invoice twice and watch it fail. No wallet needed.", kind: "public" },
  { to: "/supplier", kanji: "売", title: "Supplier", text: "Issue an invoice and get it financed once.", kind: "role" },
  { to: "/buyer", kanji: "買", title: "Buyer", text: "Sign, acknowledge and pay with keys from your passkey.", kind: "role" },
  { to: "/member", kanji: "資", title: "Fund member", text: "See what the fund holds for you.", kind: "role" },
  { to: "/verify", kanji: "証", title: "Verify", text: "Check a deal or catch a double financing.", kind: "public" },
  { to: "/outsider", kanji: "外", title: "What outsiders see", text: "Codes and hashes. Nothing about the parties.", kind: "public" },
  { to: "/rates", kanji: "価", title: "Rate index", text: "Market prices from the board, no parties.", kind: "public" },
];

export function Lobby(): ReactNode {
  return (
    <Page wide>
      <div className="lobby" data-wide="true">
        <header className="lobby-head">
          <p className="lobby-sign" lang="ja">
            登 記 所
          </p>
          <h1>
            Zcash stops double-spending. <span>JitsuinFi stops double-financing.</span>
          </h1>
          <p>Every invoice leaves one fingerprint on a public board, so it is financed once; amounts, parties and documents stay shielded.</p>
          <span className="lobby-seal" aria-hidden="true" lang="ja">
            <b>実</b>
            <b>印</b>
          </span>
        </header>
        <nav className="lobby-doors" aria-label="Counters">
          {DOORS.map((d, i) => (
            <Link key={d.to} to={d.to} className={`door is-${d.kind}${i === 0 ? " is-first" : ""}`}>
              <span className="door-way" aria-hidden="true">
                <span className="noren">
                  <i />
                  <i>
                    <b lang="ja">{d.kanji}</b>
                  </i>
                  <i />
                </span>
              </span>
              <strong>{d.title}</strong>
              <span>{d.text}</span>
            </Link>
          ))}
        </nav>
      </div>
    </Page>
  );
}
