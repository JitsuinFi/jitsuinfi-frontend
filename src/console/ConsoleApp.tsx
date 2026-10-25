// Financier console (HNK-26.T21, D-45): served on its own origin (its own Vercel project, so the
// supplier and buyer app never shares its cookies), talking to the financier's node through
// /node/* on this origin. React since HNK-31.T11: /console/pair joins from an invite, /console is
// the sign-in or the desk. Drawn from the approved samples since HNK-34.T5 (console.css): the door
// to the node, then the financier's desk; DS-PAL palette.
import "./console.css";
import { useEffect, useState, type ReactNode } from "react";
import { Home, type Info, type Session } from "./Home";
import { get } from "./node";
import { Pair } from "./Pair";
import { NoAnswer } from "./SignIn";

const isPair = () => location.pathname.endsWith("/pair") || new URLSearchParams(location.search).get("view") === "pair";

export function ConsoleApp(): ReactNode {
  const [pair] = useState(isPair);
  const [view, setView] = useState<{ session: Session; info: Info; at: number } | { error: string } | null>(null);
  const [pairInfo, setPairInfo] = useState<Info | null>(null);
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    let live = true;
    if (pair) {
      // the door's room shows the node's public facts, when the node answers
      get<Info>("/node/info").then(
        (info) => live && setPairInfo(info),
        () => undefined,
      );
      return () => void (live = false);
    }
    Promise.all([get<Session>("/node/console/session"), get<Info>("/node/info")]).then(
      ([session, info]) => live && setView({ session, info, at: ask }),
      (e) => live && setView({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => void (live = false);
  }, [ask, pair]);
  if (pair) return <Pair info={pairInfo} />;
  if (!view) return null;
  if ("error" in view) return <NoAnswer error={view.error} />;
  // a fresh desk after every sign-in or sign-out, as the old console redrew it
  return <Home key={view.at} session={view.session} info={view.info} rerender={() => setAsk((a) => a + 1)} />;
}
