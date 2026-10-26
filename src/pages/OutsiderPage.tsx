// "What outsiders see" (HNK-11.T2, HNK-28.T5): what the public board shows to anyone holding its
// viewing key. React since HNK-31.T6; the sheet and the board since HNK-34.T3.
//
// The page lays the real kit invoice (TES-INV-0003, decoded by jitsuin-wasm) on the desk as the
// parties hold it, with its register stub, next to the live public board drawn as a strip of its
// real entries (each memo decoded by wasm `boardMemoDescribe`). Switching to "anyone with the
// board key" sweeps a numbered Cetacean bar over everything that stays with the parties; the
// numbers are the lines of the 見えない legend, and N, the only thing about this invoice that
// reaches the board, travels to its two entries there.
import { NextRoom } from "../app/NextRoom";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Page } from "../app/AppShell";
import { Button, useOut } from "../app/ui";
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { daysToDate, json, wasm, zatToZec } from "../lib/core";
import { KIT } from "../lib/kit";
import { NET } from "../lib/network";
import { reducedMotion } from "../landing/motion";
import "./outsider.css";

// What anyone holding the board's public viewing key learns (HNK-28.T5, BL-D28-07; threat model
// rows "viewing key holder" and TM #13 – #14). The key is published (D-11), so "outsider" means
// everyone: the board shows codes and hashes, never a party, an amount or a document. `key` ties a
// fact to its marks on the board (visible) or to its numbered bars on the sheet (hidden).
type Status = "Visible" | "Hidden" | "Hidden by default";
interface Fact {
  what: string;
  status: Status;
  why: string;
  key: string;
}
const TABLE: Fact[] = [
  { key: "1", what: "Who the supplier, buyer and financier are", status: "Hidden", why: "Shielded payments; per-invoice keys; each financier behind a commitment whose salt is new for every invoice" },
  { key: "2", what: "Invoice amount, dates, terms", status: "Hidden", why: "Only inside the signed invoice the parties hold" },
  { key: "3", what: "Which invoice an entry is about", status: "Hidden", why: "N is a hash of the whole invoice, including a per-invoice key; it cannot be guessed" },
  { key: "reg", what: "That an invoice was registered, and when", status: "Visible", why: "A register entry appears on the board in a block" },
  { key: "4", what: "Discount class and tenor class of each registration", status: "Hidden by default", why: "Entries carry 0/0 unless the supplier opts in to the public index (D-42). An opted-in entry's codes can be read by anyone holding the invoice; the index shows a class only from 5 invoices" },
  { key: "hist", what: "Whether the buyer brought a payment history", status: "Visible", why: "The entry kind: plain register, or register with a history tag" },
  { key: "set", what: "That an invoice was settled, on time or late", status: "Visible", why: "A settled entry appears, with its on-time flag and two signatures" },
  { key: "5", what: "Which registration a settlement closes", status: "Hidden", why: "The settled tag is a hash of N. Whoever holds N (the financiers who saw the invoice, a fund member, a lender shown the buyer's history) can link the two; timing and tenor class can hint" },
  { key: "twice", what: "That one N appears twice", status: "Visible", why: "Without the invoice nobody can tell a double financing from griefing" },
  { key: "6", what: "A buyer's invoices belong together", status: "Hidden", why: "Each invoice uses its own buyer key. A lender the buyer showed its history to can find the buyer's next invoice on the board" },
  { key: "7", what: "Advance and repayment amounts", status: "Hidden", why: "Shielded; visible only to the parties and to whoever holds their viewing key" },
];
const SHOWN = TABLE.filter((f) => f.status === "Visible");
const HIDDEN = TABLE.filter((f) => f.status !== "Visible");

// The advance of the demo kit on a block explorer (testnet).
const ADVANCE = { txid: "7b5687991a8df84cdb334d910f5d08850b98d5d02c7df09cd1bff4f2c167dbd9", amount: "0.00015 TAZ", fee: "0.0001 TAZ (ZIP-317)", pool: "Ironwood" };

type View = "parties" | "outsider";

// ---------- the board, decoded ----------

interface Entry {
  height: number;
  txid: string;
  memo: string;
  kind: "r" | "h" | "s";
  /** N of a register entry, the settled tag of a settlement. */
  tag: string;
  commitment: string;
  onTime: boolean;
  discount: number;
  tenor: number;
}

