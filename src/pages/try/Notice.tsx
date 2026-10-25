// What the board does not stop (N-13), posted as the registry's official notice 告示 (HNK-34.T2):
// one pinned document, three clauses cited the way a notice cites them, the registry's square
// seal pressed over its foot. It is pinned up when it scrolls in: the sheet lands, the pins
// press in, the seal comes down last.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { inView } from "motion";
import { dur, ease, run, still, wait } from "./anim";

const CLAUSES: Array<[string, string]> = [
  ["第一", "A fake invoice that the buyer itself co-signs. The buyer's signature is real, so the board sees a new invoice."],
  ["第二", "One delivery split into two invoices that the buyer both signs."],
  ["第三", "A financier that does not check the board before paying."],
];

export function Notice(): ReactNode {
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!still()) el.current!.style.opacity = "0";
  }, []);
  useEffect(() => {
    if (still()) return;
    const n = el.current!;
    return inView(
      n,
      () => {
        void (async () => {
          await run(n, { y: [-28, 0], rotate: [-2.5, 0], opacity: [0, 1], duration: dur.enter }, ease.softLand);
          for (const p of n.querySelectorAll(".nt-pin")) void run(p, { scale: [1.4, 1], duration: dur.seal }, ease.snapSettle);
          await wait(300);
          void run(n.querySelector(".nt-seal")!, { scale: [1.5, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
        })();
      },
      { amount: 0.4 },
    );
  }, []);
  return (
    <article className="nt" aria-label="Notice: what this does not stop" ref={el}>
      <span className="nt-pin is-l" aria-hidden="true" />
      <span className="nt-pin is-r" aria-hidden="true" />
      <p className="nt-head" lang="ja">
        告 示
      </p>
      <p className="nt-sub">Notice of the registry</p>
      <ol>
        {CLAUSES.map(([no, text]) => (
          <li key={no}>
            <span className="nt-no" lang="ja">
              {no}
            </span>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <span className="nt-seal" aria-hidden="true" lang="ja">
        登記
        <br />
        所印
      </span>
    </article>
  );
}
