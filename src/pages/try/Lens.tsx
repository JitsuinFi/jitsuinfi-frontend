// The lens (M-04, HNK-30.T6): hold the hanko for 1.5s and the invoice burns from its edges into
// what anyone holding the published board key reads of financier A's registration. Honest by
// addition: what the key also shows is printed under the memo. Release and the paper returns.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { still, tween } from "./anim";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-6)}`;

export interface LensData {
  invoice: { id: string; amount: string; buyer: string; due: string };
  memo: { kind: string; n: string; commitment: string; classes: string; signature: string; where: string };
}

const pairs = (rows: ReadonlyArray<readonly [string, string]>) => rows.flatMap(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v}</dd>]);

export function Lens({ load }: { load: () => Promise<LensData> }): ReactNode {
  const [data, setData] = useState<LensData | null>(null);
  const [failed, setFailed] = useState("");
  const [pressed, setPressed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const m = useRef({ burn: 0, target: 0, running: null as Promise<void> | null });

  // the burn is a CSS variable on the stage and the ring, written every frame (CSSOM, CSP-safe)
  const set = (v: number) => {
    m.current.burn = v;
    stage.current!.style.setProperty("--burn", v.toFixed(3));
    ring.current!.style.setProperty("--p", v.toFixed(3));
    setPressed(v > 0.5);
  };
  const go = async (to: number) => {
    const s = m.current;
    s.target = to;
    if (s.running) return;
    while (Math.abs(s.burn - s.target) > 0.001) {
      const t = s.target;
      s.running = tween(s.burn, t, Math.abs(t - s.burn) * (t > s.burn ? 1500 : 600), set, (x) => x);
      await s.running;
      s.running = null;
    }
  };

  useEffect(() => {
    set(0);
    void load().then(setData, (e) => setFailed(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ln">
      <div className="ln-stage" ref={stage}>
        <div className="ln-chain" aria-label="What anyone with the board key sees">
          {data ? (
            <>
              <p className="ln-k">{`Board memo · ${data.memo.where}`}</p>
              <dl>
                {pairs([
                  ["Entry", data.memo.kind],
                  ["N", short(data.memo.n)],
                  ["Financier", `commitment ${short(data.memo.commitment)}`],
                  ["Classes", data.memo.classes],
                  ["Supplier signature", short(data.memo.signature)],
                ])}
              </dl>
              <p className="ln-also">The key also shows the small amount each post sends to the board address, the memo's length and layout, and the block's time. No name, no amount, no buyer.</p>
            </>
          ) : null}
        </div>
        <div className="ln-paper" aria-label="What the parties hold">
          {failed ? (
            <p>{failed}</p>
          ) : data ? (
            <>
              <p className="ln-title" lang="ja">
                請 求 書
              </p>
              <dl>
                {pairs([
                  ["No.", data.invoice.id],
                  ["ご請求金額", data.invoice.amount],
                  ["御中", short(data.invoice.buyer)],
                  ["支払期日", data.invoice.due],
                  ["Financier", "A, by name in the letter"],
                ])}
              </dl>
              <span className="ln-seal" aria-hidden="true" lang="ja">
                買
              </span>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="ln-hold"
        aria-pressed={pressed}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void go(1);
        }}
        onPointerUp={() => void go(0)}
        onPointerCancel={() => void go(0)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            void go(m.current.target > 0.5 ? 0 : 1);
          }
        }}
        onClick={still() ? () => void go(m.current.target > 0.5 ? 0 : 1) : undefined}
      >
        <span className="ln-hanko" aria-hidden="true">
          <span className="ln-ring" ref={ring} />
          <b lang="ja">視</b>
        </span>
        <span>Hold to see it as the world does</span>
      </button>
    </div>
  );
}