/** Every board entry whose memo jitsuin-wasm can read, in block order. */
function decodeBoard(b: BoardData): Entry[] {
  const raw = json<Array<{ txid: string; height: number; tx_index?: number; output_index?: number; memo: string }>>(b.json);
  const out: Array<Entry & { at: number }> = [];
  for (const r of raw) {
    try {
      const d = json<Record<string, unknown>>(wasm.boardMemoDescribe(r.memo));
      const settled = d.kind === "Settled";
      const tag = String((settled ? d.settled_tag : d.nullifier) ?? "");
      if (!tag) continue;
      out.push({
        at: (r.tx_index ?? 0) * 1000 + (r.output_index ?? 0),
        height: r.height,
        txid: r.txid,
        memo: r.memo,
        kind: settled ? "s" : d.history_tag ? "h" : "r",
        tag,
        commitment: String(d.financier_commitment ?? ""),
        onTime: d.on_time === true,
        discount: Number(d.discount_bucket ?? 0),
        tenor: Number(d.tenor_bucket ?? 0),
      });
    } catch {
      /* not a board memo: an outsider sees nothing in it either */
    }
  }
  return out.sort((a, b) => a.height - b.height || a.at - b.at);
}

/** "1-2%" → "1–2%", "<= 30 days" → "≤ 30 days": the CLI's class labels, typeset. */
const typeset = (s: string) => s.replace(/<=\s?/, "≤ ").replace(/>=\s?/, "≥ ").replace(/(\d)-(\d)/g, "$1–$2");

const short = (h: string, a = 10, b = 6) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);

// ---------- redaction bars ----------

const Focus = createContext<{ focus: string | null; setFocus: (k: string | null) => void }>({ focus: null, setFocus: () => undefined });

/** A value the parties hold; under a numbered Cetacean bar for anyone else. `k`: legend lines. */
function Rd({ k, em, def, children }: { k: string; em?: string; def?: boolean; children: ReactNode }): ReactNode {
  const { focus, setFocus } = useContext(Focus);
  const ks = k.split(" ");
  return (
    <span className={`os-rd${def ? " is-default" : ""}${focus && ks.includes(focus) ? " is-on" : ""}`} data-k={k} onPointerEnter={() => setFocus(ks[0])} onPointerLeave={() => setFocus(null)}>
      {children}
      <span className="os-bar" aria-hidden="true">
        {ks.map((x) => (
          <i key={x}>{x}</i>
        ))}
        {em ? <em>{em}</em> : null}
      </span>
    </span>
  );
}

// ---------- the board strip ----------

interface Layout {
  w: number;
  h: number;
  base: number;
  step: number;
  x: number[];
  gap: { x: number; blocks: number } | null;
}

const STRIP_H = 104;
const QUIET = 2000; // blocks: a stretch this long without entries is drawn short, and labelled

function layoutStrip(entries: Entry[], w: number): Layout {
  const h = STRIP_H;
  const base = Math.round(h * 0.56);
  const GAP = 2.2;
  const extra: number[] = [];
  let shift = 0;
  let big: { i: number; blocks: number } | null = null;
  entries.forEach((e, i) => {
    const d = i ? e.height - entries[i - 1].height : 0;
    if (d >= QUIET) {
      shift += GAP;
      if (!big || d > big.blocks) big = { i, blocks: d };
    }
    extra.push(shift);
  });
  const slots = entries.length + shift;
  const pad = 6;
  const step = slots > 1 ? (w - pad * 2) / (slots - 1) : 0;
  const x = entries.map((_, i) => pad + (i + extra[i]) * step);
  const g = big as { i: number; blocks: number } | null;
  return { w, h, base, step, x, gap: g ? { x: (x[g.i - 1] + x[g.i]) / 2, blocks: g.blocks - 1 } : null };
}

// ---------- the page ----------

