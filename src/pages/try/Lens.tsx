// The lens (M-04, HNK-30.T6; HNK-34.T2 case desk): hold the 視 hanko and the pool closes over
// every human field of the 請求書, bar after bar, while financier A's board memo comes up on the
// slab beside it: what anyone holding the published board key reads. N stays open on both sides.
// Honest by addition: what the key also shows is printed under the hanko. Release and it opens.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ease, still, tween } from "./anim";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-8)}`;

export interface LensData {
  invoice: { id: string; amount: string; buyer: string; due: string };
  memo: { kind: string; n: string; commitment: string; classes: string; signature: string; where: string };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function Lens({ load }: { load: () => Promise<LensData> }): ReactNode {
  const [data, setData] = useState<LensData | null>(null);
  const [failed, setFailed] = useState("");
  const [pressed, setPressed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const m = useRef({ burn: 0, target: 0, running: null as Promise<void> | null });

  // each bar and memo row reads a CSS variable written every frame (CSSOM, CSP-safe)
  const set = (v: number) => {
    m.current.burn = v;
    ring.current?.style.setProperty("--p", v.toFixed(3));
    const s = stage.current;
    if (s) {
      s.querySelectorAll<HTMLElement>(".rd").forEach((r, i) => r.style.setProperty("--k", ease.softLand(clamp((v - i * 0.08) / 0.45)).toFixed(3)));
      s.querySelectorAll<HTMLElement>(".ln-row").forEach((r, i) => r.style.setProperty("--o", (0.12 + 0.88 * clamp((v - 0.3 - i * 0.08) / 0.3)).toFixed(3)));
    }
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
    void load().then(setData, (e) => setFailed(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the rows arrive with the data: paint them at the current burn
  useEffect(() => set(m.current.burn), [data]);

  const field = (k: string, v: ReactNode, jp = false, mono = true) => (
    <p className="ln-f">
      <span lang={jp ? "ja" : undefined}>{k}</span>
      <em>
        {mono ? <code>{v}</code> : v}
        <i className="rd" />
      </em>
    </p>
  );
  const row = (k: string, v: string) => (
    <p className="ln-row">
      <span>{k}</span>
      <code>{v}</code>
    </p>
  );

  return (
    <div className="ln">
      <div className="ln-stage" ref={stage}>
        <div className="ln-paper" aria-label="What the parties hold">
          {failed ? (
            <p className="ln-fail">{failed}</p>
          ) : data ? (
            <>
              <h3 lang="ja">請 求 書</h3>
              {field("No.", data.invoice.id)}
              {field("ご請求金額", data.invoice.amount, true)}
              {field("御中", short(data.invoice.buyer), true)}
              {field("支払期日", data.invoice.due, true)}
              {field("Financier", "A, by name in the letter", false, false)}
              <p className="ln-f is-n">
                <span>N</span>
                <em>
                  <code>{short(data.memo.n)}</code>
                </em>
              </p>
              <span className="ln-seal" aria-hidden="true">
                <svg viewBox="0 0 68 68">
                  <g filter="url(#tc-ink)">
                    <circle className="seal-ink" cx="34" cy="34" r="29" />
                    <text className="seal-glyph" x="34" y="46" textAnchor="middle">
                      買
                    </text>
                  </g>
                </svg>
                <i className="rd" />
              </span>
            </>
          ) : (
            <p className="ln-fail">Reading financier A's entry on the board…</p>
          )}
        </div>
        <div className="ln-slab" aria-label="What anyone with the board key sees">
          {data ? (
            <>
              <p className="lk">{`Board memo · ${data.memo.where}`}</p>
              {row("entry", data.memo.kind)}
              {row("N", short(data.memo.n))}
              {row("financier", `commitment ${short(data.memo.commitment)}`)}
              {row("classes", data.memo.classes)}
              {row("supplier signature", short(data.memo.signature))}
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
        <span className="ln-hanko" aria-hidden="true" ref={ring}>
          <b lang="ja">視</b>
        </span>
        <span>Hold to see it as the world does</span>
      </button>
      <p className="ln-also">The key also shows the small amount each post sends to the board address, the memo's length and layout, and the block's time. No name, no amount, no buyer.</p>
    </div>
  );
}
