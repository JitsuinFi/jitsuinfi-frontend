// The financier's side: the node console drawn on a phone at a true 19.5:9 (390 × 844 points),
// with the console's own screens: an offer arriving, its three seals, the advance waiting for the
// passkey. It plays once when it scrolls in.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { inView } from "motion";
import { dur, ease, run, still, wait } from "./anim";

export function Phone(): ReactNode {
  const el = useRef<HTMLDivElement>(null);
  const offer = useRef<HTMLDivElement>(null);
  const seals = useRef<HTMLDivElement>(null);
  const advance = useRef<HTMLDivElement>(null);
  const pass = useRef<HTMLSpanElement>(null);
  const parts = () => [offer.current!, seals.current!, advance.current!, pass.current!];
  useLayoutEffect(() => {
    if (!still()) for (const x of parts()) x.style.opacity = "0";
  }, []);
  useEffect(() => {
    if (still()) return;
    return inView(
      el.current!,
      () => {
        void (async () => {
          await run(offer.current!, { opacity: [0, 1], x: [60, 0], duration: dur.enter });
          await run(seals.current!, { opacity: [0, 1], duration: dur.enter });
          await wait(200);
          await run(advance.current!, { opacity: [0, 1], y: [10, 0], duration: dur.enter });
          await run(pass.current!, { opacity: [0, 1], scale: [0.94, 1], duration: dur.seal }, ease.snapSettle);
        })();
      },
      { amount: 0.5 },
    );
  }, []);
  const step = (glyph: string, word: string, done: boolean) => (
    <span className={done ? "is-done" : undefined}>
      <i lang="ja">{glyph}</i>
      {word}
    </span>
  );
  return (
    <div className="ph" role="img" aria-label="The financier console on a phone: an offer, its three seals, the advance waiting for the passkey" ref={el}>
      <div className="ph-screen">
        <div className="ph-status" aria-hidden="true">
          <span>9:41</span>
          <span className="ph-island" />
          <span className="ph-bat" />
        </div>
        <p className="ph-app">
          <span className="ph-mark" lang="ja">
            印
          </span>
          Financier console
        </p>
        <p className="ph-h">Mailbox</p>
        <div className="ph-offer" ref={offer}>
          <span className="ph-badge" lang="ja">
            売
          </span>
          <div>
            <b>Financing offer</b>
            <small>from a supplier · just now</small>
          </div>
          <span className="ph-ok" lang="ja">
            認
          </span>
        </div>
        <p className="ph-h">Seals on the letter</p>
        <div className="ph-seals" ref={seals}>
          {step("売", "supplier", true)}
          {step("買", "buyer", true)}
          {step("証", "you", false)}
        </div>
        <div className="ph-adv" ref={advance}>
          <small>Advance, waiting for your passkey</small>
          <strong>0.00036</strong>
          <span>ZEC</span>
        </div>
        <span className="ph-pass" ref={pass}>
          <i aria-hidden="true" />
          Approve with passkey
        </span>
        <span className="ph-home" aria-hidden="true" />
      </div>
    </div>
  );
}
