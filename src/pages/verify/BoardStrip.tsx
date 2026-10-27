// The public board on #/verify (HNK-34.T4): the only dark object on the page, a square-cornered
// Cetacean strip of the real board running to the right edge, six rows in view. When a check
// names a board entry, a scan line runs down to it and the row lights. Rows come from the board
// the page read (live, kept, bundled copy, or the visitor's file), described by wasm.
import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { ease, tween } from "../try/anim";

export interface BoardRow {
  txid: string;
  height: number;
  at: string;
  kind: string;
  n: string;
}

/** The strip's rows of a board snapshot (wasm `boardMemoDescribe` per entry). */
export function boardRows(boardJson: string, describe: (memo: string) => string): BoardRow[] {
  const list = JSON.parse(boardJson) as Array<{ txid: string; height: number; tx_index: number; output_index?: number; memo: string }>;
  return list.flatMap((e) => {
    try {
      const d = JSON.parse(describe(e.memo)) as { kind: string; nullifier?: string; settled_tag?: string };
      const kind = d.kind === "RegisterWithHistory" ? "history" : d.kind.toLowerCase();
      return [{ txid: e.txid, height: e.height, at: `${e.tx_index}·${e.output_index ?? "?"}`, kind, n: (d.nullifier ?? d.settled_tag ?? "").slice(0, 12) }];
    } catch {
      return [];
    }
  });
}

export interface BoardApi {
  set(rows: BoardRow[], note: string): void;
  /** Scans down to `txid`'s row and lights it; keeps rows already lit in view when they fit. */
  find(txid: string): Promise<void>;
  /** Unlights every row and shows the newest entries. */
  clear(): void;
}

const ROWH = 22;
const VISIBLE = 6;

export function BoardStrip({ api }: { api: Ref<BoardApi> }): ReactNode {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [note, setNote] = useState("Reading the board…");
  const [hits, setHits] = useState<ReadonlySet<string>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  const scan = useRef<HTMLElement>(null);
  const s = useRef({ rows: [] as BoardRow[], off: 0, hits: new Set<string>() });

  const to = (off: number) => {
    s.current.off = off;
    if (list.current) list.current.style.transform = `translateY(${-off * ROWH}px)`;
  };
  const newest = () => Math.max(0, s.current.rows.length - VISIBLE);

  useImperativeHandle(api, () => ({
    set(r, n) {
      s.current.rows = r;
      s.current.hits = new Set();
      setRows(r);
      setNote(n);
      setHits(new Set());
      to(Math.max(0, r.length - VISIBLE));
    },
    clear() {
      s.current.hits = new Set();
      setHits(new Set());
      scan.current?.classList.remove("on");
      to(newest());
    },
    async find(txid) {
      const all = s.current.rows;
      const i = all.findIndex((r) => r.txid === txid);
      if (i < 0) return;
      const lit = all.flatMap((r, k) => (s.current.hits.has(r.txid) ? [k] : [])).concat(i);
      const lo = Math.min(...lit);
      const hi = Math.max(...lit);
      const want = hi - lo <= VISIBLE - 1 ? Math.max(hi - VISIBLE + 1, Math.min(lo, Math.round((lo + hi) / 2) - 2)) : i - 2;
      const off = Math.max(0, Math.min(newest(), want));
      const from = s.current.off;
      scan.current?.classList.add("on");
      await tween(0, 1, 520, (t) => {
        if (list.current) list.current.style.transform = `translateY(${-(from + (off - from) * t) * ROWH}px)`;
        if (scan.current) scan.current.style.transform = `translateY(${t * (i - off) * ROWH}px)`;
      }, ease.softInOut);
      s.current.off = off;
      s.current.hits = new Set(s.current.hits).add(txid);
      setHits(s.current.hits);
      scan.current?.classList.remove("on");
    },
  }));

  return (
    <div className="vf-board" aria-label="The public board">
      <p className="vf-board-k">
        <b lang="ja">公開台帳</b>
        The public board
        <span className="vf-board-src">{note}</span>
      </p>
      <div className="vf-board-win">
        <ol className="vf-board-rows" ref={list}>
          {rows.map((r) => (
            <li key={r.txid + r.at} className={hits.has(r.txid) ? "is-hit" : undefined}>
              <span>{r.height}</span>
              <span>{r.at}</span>
              <span className={`k-${r.kind}`}>{r.kind}</span>
              <span>{r.n}</span>
              {/* the transaction id cut (DS-MOB P3): the whole values are under the verdict's Technical proof */}
              <span>{r.txid.length > 20 ? `${r.txid.slice(0, 8)}…${r.txid.slice(-6)}` : r.txid}</span>
            </li>
          ))}
        </ol>
        <i className="vf-board-scan" ref={scan} aria-hidden="true" />
      </div>
    </div>
  );
}
