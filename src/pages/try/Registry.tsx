// The board as the registry book 登記簿 behind B's window (MASTER.md §8, reference PIN-05): one
// row per real entry of the testnet board, printed in the board's blue ink on ruled pages, five
// rows a page, two pages a spread. B turns the leaves to the spread that holds an invoice's
// fingerprint (280ms a leaf, snapSettle, at most five) and underlines the row in seal ink.
import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { flushSync } from "react-dom";
import { dur, ease, run, still } from "./anim";

export interface Entry {
  txid: string;
  height: number;
  tx_index: number;
  n: string;
  kind: string;
  mine: boolean;
}

const PER_PAGE = 5;
const short = (x: string) => `${x.slice(0, 14)}…${x.slice(-8)}`;

/** The registry rows of a board snapshot (wasm `boardMemoDescribe` per entry); a settled entry
 *  carries its settled tag where a register entry carries N. */
export function entriesOf(boardJson: string, describe: (memo: string) => string, mine?: string): Entry[] {
  const list = JSON.parse(boardJson) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
  return list.flatMap((e) => {
    try {
      const d = JSON.parse(describe(e.memo)) as { kind: string; nullifier?: string; settled_tag?: string };
      return [{ txid: e.txid, height: e.height, tx_index: e.tx_index, n: d.nullifier ?? d.settled_tag ?? "", kind: d.kind, mine: e.txid === mine }];
    } catch {
      return [];
    }
  });
}

export interface RegistryApi {
  set(entries: Entry[], note: string): void;
  /** Turns to the spread holding `txid` and marks its row; resolves with the row element. */
  find(txid: string): Promise<HTMLElement | null>;
  /** Marks `txid`'s row (shown when its spread is open). */
  mark(txid: string): void;
  clear(): void;
}

/** What a page shows: page p of the book, the blank "next entry" page, or nothing. */
type Face = number | "blank" | "none";
type Leaf = { forward: boolean; front: Face; back: Face };

export function Registry({ api, className }: { api: Ref<RegistryApi>; className?: string }): ReactNode {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [note, setNote] = useState("Reading the board…");
  const [left, setLeft] = useState<Face>("none");
  const [right, setRight] = useState<Face>("none");
  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const [hits, setHits] = useState<Set<string>>(new Set());
  const el = useRef<HTMLElement>(null);
  const leafEl = useRef<HTMLDivElement>(null);
  const state = useRef({ entries: [] as Entry[], spread: 0 });

  const pagesOf = (list: Entry[]) => Math.max(1, Math.ceil(list.length / PER_PAGE));
  const rightOf = (s: number, list: Entry[]): Face => (s * 2 + 1 < pagesOf(list) ? s * 2 + 1 : "blank");
  const show = (s: number) => {
    state.current.spread = s;
    setLeft(s * 2);
    setRight(rightOf(s, state.current.entries));
  };

  /** One leaf turning over the spine, front = the right page, back = the next left page. */
  const turn = async (to: number) => {
    const { spread, entries: list } = state.current;
    const forward = to > spread;
    flushSync(() => {
      setLeaf({ forward, front: forward ? rightOf(spread, list) : spread * 2, back: forward ? to * 2 : to * 2 + 1 });
      if (forward) setRight(to * 2 + 1 < pagesOf(list) ? to * 2 + 1 : "none");
      else setLeft(to * 2);
    });
    await run(leafEl.current!, { rotateY: forward ? [0, -180] : [0, 180], duration: 280 }, ease.snapSettle);
    flushSync(() => {
      setLeaf(null);
      show(to);
    });
  };

  useImperativeHandle(api, () => ({
    set(list, line) {
      state.current.entries = list;
      flushSync(() => {
        setEntries(list);
        setNote(line);
        show(0);
      });
    },
    async find(txid) {
      const { entries: list } = state.current;
      const i = list.findIndex((e) => e.txid === txid);
      if (i < 0) return null;
      const target = Math.floor(i / PER_PAGE / 2);
      let flips = 0;
      while (state.current.spread !== target && flips < 5) {
        await turn(state.current.spread + Math.sign(target - state.current.spread));
        flips++;
      }
      if (state.current.spread !== target) flushSync(() => show(target));
      flushSync(() => setHits((h) => new Set(h).add(txid)));
      const row = el.current!.querySelector<HTMLElement>(`.rg-page:not(.rg-face) li[data-txid="${txid}"]`);
      if (row && !still()) await run(row, { x: [0, 3, 0], duration: dur.seal }, ease.snapSettle);
      return row;
    },
    mark(txid) {
      flushSync(() => setHits((h) => new Set(h).add(txid)));
    },
    clear() {
      flushSync(() => {
        setHits(new Set());
        if (state.current.spread !== 0 && state.current.entries.length) show(0);
      });
    },
  }));

  const pages = pagesOf(entries);
  const body = (p: Face): ReactNode => {
    if (p === "none") return null;
    if (p === "blank") return <p className="rg-blank">The next entry is written here.</p>;
    const rows = entries.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
    return (
      <>
        <header>
          <span lang="ja">{p % 2 === 0 ? "登記簿" : "Zcash testnet"}</span>
          <small>{`page ${p + 1} of ${pages}`}</small>
        </header>
        <ol className="rg-rows" start={p * PER_PAGE + 1}>
          {rows.map((e) => (
            <li key={e.txid} className={[e.mine ? "is-a" : "", hits.has(e.txid) ? "is-hit" : ""].filter(Boolean).join(" ") || undefined} data-txid={e.txid}>
              <span className="rg-h">{String(e.height)}</span>
              <code title={e.n}>{short(e.n)}</code>
              <span className="rg-k">{e.mine ? "financier A" : e.kind === "RegisterWithHistory" ? "with history" : e.kind.toLowerCase()}</span>
            </li>
          ))}
        </ol>
      </>
    );
  };

  return (
    <section className={className ? `rg ${className}` : "rg"} aria-label="The registry book: the public board" ref={el}>
      <div className="rg-book">
        <div className="rg-page is-left">{body(left)}</div>
        <span className="rg-spine" aria-hidden="true" />
        <div className="rg-page is-right">{body(right)}</div>
        {leaf ? (
          <div className={`rg-leaf ${leaf.forward ? "is-fwd" : "is-back"}`} aria-hidden="true" ref={leafEl}>
            <div className="rg-page rg-face">{body(leaf.front)}</div>
            <div className="rg-page rg-face is-back">{body(leaf.back)}</div>
          </div>
        ) : null}
      </div>
      <p className="rg-note">{note}</p>
    </section>
  );
}
