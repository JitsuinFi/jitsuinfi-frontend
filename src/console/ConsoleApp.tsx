// Financier console (HNK-26.T21, D-45): served on its own origin (its own Vercel project, so the
// supplier and buyer app never shares its cookies), talking to the financier's node through
// /node/* on this origin. Same sign-in sheet and palette as the app (src/auth.css, DS-PAL).
// React since HNK-31.T11: /console/pair joins from an invite, /console is the sign-in or the desk.
import "../auth.css";
import "./console.css";
import "./desk.css";
import { useEffect, useState, type ReactNode } from "react";
import { Home, type Info, type Session } from "./Home";
import { get } from "./node";
import { Pair } from "./Pair";

const isPair = () => location.pathname.endsWith("/pair") || new URLSearchParams(location.search).get("view") === "pair";

export function ConsoleApp(): ReactNode {
  const [pair] = useState(isPair);
  const [view, setView] = useState<{ session: Session; info: Info; at: number } | { error: string } | null>(null);
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    if (pair) return;
    let live = true;
    Promise.all([get<Session>("/node/console/session"), get<Info>("/node/info")]).then(
      ([session, info]) => live && setView({ session, info, at: ask }),
      (e) => live && setView({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => void (live = false);
  }, [ask, pair]);
  if (pair) return <Pair />;
  if (!view) return null;
  if ("error" in view) {
    return (
      <main className="auth">
        <section className="auth-sheet">
          <h1 className="auth-title">The node did not answer</h1>
          <p className="auth-sub">{view.error}</p>
        </section>
      </main>
    );
  }
  // a fresh desk after every sign-in or sign-out, as the old console redrew it
  return <Home key={view.at} session={view.session} info={view.info} rerender={() => setAsk((a) => a + 1)} />;
}
