// Exhibit A as the slip B's receipt printer prints (M-03, D-44, reference PIN-06): the double
// signature without the deal. Every line comes from `verifyExhibitOnBoard` (the same rule as
// `jitsuin verify --exhibit`); the bars at the foot are N's own 32 bytes, so each exhibit prints
// its own barcode. The paper feeds out line by line over 1.2s (linear).
import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { inView } from "motion";
import { json, wasm } from "../../lib/core";
import { download } from "../../lib/download";
import { run, wait } from "./anim";

interface At {
  txid: string;
  height: number;
  tx_index?: number;
}
interface ExhibitOnBoard {
  holds: boolean;
  signatures: { ok: boolean; error?: string; nullifier?: string; supplier_pk?: string };
  first: { claimed_at: At | null; on_board: boolean | null };
  second: { claimed_at: At | null; on_board: boolean | null };
  ordered: boolean | null;
  board_entries: number | null;
  binds: boolean | null;
}

const where = (a: At | null) => (a ? `block ${a.height} · tx ${a.tx_index ?? "?"}` : "not posted");
const mark = (ok: boolean | null) => (ok === null ? "?" : ok ? "✓" : "✗");

/** N's bytes as bars: each nibble sets a bar's width, so the code is the fingerprint itself. */
function Bars({ n }: { n: string }): ReactNode {
  let x = 0;
  const rects = [...n].map((c, i) => {
    const w = 1 + (parseInt(c, 16) % 4);
    const r = <rect key={i} x={x} width={w * 0.9} height={40} />;
    x += w + 1;
    return r;
  });
  return (
    <svg viewBox={`0 0 ${x} 40`} aria-hidden="true" preserveAspectRatio="none">
      {rects}
    </svg>
  );
}

/** The slip's lines, in print order. */
function slipLines(r: ExhibitOnBoard, line: string): ReactElement[] {
  const n = r.signatures.nullifier ?? "";
  return [
    <p className="rc-title">EXHIBIT A</p>,
    <p className="rc-sub">{r.holds ? "Double signature, on the board" : "Does not hold on this board data"}</p>,
    <p className="rc-rule" />,
    <p>
      <span>Fingerprint N</span>
      <code>{n}</code>
    </p>,
    <p>
      <span>Supplier key</span>
      <code>{r.signatures.supplier_pk ?? ""}</code>
    </p>,
    <p className="rc-rule" />,
    <p className="rc-check">
      <b>{mark(r.signatures.ok)}</b>one key signed N for two financiers
    </p>,
    <p className="rc-check">
      <b>{mark(r.first.on_board)}</b>
      {`entry ① ${where(r.first.claimed_at)}`}
    </p>,
    <p className="rc-check">
      <b>{mark(r.second.on_board)}</b>
      {`entry ② ${where(r.second.claimed_at)}`}
    </p>,
    <p className="rc-check">
      <b>{mark(r.ordered)}</b>① came before ②
    </p>,
    <p className="rc-rule" />,
    <p className="rc-small">Names no invoice, amount, buyer or financier. Whoever holds the invoice can check it is this one.</p>,
    <div className="rc-bars">
      <Bars n={n} />
    </div>,
    <p className="rc-small">{`Checked in this browser by the rule of jitsuin verify --exhibit. ${line}`}</p>,
  ];
}

export function Printer({ load, button, out }: { load: () => Promise<{ exhibit: string; board: string; line: string }>; button: RefObject<HTMLButtonElement | null>; out: RefObject<HTMLDivElement | null> }): ReactNode {
  const [lines, setLines] = useState<ReactElement[]>([]);
  const [shown, setShown] = useState(0);
  const [printed, setPrinted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false);
  const [failed, setFailed] = useState("");
  const el = useRef<HTMLDivElement>(null);
  const text = useRef("");
  const slip = useRef<HTMLDivElement>(null);

  const print = async () => {
    setBusy(true);
    try {
      const { exhibit, board, line } = await load();
      text.current = exhibit;
      const r = json<ExhibitOnBoard>(wasm.verifyExhibitOnBoard(exhibit, board, null));
      const all = slipLines(r, line);
      setFailed("");
      setLines(all);
      setShown(0);
      setPrinted(true);
      for (let i = 0; i < all.length; i++) {
        setShown(i + 1);
        await wait(1200 / all.length);
      }
      setKeep(true);
    } catch (e) {
      setLines([]);
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // each new line feeds out of the printer
  useLayoutEffect(() => {
    const l = shown ? slip.current?.children[shown - 1] : null;
    if (l instanceof HTMLElement) void run(l, { opacity: [0, 1], y: [-6, 0], duration: 160 });
  }, [shown]);
  const printRef = useRef(print);
  printRef.current = print;

  // B prints the slip as soon as the printer comes into view; the button prints it again.
  useEffect(
    () =>
      inView(
        el.current!,
        () => {
          if (out.current?.dataset.printed !== "true" && !button.current?.disabled) void printRef.current();
        },
        { amount: 0.4 },
      ),
    [button, out],
  );

  return (
    <div className="rc" ref={el}>
      <div className="rc-machine" aria-hidden="true">
        <span className="rc-brand" lang="ja">
          証拠
        </span>
        <span className="rc-light" />
        <span className="rc-mouth" />
      </div>
      <div className="rc-out" data-printed={printed ? "true" : undefined} ref={out}>
        <div className="rc-slip" aria-live="polite" ref={slip}>
          {failed ? <p className="rc-small">{failed}</p> : lines.slice(0, shown).map((l, i) => cloneElement(l, { key: i }))}
        </div>
      </div>
      <div className="rc-actions">
        <button type="button" className="seal-btn" disabled={busy} ref={button} onClick={() => void print()}>
          <span>Print it again</span>
        </button>
        <button type="button" className="ink-link" hidden={!keep} onClick={() => download("exhibit-a.txt", text.current)}>
          Keep it (exhibit-a.txt)
        </button>
      </div>
    </div>
  );
}
