// The seal registration card 印鑑登録証 beside the sign-in sheet (HNK-30.T15, MASTER.md §8): a
// passkey is the user's jitsuin, the registered seal of JitsuinFi's name. The card follows the
// sheet as the user types: the username on the name line, the chosen role carved into the seal
// (売 supplier, 買 buyer, 資 fund member). Signed in, the seal is pressed and the card shows the
// passkey's real fingerprint. Nothing here is sent anywhere; it only reads the sheet and session.
// React since HNK-31.T7: the sheet tells the card what it shows (`view`).
import { useEffect, useRef, type ReactNode } from "react";
import { account } from "../lib/app-session";
import { dur, ease, run, still } from "./try/anim";
// stylesheet: loaded with the app shell (src/app/legacy-main.ts), in its old place in the cascade

const KANJI: Record<string, string> = { supplier: "売", buyer: "買", member: "資" };
const WORD: Record<string, string> = { supplier: "Supplier", buyer: "Buyer", member: "Fund member" };

/** What the sheet shows: the username typed, the role chosen, and whether the passkey is next. */
export interface SheetView {
  username: string;
  role: string;
  carving: boolean;
}

export function SealCard({ view }: { view: SheetView }): ReactNode {
  const s = account.current;
  const r = s?.role ?? view.role;
  const hanko = useRef<HTMLSpanElement>(null);
  const impression = useRef<HTMLSpanElement>(null);
  const pressed = useRef(false);

  useEffect(() => {
    if (s && !pressed.current) {
      pressed.current = true;
      if (!still()) {
        void (async () => {
          await run(hanko.current!, { y: [-40, 18], duration: dur.seal }, ease.snapSettle);
          void run(impression.current!, { scale: [1.4, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
          await run(hanko.current!, { y: [18, -40], duration: dur.exit }, ease.accelExit);
        })();
      }
    }
    if (!s) pressed.current = false;
  });

  const status = s
    ? "Registered. Your passkey signs for you; JitsuinFi never sees it."
    : view.carving
      ? "Your device is about to carve this seal into a passkey."
      : "Your passkey is your jitsuin: a seal only your device can press.";
  return (
    <aside className="sc" aria-label="Your seal registration card" data-state={s ? "registered" : r ? "carved" : "blank"}>
      <article className="sc-card">
        <header>
          <p className="sc-t" lang="ja">
            印鑑登録証
          </p>
          <p className="sc-sub">Seal registration card · JitsuinFi</p>
        </header>
        <dl>
          <dt>
            <span lang="ja">氏名</span>Name
          </dt>
          <dd>{view.username || (s ? "your passkey" : "not yet registered")}</dd>
          <dt>
            <span lang="ja">資格</span>Role
          </dt>
          <dd>{r ? WORD[r] : "choose a role"}</dd>
          <dt>
            <span lang="ja">印影</span>Fingerprint
          </dt>
          <dd className="is-mono">{s ? s.fingerprint : "made by your device, never leaves it"}</dd>
        </dl>
        <div className="sc-seat">
          <span className="sc-impression" aria-hidden="true" ref={impression}>
            <b lang="ja">{r ? KANJI[r] : ""}</b>
          </span>
          <small lang="ja">登録印</small>
        </div>
        <p className="sc-status">{status}</p>
      </article>
      <span className="sc-hanko" aria-hidden="true" ref={hanko}>
        <span className="sc-hanko-knob" />
        <span className="sc-hanko-body" />
        <span className="sc-hanko-face" />
      </span>
    </aside>
  );
}