export function OutsiderPage(): ReactNode {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [view, setViewState] = useState<View>("parties");
  const [focus, setFocus] = useState<string | null>(null);
  const [pinned, setPinned] = useState("2");
  const [stamped, setStamped] = useState<Set<string>>(() => new Set());
  const [drawn, setDrawn] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [board, setBoard] = useState<{ b: BoardData; entries: Entry[] } | null>(null);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [read, setRead] = useState<{ i: number } | { why: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const [landed, setLanded] = useState(false);
  const memo = useRef<HTMLTextAreaElement>(null);
  const tape = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const nCode = useRef<HTMLElement>(null);
  const timers = useRef<number[]>([]);
  const ghosts = useRef<HTMLElement[]>([]);
  const out = useOut();

  // The kit invoice, as the parties hold it: every value decoded from its canonical bytes.
  const inv = useMemo(() => {
    const d = json<{ invoice_id: string; supplier_pk: string; buyer_pk: string; amount_zat: number; issue_date: number; due_date: number; terms_hash: string; nullifier: string }>(wasm.invoiceDecode(KIT.invoice));
    return { ...d, short: d.invoice_id.replace(/-\d+$/, "") };
  }, []);
  const classes = useMemo(() => json<{ classes: { discount_bps: Array<{ label: string }>; tenor_days: Array<{ label: string }> } }>(wasm.rateIndex("[]", 5)).classes, []);

  // ---- the live board (or the last kept, or the bundled copy) ----
  useEffect(() => {
    let live = true;
    loadBoard((u, i) => fetch(u, i))
      .then((b) => live && setBoard({ b, entries: decodeBoard(b) }))
      .catch((e: unknown) => live && setBoardErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const entries = board?.entries ?? [];
  const oursIdx = useMemo(() => {
    const byTx = entries.findIndex((e) => e.txid === KIT.financierA.txid);
    return byTx >= 0 ? byTx : entries.findIndex((e) => e.kind !== "s" && e.tag === inv.nullifier);
  }, [entries, inv.nullifier]);
  const ourEntries = entries.filter((e) => e.kind !== "s" && e.tag === inv.nullifier);
  const dup = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) if (e.kind !== "s") c[e.tag] = (c[e.tag] ?? 0) + 1;
    return c;
  }, [entries]);
  const facts = useMemo(() => {
    const reg = entries.filter((e) => e.kind !== "s").length;
    const hist = entries.filter((e) => e.kind === "h").length;
    const set = entries.filter((e) => e.kind === "s");
    const late = set.filter((e) => !e.onTime).length;
    const repeated = Object.values(dup).filter((n) => n > 1).length;
    const oursRepeats = (dup[inv.nullifier] ?? 0) > 1;
    // [the number, the words after it]
    return {
      reg: [String(reg), ` register ${reg === 1 ? "entry" : "entries"}`],
      hist: [String(hist), " with a history tag"],
      set: [String(set.length), ` settled${set.length ? (late ? `, ${late} late` : ", all on time") : " yet"}`],
      twice: [String(repeated), ` repeat${repeated === 1 ? "" : "s"}${oursRepeats ? ", this invoice's among them" : ""}`],
    } as Record<string, [string, string]>;
  }, [entries, dup, inv.nullifier]);
  const lay = useMemo(() => (w > 0 && entries.length ? layoutStrip(entries, w) : null), [entries, w]);
  const layRef = useRef<Layout | null>(null);
  layRef.current = lay;

  // the strip follows its width
  useEffect(() => {
    const el = tape.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);

  // ---- bars: how many each legend line has, and labels that do not fit their bar are dropped ----
  const fitLabels = useCallback(() => {
    root?.querySelectorAll<HTMLElement>(".os-rd").forEach((rd) => {
      const em = rd.querySelector<HTMLElement>(".os-bar em");
      if (!em) return;
      em.hidden = false;
      const bar = rd.querySelector<HTMLElement>(".os-bar")!;
      const need = [...bar.children].reduce((s, c) => s + (c.tagName === "EM" ? c.scrollWidth : (c as HTMLElement).offsetWidth) + 6, 12);
      em.hidden = rd.offsetWidth + 10 < need;
    });
  }, [root]);
  useEffect(() => {
    if (!root) return;
    const c: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>(".os-rd").forEach((rd) => rd.dataset.k!.split(" ").forEach((k) => (c[k] = (c[k] ?? 0) + 1)));
    setCounts(c);
    fitLabels();
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(fitLabels, 120);
    };
    addEventListener("resize", onResize);
    void document.fonts?.ready.then(fitLabels);
    return () => {
      removeEventListener("resize", onResize);
      clearTimeout(t);
    };
    // the stub grows a line per registration of this invoice once the board is in
  }, [root, fitLabels, ourEntries.length]);

  // ---- N travels from the sheet to the board: the only thing about this invoice that reaches it ----
  const travel = useCallback(() => {
    const l = layRef.current;
    const s = svg.current;
    const from = nCode.current?.getBoundingClientRect();
    const targets = l ? entries.map((e, i) => (e.kind !== "s" && e.tag === inv.nullifier ? i : -1)).filter((i) => i >= 0) : [];
    if (!l || !s || !from || !targets.length) {
      setDrawn(true);
      return;
    }
    const box = s.getBoundingClientRect();
    const sx = box.width / l.w;
    targets.forEach((i, j) => {
      const g = document.createElement("span");
      g.className = "os-ghost";
      g.setAttribute("aria-hidden", "true");
      g.textContent = inv.nullifier.slice(0, 12);
      document.body.append(g);
      ghosts.current.push(g);
      const tx = box.left + l.x[i] * sx;
      const ty = box.top + l.base - 24;
      const a = g.animate(
        [
          { transform: `translate(${from.left}px, ${from.top}px) scale(1)`, opacity: 0 },
          { transform: `translate(${from.left}px, ${from.top - 6}px) scale(1)`, opacity: 1, offset: 0.12 },
          { transform: `translate(${tx - 30}px, ${ty - 10}px) scale(.55)`, opacity: 1, offset: 0.88 },
          { transform: `translate(${tx - 30}px, ${ty}px) scale(.4)`, opacity: 0 },
        ],
        { duration: 1100, delay: j * 200, easing: "cubic-bezier(.34,.07,.66,.93)", fill: "both" },
      );
      a.onfinish = () => {
        g.remove();
        s.querySelector(`.os-mk[data-i="${i}"]`)?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 400, easing: "cubic-bezier(.22,.78,.51,.94)" });
        if (j === targets.length - 1) setDrawn(true);
      };
    });
  }, [entries, inv.nullifier]);

  // ---- the view switch: the parties' copy ⇄ anyone with the board key ----
  const setView = useCallback(
    (v: View, animate = true) => {
      if (!root) return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const anim = animate && !reducedMotion();
      // sweep order: by legend line, uneven stagger inside a line (100, 67, 67 ms), lines 240 ms apart
      const bars = [...root.querySelectorAll<HTMLElement>(".os-rd")].sort((a, b) => Number(a.dataset.k!.split(" ")[0]) - Number(b.dataset.k!.split(" ")[0]));
      let t = 0;
      let last: string | null = null;
      let inLine = 0;
      const at: Array<[string[], number]> = [];
      for (const rd of bars) {
        const ks = rd.dataset.k!.split(" ");
        if (ks[0] !== last) {
          if (last !== null) t += 240;
          inLine = 0;
          last = ks[0];
        } else t += inLine === 1 ? 100 : 67;
        inLine++;
        rd.querySelector<HTMLElement>(".os-bar")?.style.setProperty("--d", v === "outsider" && anim ? `${t}ms` : "0ms");
        at.push([ks, t]);
      }
      setStamped(new Set());
      if (v === "outsider") {
        for (const f of HIDDEN) {
          const first = at.filter(([ks]) => ks.includes(f.key)).map(([, x]) => x);
          const when = first.length ? Math.min(...first) + 260 : 0;
          const stamp = () => setStamped((s) => new Set(s).add(f.key));
          if (anim) timers.current.push(window.setTimeout(stamp, when));
          else stamp();
        }
        if (anim) {
          setDrawn(false);
          timers.current.push(window.setTimeout(travel, t + 520));
        } else setDrawn(true);
      } else setDrawn(true);
      setViewState(v);
      setRead(null);
    },
    [root, travel],
  );

  // ---- start: the parties' copy lands, then the board key reads it (once the board is in) ----
  const started = useRef(false);
  const mountedAt = useRef(0);
  useEffect(() => {
    if (!root) return;
    mountedAt.current = performance.now();
    if (!reducedMotion()) setLanded(true);
  }, [root]);
  useEffect(() => {
    if (!root || started.current || (!board && !boardErr)) return;
    started.current = true;
    if (reducedMotion()) {
      setView("outsider", false);
      return;
    }
    const wait = Math.max(0, 900 - (performance.now() - mountedAt.current));
    timers.current.push(window.setTimeout(() => setView("outsider"), wait));
  }, [root, board, boardErr, setView]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      ghosts.current.forEach((g) => g.remove());
    },
    [],
  );

  const legendActive = focus ?? pinned;
  const onSeg = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const v = view === "outsider" ? "parties" : "outsider";
    setView(v);
    (e.currentTarget.querySelector(`[data-view="${v}"]`) as HTMLElement | null)?.focus();
  };

  // ---- the readout under the strip ----
  const readout = (): ReactNode => {
    if (read && "why" in read) return read.why;
    const i = read ? read.i : oursIdx;
    const e = entries[i];
    if (!e) return board ? "No entry of this invoice on this board." : boardErr ? `The board could not be read: ${boardErr}` : "Reading the board…";
    const kind = e.kind === "s" ? `settled, ${e.onTime ? "on time" : "late"}, two signatures` : e.kind === "h" ? "register with a history tag" : "register";
    const what = e.kind === "s" ? ` · settled tag ${e.tag.slice(0, 12)}…` : ` · N ${e.tag.slice(0, 12)}… · commitment ${e.commitment.slice(0, 12)}…`;
    let note: string | null = null;
    if (e.kind !== "s" && e.tag === inv.nullifier) {
      const n = ourEntries.length;
      const nth = ourEntries.indexOf(e);
      note =
        view === "outsider"
          ? n === 2
            ? "this N appears twice"
            : n > 2
              ? `this N appears ${n} times`
              : "this N, once"
          : nth === 0
            ? "this invoice, registered for financier A"
            : nth === 1
              ? "this invoice again, for a second financier"
              : "this invoice again";
    }
    return (
      <>
        <b>{`block ${e.height}`}</b>
        {` · ${kind}${what} · tx ${e.txid.slice(0, 16)}…`}
        {note ? <em>{`  ${note}`}</em> : null}
      </>
    );
  };

  const oursFirst = ourEntries[0];
  const head = board ? boardLine(board.b) : null;
  const tip = board ? String(board.b.tip) : "";

  return (
    <Page wide>
      <Focus.Provider value={{ focus, setFocus }}>
        <div className="os" data-view={view} data-focus={view === "outsider" && focus ? focus : undefined} ref={setRoot}>
          {/* ============ the sheet, as the parties hold it and as anyone else reads it ============ */}
          <section className="os-sec" aria-labelledby="os-t">
            <div className="os-cap">
              <p className="os-eyebrow">
                <span className="os-stamp" lang="ja" aria-hidden="true">
                  外
                </span>
                Outside the registry
              </p>
              <h1 id="os-t">What outsiders see</h1>
              <p className="os-lede">The registry board is public so anyone can audit it: its viewing key is published. This is everything anyone can learn from it.</p>
              <div className="os-seg" role="radiogroup" aria-label="Read the invoice as" onKeyDown={onSeg}>
                <button type="button" role="radio" aria-checked={view === "parties"} tabIndex={view === "parties" ? 0 : -1} data-view="parties" onClick={() => setView("parties")}>
                  <span lang="ja">当</span>The parties' copy
                </button>
                <button type="button" role="radio" aria-checked={view === "outsider"} tabIndex={view === "outsider" ? 0 : -1} data-view="outsider" onClick={() => setView("outsider")}>
                  <span lang="ja">外</span>Anyone with the board key
                </button>
              </div>
              <dl className="os-counts">
                <div className="is-shown">
                  <dt>things anyone with the board key reads</dt>
                  <dd>
                    {SHOWN.length} <b lang="ja">見える</b>
                  </dd>
                </div>
                <div className="is-hidden">
                  <dt>things that stay with the parties</dt>
                  <dd>
                    {HIDDEN.length} <b lang="ja">見えない</b>
                  </dd>
                </div>
              </dl>
              <p className="os-hint">{`Invoice ${inv.short} is a real ${NET.noun} invoice of the demo kit. Every bar on it is labelled with what it hides; point at a line of the legend to find its bars, or at a mark on the board to read its entry.`}</p>
            </div>

            <div className="os-vis">
              {/* ---- the public board: the one dark object ---- */}
              <section className="os-board" aria-labelledby="os-bd">
                <p className="os-bd-head">
                  <b id="os-bd" lang="ja">
                    公開台帳
                  </b>
                  <span>
                    {"The public board · viewing key published · "}
                    {board ? (
                      <>
                        <code>{entries.length}</code>
                        {" entries · "}
                        {head!.split(tip).map((part, i, all) => (
                          <span key={i}>
                            {part}
                            {i < all.length - 1 ? <code>{tip}</code> : null}
                          </span>
                        ))}
                      </>
                    ) : boardErr ? (
                      `the board could not be read: ${boardErr}`
                    ) : (
                      "reading the board…"
                    )}
                  </span>
                </p>
                <div className="os-tape" ref={tape} data-hl={hl ?? undefined}>
                  <svg ref={svg} className={drawn ? "is-drawn" : undefined} viewBox={`0 0 ${Math.max(1, w)} ${STRIP_H}`} preserveAspectRatio="none" role="img" aria-label={`The ${entries.length} board entries in block order: register entries above the line, settlements below; arcs join entries that carry the same N.`}>
                    {lay ? (
                      <>
                        <line className="os-bd-base" x1={0} x2={lay.w} y1={lay.base} y2={lay.base} />
                        <g>
                          {(() => {
                            const seen: Record<string, number> = {};
                            const arcs: ReactNode[] = [];
                            entries.forEach((e, i) => {
                              if (e.kind === "s") return;
                              const p = seen[e.tag];
                              if (p !== undefined) {
                                const a = lay.x[p];
                                const b = lay.x[i];
                                const top = lay.base - 30 - Math.min(30, (b - a) * 0.45);
                                arcs.push(<path key={i} className={`os-arc${e.tag === inv.nullifier ? " is-ours" : ""}`} pathLength={1} d={`M${a} ${lay.base - 28}C${a} ${top} ${b} ${top} ${b} ${lay.base - 28}`} />);
                              }
                              seen[e.tag] = i;
                            });
                            return arcs;
                          })()}
                        </g>
                        {entries.map((e, i) => {
                          const x = lay.x[i];
                          const ours = e.kind !== "s" && e.tag === inv.nullifier;
                          const label = `block ${e.height}, ${e.kind === "s" ? "settlement" : e.kind === "h" ? "register with a history tag" : "register"}`;
                          return (
                            <g
                              key={i}
                              className={`os-mk k-${e.kind}${ours ? " is-ours" : ""}${e.kind !== "s" && dup[e.tag] > 1 ? " is-dup" : ""}${hover === i ? " is-hover" : ""}`}
                              tabIndex={0}
                              data-i={i}
                              aria-label={label}
                              onPointerEnter={() => {
                                setHover(i);
                                setRead({ i });
                              }}
                              onPointerLeave={() => {
                                setHover(null);
                                setRead(null);
                              }}
                              onFocus={() => setRead({ i })}
                              onBlur={() => setRead(null)}
                            >
                              {e.kind === "s" ? (
                                <>
                                  <line className="os-mk-set" x1={x} x2={x} y1={lay.base + 2} y2={lay.base + 16} />
                                  <circle className="os-mk-setdot" cx={x} cy={lay.base + 21} r={4.5} />
                                </>
                              ) : (
                                <>
                                  <line className="os-mk-reg" x1={x} x2={x} y1={lay.base - 2} y2={lay.base - (e.kind === "h" ? 18 : 24)} />
                                  {e.kind === "h" ? <circle className="os-mk-hist" cx={x} cy={lay.base - 23} r={3.5} /> : null}
                                </>
                              )}
                              <rect className="os-mk-hit" x={x - Math.max(6, lay.step / 2)} y={0} width={Math.max(12, lay.step)} height={lay.h} />
                            </g>
                          );
                        })}
                        <text className="os-bd-axis" x={lay.x[0]} y={lay.h - 4}>
                          {entries[0].height}
                        </text>
                        {lay.gap ? (
                          <text className="os-bd-axis is-gap" x={lay.gap.x} y={lay.h - 4} textAnchor="middle">
                            {lay.w > 500 ? `⋯ ${lay.gap.blocks.toLocaleString("en")} quiet blocks ⋯` : "⋯"}
                          </text>
                        ) : null}
                        {entries.length > 1 ? (
                          <text className="os-bd-axis" x={lay.x[entries.length - 1]} y={lay.h - 4} textAnchor="end">
                            {lay.w > 500 && board ? `${entries[entries.length - 1].height} · tip ${board.b.tip}` : entries[entries.length - 1].height}
                          </text>
                        ) : null}
                      </>
                    ) : null}
                  </svg>
                  <p className="os-bd-read" aria-live="polite">
                    {readout()}
                  </p>
                </div>
                <section className="os-seen" aria-labelledby="os-lg-seen">
                  <p className="os-seen-k" id="os-lg-seen">
                    <b lang="ja">見える</b>Anyone with the board key reads
                  </p>
                  <ol>
                    {SHOWN.map((f) => {
                      const on = () => {
                        setHl(f.key);
                        setRead({ why: f.why });
                      };
                      const off = () => {
                        setHl(null);
                        setRead(null);
                      };
                      return (
                        <li key={f.key} tabIndex={0} onPointerEnter={on} onPointerLeave={off} onFocus={on} onBlur={off}>
                          <SeenIcon k={f.key} />
                          <div>
                            <strong>{f.what}</strong>
                            {board ? (
                              <small>
                                <code>{facts[f.key][0]}</code>
                                {facts[f.key][1]}
                              </small>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </section>

              <div className="os-desk">
                <div className={`os-paper${landed ? " is-in" : ""}`}>
                  <article className="os-sk" aria-label={`Invoice ${inv.short} (請求書)`}>
                    <header className="os-sk-head">
                      <h2 className="os-sk-title">
                        <span lang="ja">請 求 書</span>
                        <small>Invoice · the parties' copy</small>
                      </h2>
                      <dl className="os-sk-meta">
                        <div>
                          <dt>No.</dt>
                          <dd>
                            <Rd k="3">
                              <code>{inv.invoice_id}</code>
                            </Rd>
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <span lang="ja">発行日</span> Issued
                          </dt>
                          <dd>
                            <Rd k="2">{daysToDate(inv.issue_date)}</Rd>
                          </dd>
                        </div>
                      </dl>
                    </header>
                    <p className="os-sk-to">
                      <Rd k="1 6" em="who · belongs with">
                        <code title={inv.buyer_pk}>{short(inv.buyer_pk)}</code>
                      </Rd>
                      <span lang="ja">御中</span>
                      <small>to the buyer's invoice key</small>
                    </p>
                    <div className="os-sk-total">
                      <span className="os-sk-total-k">
                        <span lang="ja">ご請求金額</span>
                        <small>Amount due</small>
                      </span>
                      <Rd k="2" em="amount">
                        <span className="os-sk-total-v">
                          {zatToZec(inv.amount_zat)} <b>ZEC</b>
                        </span>
                      </Rd>
                    </div>
                    <table className="os-sk-table">
                      <tbody>
                        <tr>
                          <th scope="row">
                            <span lang="ja">支払期日</span>
                            <small>Due</small>
                          </th>
                          <td>
                            <Rd k="2">{daysToDate(inv.due_date)}</Rd>
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">
                            <span lang="ja">条件</span>
                            <small>Terms, SHA-256 of the PDF</small>
                          </th>
                          <td>
                            <Rd k="2" em="terms">
                              <code title={inv.terms_hash}>{short(inv.terms_hash, 12, 8)}</code>
                            </Rd>
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">
                            <span lang="ja">発行者</span>
                            <small>Issuer</small>
                          </th>
                          <td>
                            <Rd k="1" em="who the supplier is">
                              <span className="os-sk-issuer">{KIT.supplier}</span>
                              <code title={inv.supplier_pk}>{short(inv.supplier_pk)}</code>
                            </Rd>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <footer className="os-sk-foot">
                      <div className="os-sk-n">
                        <span className="os-sk-n-k">N</span>
                        <div>
                          <code ref={nCode}>{inv.nullifier}</code>
                          <small>
                            <span className="os-lit" lang="ja" aria-hidden="true">
                              見
                            </span>
                            On the board as it is. Nothing on the board ties it to this sheet.
                          </small>
                        </div>
                      </div>
                      <div className="os-sk-box">
                        <span lang="ja">受領印</span>
                        <Rd k="1">
                          <span className="os-sk-seal" lang="ja" role="img" aria-label="Buyer's seal">
                            買
                          </span>
                        </Rd>
                        <small>Buyer's seal</small>
                      </div>
                    </footer>
                  </article>
                  <aside className="os-stub" aria-label="Register stub: the parties' notes on this invoice">
                    <p className="os-stub-k">
                      <b lang="ja">登記控</b>
                      <small>Register stub, kept with the invoice</small>
                    </p>
                    <dl>
                      {(ourEntries.length ? ourEntries : [null]).map((e, j) => (
                        <div key={j} className="os-stub-row">
                          <dt lang="ja">
                            {j === 0 ? "登記" : "再登記"}
                            <small>{j === 0 ? "Registered" : "Again"}</small>
                          </dt>
                          <dd>
                            {e ? (
                              <>
                                <span className="os-lit-block">
                                  <span className="os-lit" lang="ja" aria-hidden="true">
                                    見
                                  </span>
                                  <code>{`block ${e.height}`}</code>
                                </span>
                                {" for "}
                                <Rd k="1" em="who">
                                  {j === 0 ? "financier A" : j === 1 ? "a second financier" : "another financier"}
                                </Rd>
                              </>
                            ) : (
                              <>
                                {board ? "not on this board" : "reading the board…"}
                                {" for "}
                                <Rd k="1" em="who">
                                  financier A
                                </Rd>
                              </>
                            )}
                          </dd>
                        </div>
                      ))}
                      <div className="os-stub-row">
                        <dt lang="ja">
                          区分<small>Classes</small>
                        </dt>
                        <dd>
                          <Rd k="4" em="hidden by default" def>
                            {oursFirst
                              ? oursFirst.discount && oursFirst.tenor
                                ? `${typeset(classes.discount_bps[oursFirst.discount - 1]?.label ?? "?")} discount · ${typeset(classes.tenor_days[oursFirst.tenor - 1]?.label ?? "?")}`
                                : "not disclosed (0/0)"
                              : "discount class · tenor class"}
                          </Rd>
                        </dd>
                      </div>
                      <div className="os-stub-row">
                        <dt lang="ja">
                          決済<small>Settlement</small>
                        </dt>
                        <dd>
                          <Rd k="5" em="which registration it closes">
                            its settled tag is a hash of this N
                          </Rd>
                        </dd>
                      </div>
                    </dl>
                  </aside>
                </div>

                <section className="os-legend" aria-labelledby="os-lg-hidden">
                  <p className="os-lg-k" id="os-lg-hidden">
                    <b lang="ja">見えない</b>Stays with the parties
                  </p>
                  <ol>
                    {HIDDEN.map((f) => {
                      const n = counts[f.key] ?? 0;
                      return (
                        <li
                          key={f.key}
                          tabIndex={0}
                          data-default={f.status === "Hidden by default" ? "" : undefined}
                          className={[stamped.has(f.key) ? "is-stamped" : "", legendActive === f.key ? "is-active" : ""].filter(Boolean).join(" ") || undefined}
                          onPointerEnter={() => setFocus(f.key)}
                          onPointerLeave={() => setFocus(null)}
                          onFocus={() => {
                            setPinned(f.key);
                            setFocus(f.key);
                          }}
                          onBlur={() => setFocus(null)}
                          onClick={() => {
                            setPinned(f.key);
                            setFocus(null);
                          }}
                        >
                          <span className="os-chip" aria-hidden="true">
                            {f.key}
                          </span>
                          <strong>
                            {f.what}
                            {f.status === "Hidden by default" ? <span className="os-tag">hidden by default</span> : null}
                          </strong>
                          <span className="os-ct">{`${n} bar${n === 1 ? "" : "s"}`}</span>
                          <p className="os-why">{`${f.why}.`}</p>
                          {f.key === "7" ? <span className="os-below">On the advance below.</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </div>
            </div>
          </section>

          {/* ============ the advance, on a block explorer ============ */}
          <section className="os-sec" aria-labelledby="os-t-explorer">
            <div className="os-cap">
              <h2 id="os-t-explorer">What a block explorer shows for an advance</h2>
              <p className="os-lede">
                {`${NET.short} advance `}
                <code>{`${ADVANCE.txid.slice(0, 16)}…`}</code>
                {` paid a supplier ${ADVANCE.amount} with a receipt, a seal and a receivable note in its memo.`}
              </p>
              <p className="os-hint">The slip is the supplier's wallet view. Switch to “Anyone with the board key” and it becomes exactly what an explorer shows.</p>
            </div>
            <div className="os-slipwrap">
              <article className="os-slip" aria-label="The advance transaction">
                <p className="os-slip-k">
                  <b lang="ja">入金票</b>
                  <small>Advance received · the supplier's wallet</small>
                </p>
                <dl>
                  <dt>Transaction</dt>
                  <dd>
                    <code>{ADVANCE.txid}</code>
                  </dd>
                  <dt>Transparent inputs / outputs</dt>
                  <dd>none / none</dd>
                  <dt>Shielded pool</dt>
                  <dd>{ADVANCE.pool}</dd>
                  <dt>Fee</dt>
                  <dd>{ADVANCE.fee}</dd>
                  <dt>Amount</dt>
                  <dd>
                    <Rd k="7" em="encrypted">
                      {ADVANCE.amount}
                    </Rd>
                  </dd>
                  <dt>Sender, recipient</dt>
                  <dd>
                    <Rd k="1" em="encrypted">
                      the financier, to the supplier's shielded address
                    </Rd>
                  </dd>
                  <dt>Memo (receipt, seal, note)</dt>
                  <dd>
                    <Rd k="1 3" em="encrypted">
                      a receipt, the buyer's seal, the receivable note
                    </Rd>
                  </dd>
                </dl>
              </article>
            </div>
          </section>

          {/* ============ read an entry yourself ============ */}
          <section className="os-sec" aria-labelledby="os-t-read">
            <div className="os-cap">
              <h2 id="os-t-read">Read a board entry as an outsider</h2>
              <p className="os-hint">You will see the entry's kind, N, the financier commitment, the two classes and any history tag, or a settlement's tag and on-time flag. No party, amount or document. Checking a signature needs the supplier's key, which is only inside the invoice.</p>
            </div>
            <div className="os-panel">
              <label className="os-field">
                <span>A board memo (base64url)</span>
                <textarea ref={memo} spellCheck="false" autoComplete="off" placeholder="Paste a memo read with the board's public viewing key" />
              </label>
              <div className="os-actions">
                <Button
                  onClick={() => {
                    try {
                      const d = json<Record<string, unknown>>(wasm.boardMemoDescribe(memo.current!.value.trim()));
                      out.show(
                        <dl className="os-desc">
                          {Object.entries(d).map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{String(v ?? "—")}</dd>
                            </div>
                          ))}
                        </dl>,
                      );
                    } catch (e) {
                      out.error(e);
                    }
                  }}
                >
                  Read entry
                </Button>
                {oursFirst ? (
                  <button
                    type="button"
                    className="os-inklink"
                    onClick={() => {
                      memo.current!.value = oursFirst.memo;
                      memo.current!.focus();
                    }}
                  >
                    {`Use this invoice's entry at block ${oursFirst.height}`}
                  </button>
                ) : null}
              </div>
              <div aria-live="polite">{out.el}</div>
            </div>
          </section>
        </div>
        <NextRoom from="outsider" />
      </Focus.Provider>
    </Page>
  );
}

/** The mark of a visible fact, as it is drawn on the strip. */
function SeenIcon({ k }: { k: string }): ReactNode {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className={`os-ic is-${k}`}>
      {k === "reg" ? <line x1="11" y1="18" x2="11" y2="5" /> : null}
      {k === "hist" ? (
        <>
          <line x1="11" y1="18" x2="11" y2="9" />
          <circle cx="11" cy="6" r="3.5" />
        </>
      ) : null}
      {k === "set" ? (
        <>
          <line x1="11" y1="3" x2="11" y2="12" />
          <circle cx="11" cy="16" r="4" className="is-fill" />
        </>
      ) : null}
      {k === "twice" ? <path d="M4 17C4 6 18 6 18 17" /> : null}
    </svg>
  );
}
