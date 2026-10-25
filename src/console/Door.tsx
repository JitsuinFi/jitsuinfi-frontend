// The door to the financier's node (HNK-34.T5, sample console-signin.html): a sliding shoji door
// on paper with the 融 plaque and the financier's nameplate; its lock is a seal seat, and the
// passkey is the seal. Pressed, the seal lands in the lock and the door slides open onto the dark
// node room (the only dark blue: it is the node). Pairing hangs the invite on a 合鍵 key tag.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { dur, ease, reducedMotion } from "../landing/motion";
import { short, tagGroups } from "./model";

const fn = (f: (t: number) => number) => () => f;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface DoorFacts {
  network?: string;
  mailbox_id?: string;
  wallet_address?: string;
}

/** The door's seal: `press()` lands it in the lock and slides the door open. */
export function useDoor() {
  const seal = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [inked, setInked] = useState(false);
  const press = useCallback(async () => {
    const el = seal.current;
    if (el && !reducedMotion()) {
      await animate(el, { opacity: { from: 0, to: 1 }, scale: { from: 1.5, to: 1 }, rotate: { from: -10, to: 0 }, duration: dur.seal, ease: fn(ease.snapSettle) });
      await animate(el, { scale: [1, 0.94, 1], duration: dur.press });
      setInked(true);
      await animate(el, { opacity: { from: 1, to: 0 }, scale: { from: 1, to: 1.08 }, duration: dur.exit, ease: fn(ease.accelExit) });
      await wait(dur.fade);
    }
    setInked(true);
    setOpen(true);
    await wait(reducedMotion() ? 0 : 900);
  }, []);
  return { seal, open, inked, press };
}

export type Lock = "waiting" | "empty";

export function Door({
  door,
  lock,
  empty,
  cap,
  capKanji,
  name,
  facts,
  room,
  silent,
  closed,
  tag,
  tagUsed,
  ready,
}: {
  door: ReturnType<typeof useDoor>;
  lock: Lock;
  empty?: string;
  cap: string;
  capKanji: string;
  name: string | null;
  facts: DoorFacts | null;
  room: string;
  silent?: boolean;
  closed?: boolean;
  /** The invite code engraved on the key tag, while pairing. */
  tag?: string | null;
  tagUsed?: boolean;
  /** Paired: the door stands open. */
  ready?: boolean;
}): ReactNode {
  const open = door.open || ready;
  const cls = `cs-door${open ? " is-open" : ""}${silent ? " is-silent" : ""}`;
  const lockCls = `cs-lock${door.inked ? "" : lock === "empty" ? " is-empty" : " is-waiting"}`;
  return (
    <div className={cls} role="img" aria-label="The door to your node: a sliding door with a seal lock. Your passkey is the seal that opens it.">
      <div className="cs-lintel">
        <p className="cs-plaque">
          <b lang="ja">融</b>
          <span lang="ja">融資者</span>
          <small>Financier · node</small>
        </p>
      </div>
      <div className="cs-opening">
        <div className="cs-room" aria-hidden="true">
          <span className="cs-lamp" />
          <span className="cs-rk" lang="ja">
            融
          </span>
          <h2>Your node</h2>
          {facts && (facts.network || facts.mailbox_id || facts.wallet_address) ? (
            <dl>
              {facts.network ? (
                <>
                  <dt>network</dt>
                  <dd>{facts.network === "main" ? "Zcash mainnet" : "Zcash testnet"}</dd>
                </>
              ) : null}
              {facts.mailbox_id ? (
                <>
                  <dt>mailbox</dt>
                  <dd>{short(facts.mailbox_id)}</dd>
                </>
              ) : null}
              {facts.wallet_address ? (
                <>
                  <dt>wallet</dt>
                  <dd>{short(facts.wallet_address)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <p>{room}</p>
        </div>
        <div className="cs-slide is-l" />
        <div className="cs-slide is-r" />
        <div className={lockCls}>
          <svg className="cs-imp" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="ring" cx={60} cy={60} r={54} />
            <text x={60} y={80}>
              融
            </text>
          </svg>
          <span className="cs-lock-empty">{empty}</span>
        </div>
        <span className="cs-lock-cap">
          <b lang="ja">{capKanji}</b>
          {cap}
        </span>
        <span className="cs-press" ref={door.seal} aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx={60} cy={60} r={54} />
            <text x={60} y={80}>
              融
            </text>
          </svg>
        </span>
      </div>
      <span className="cs-gap" aria-hidden="true" />
      <span className="cs-post is-l" />
      <span className="cs-post is-r" />
      <span className="cs-nameplate" aria-hidden="true">
        <span>{name || "融資者"}</span>
      </span>
      {tag !== undefined && tag !== null ? (
        <div className={`cs-tag${tagUsed ? " is-used" : ""}`} aria-hidden="true">
          <b lang="ja">合鍵</b>
          <small>Invite code</small>
          <code>
            {tagGroups(tag).map((g, i) => (g ? <span key={i}>{g}</span> : <i key={i}>····</i>))}
          </code>
        </div>
      ) : null}
      {closed ? (
        <div className="cs-closed">
          <b lang="ja">閉</b>
          <small>The console is off on this node</small>
        </div>
      ) : null}
      <span className="cs-sill" />
    </div>
  );
}
