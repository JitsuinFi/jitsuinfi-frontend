// Exhibit A as the tag B hangs on a red string (M-03, D-44; HNK-34.T2 case desk): the double
// signature without the deal. Every line comes from `verifyExhibitOnBoard` (the same rule as
// `jitsuin verify --exhibit`); the bars at the foot are N's own 32 bytes, so each exhibit carries
// its own barcode. The tag drops onto its pin (the page's one popOver), then its lines are written
// one after another over 1.2s.
import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { inView } from "motion";
import { json, wasm } from "../../lib/core";
import { download } from "../../lib/download";
import { dur, ease, run, still, wait } from "./anim";

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
export function Bars({ n, className }: { n: string; className?: string }): ReactNode {
  let x = 0;
  const rects = [...n].map((c, i) => {
    const w = 1 + (parseInt(c, 16) % 4);
    const r = <rect key={i} x={x} width={w * 0.9} height={40} />;
    x += w + 1;
    return r;
  });
  return (
    <svg className={className} viewBox={`0 0 ${Math.max(1, x)} 40`} aria-hidden="true" preserveAspectRatio="none">
      {rects}
    </svg>
  );
}

/** The tag's lines, in writing order. */
function tagLines(r: ExhibitOnBoard, line: string): ReactElement[] {
  const n = r.signatures.nullifier ?? "";
  return [
    <p className="ex-line ex-title">Exhibit A</p>,
    <p className="ex-line ex-sub">{r.holds ? "Double signature, on the board" : "Does not hold on this board data"}</p>,
    <p className="ex-line ex-rule" />,
    <p className="ex-line ex-kv">
      <span>Fingerprint N</span>
      <code>{n}</code>
    </p>,
    <p className="ex-line ex-kv">
      <span>Supplier key</span>
      <code>{r.signatures.supplier_pk ?? ""}</code>
    </p>,
    <p className="ex-line ex-rule" />,
    <p className="ex-line ex-check">
      <b>{mark(r.signatures.ok)}</b>one key signed N for two financiers
    </p>,
    <p className="ex-line ex-check">
      <b>{mark(r.first.on_board)}</b>
      {`entry ① ${where(r.first.claimed_at)}`}
    </p>,
    <p className="ex-line ex-check">
      <b>{mark(r.second.on_board)}</b>
      {`entry ② ${where(r.second.claimed_at)}`}
    </p>,
    <p className="ex-line ex-check">
      <b>{mark(r.ordered)}</b>① came before ②
    </p>,
    <p className="ex-line ex-rule" />,
    <p className="ex-line ex-small">Names no invoice, amount, buyer or financier. Whoever holds the invoice can check it is this one.</p>,
    <p className="ex-line">
      <Bars n={n} className="ex-bars" />
    </p>,
    <p className="ex-line ex-small">{`Checked in this browser by the rule of jitsuin verify --exhibit. ${line}`}</p>,
  ];
}

export function Exhibit({ load, button, out }: { load: () => Promise<{ exhibit: string; board: string; line: string }>; button: RefObject<HTMLButtonElement | null>; out: RefObject<HTMLDivElement | null> }): ReactNode {
  const [lines, setLines] = useState<ReactElement[]>([]);
  const [shown, setShown] = useState(0);
  const [printed, setPrinted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false);
  const [failed, setFailed] = useState("");
  const hang = useRef<HTMLDivElement>(null);
  const text = useRef("");
  const tag = useRef<HTMLDivElement>(null);

  const print = async () => {
    setBusy(true);
    try {
      const { exhibit, board, line } = await load();
      text.current = exhibit;
      const r = json<ExhibitOnBoard>(wasm.verifyExhibitOnBoard(exhibit, board, null));
      const all = tagLines(r, line);
      setFailed("");
      setLines(all);
      setShown(0);
      setPrinted(true);
      // the tag drops onto its pin: the page's one popOver
      await run(hang.current!, { y: [-40, 0], rotate: [-6.2, 0], duration: dur.proof + 300 }, ease.popOver);
      for (let i = 0; i < all.length; i++) {
        setShown(i + 1);
        await wait(dur.bleed / all.length);
      }
      setShown(all.length);
      setKeep(true);
    } catch (e) {
      setLines([]);
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // each new line is written onto the tag; a check mark lands like a small stamp
  useLayoutEffect(() => {
    if (still()) return;
    const l = shown ? tag.current?.querySelectorAll(".ex-line")[shown - 1] : null;
    if (!(l instanceof HTMLElement)) return;
    void run(l, { opacity: [0, 1], y: [-6, 0], duration: 160 });
    const b = l.querySelector("b");
    if (b) void run(b, { scale: [1.6, 1], duration: dur.seal }, ease.snapSettle);
  }, [shown]);
  const printRef = useRef(print);
  printRef.current = print;

  // B hangs the tag as soon as it comes into view; the button writes it again.
  useEffect(
    () =>
      inView(
        hang.current!,
        () => {
          if (out.current?.dataset.printed !== "true" && !button.current?.disabled) void printRef.current();
        },
        { amount: 0.4 },
      ),
    [button, out],
  );

  return (
    <div className="ex-visual">
      <div className="ex-hang" ref={hang}>
        <span className="ex-pin" aria-hidden="true" />
        <span className="ex-string" aria-hidden="true" />
        <div className="ex-tag" aria-live="polite" ref={tag}>
          <span className="tag-hole" aria-hidden="true" />
          {failed ? (
            <p className="ex-small">{failed}</p>
          ) : lines.length ? (
            lines.slice(0, shown).map((l, i) => cloneElement(l, { key: i }))
          ) : (
            <p className="ex-small">B writes Exhibit A when this tag comes into view.</p>
          )}
        </div>
      </div>
      <div className="ex-actions" data-printed={printed ? "true" : undefined} ref={out}>
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
