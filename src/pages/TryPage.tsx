// "Try to double-finance" (HNK-30.T3 – T4, M-02 sealed invoice kit, M-01 two exits, D-40): the
// judge plays the supplier of Case File #0417 and offers an invoice that financier A already
// registered on the testnet board to financier B, as it is or changed in any field. Every try
// ends at one of two exits: 偽 (the buyer's seal does not hold for the bytes) or 重 (the board
// already holds the invoice's fingerprint). Nothing to install, no wallet, nothing recorded: the
// checks run in this browser with the same code as the node and `jitsuin verify`, against the
// live board scanned by the financier node (or a bundled copy when the node does not answer).
//
// The case desk (HNK-34.T2, design-samples/internal/try.html): the caption column holds the case,
// the rules and the attempts; the desk holds the 請求書 on its case folder, the buyer's 買 seal
// that cracks the moment the bytes differ (the real signature check, every keystroke), financier
// B's hanko, and the public board standing as a Cetacean slab with the real board rows. A try:
// N resolves, B's ring reads the seal, a red thread runs from N to the board, the lookup scans
// the rows, the hanko comes down on the sheet with 偽 or 重, and a 重 on a double hangs Exhibit A
// off the slab on a red string. The stamped copy peels into the pile at the next edit.
import { NextRoom } from "../app/NextRoom";
import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Mounted, Page } from "../app/AppShell";
import { wordDelays } from "../landing/motion";
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { dateToDays, daysToDate, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { checkOffer, encodeEdited, KIT, type InvoiceFields } from "../lib/kit";
import { dur, ease, rectIn, run, still, tween, wait } from "./try/anim";
import { Bars, Exhibit } from "./try/Exhibit";
import { Lens } from "./try/Lens";
import { Notice } from "./try/Notice";
import { Phone } from "./try/Phone";
import { entriesOf, type Entry } from "./try/Registry";
import { Seikyusho, type SheetFields } from "./try/Seikyusho";
// try.css loads with the app shell (src/app/app-styles.ts)

const short = (x: string, a = 8, b = 8) => `${x.slice(0, a)}…${x.slice(-b)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const LABEL: Record<string, string> = { invoice_id: "number", amount_zat: "amount", issue_date: "issue date", due_date: "due date", terms_hash: "terms" };
const MARK_SUB: Record<string, string> = { 偽: "seal does not hold", 重: "already pledged" };
const TITLE = ["Try", "to", "double‑finance"];

interface Decoded extends InvoiceFields {
  nullifier: string;
}

let boardCache: Promise<BoardData> | null = null;
function board(): Promise<BoardData> {
  boardCache ??= loadBoard((u, i) => fetch(u, i)).catch((e) => {
    boardCache = null;
    throw e;
  });
  return boardCache;
}

/** The buyer's seal on these exact bytes: the bundle builds only when the signature verifies. */
function sealHolds(invoice: string): boolean {
  try {
    wasm.bundleBuild(JSON.stringify({ invoice, buyer_signature: KIT.buyerSignature }));
    return true;
  } catch {
    return false;
  }
}

type Live = { n: string | null; changed: string[]; sealed: boolean };
type Tag = { n: string; first: number; second: number };
type XY = { x: number; y: number };

export function TryPage({ autoplay = false }: { autoplay?: boolean }): ReactNode {
  const orig = useRef(json<Decoded>(wasm.invoiceDecode(KIT.invoice))).current;
  const at = KIT.financierA;

  const fields: SheetFields = { id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) };
  const [live, setLive] = useState<Live>(() => ({ n: orig.nullifier, changed: [], sealed: sealHolds(KIT.invoice) }));
  const [said, setSaid] = useState({ glyph: "証", text: `Financier A registered this invoice at block ${at.height} before paying. Show me what you have.` });
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState({ forged: 0, pledged: 0 });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lookup, setLookup] = useState("waiting for an offer");
  const [boardNote, setBoardNote] = useState("Reading the board…");
  const [idle, setIdle] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [mark, setMark] = useState<string | null>(null);
  const [pile, setPile] = useState<string[]>([]);
  const [tag, setTag] = useState<Tag | null>(null);

  const busyNow = useRef(false);
  const markNow = useRef<string | null>(null);
  const tries = useRef(0);

  const desk = useRef<HTMLElement>(null);
  const skWrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const nCode = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const crack = useRef<SVGPathElement>(null);
  const art = useRef<SVGGElement>(null);
  const spot = useRef<HTMLSpanElement>(null);
  const markEl = useRef<HTMLSpanElement>(null);
  const pileEl = useRef<HTMLDivElement>(null);
  const hanko = useRef<HTMLSpanElement>(null);
  const offer = useRef<HTMLButtonElement>(null);
  const sayG = useRef<HTMLSpanElement>(null);
  const boardEl = useRef<HTMLElement>(null);
  const bdQ = useRef<HTMLElement>(null);
  const rowsEl = useRef<HTMLOListElement>(null);
  const scan = useRef<HTMLLIElement>(null);
  const tagEl = useRef<HTMLAnchorElement>(null);
  const thPath = useRef<SVGPathElement>(null);
  const pinA = useRef<SVGCircleElement>(null);
  const pinB = useRef<SVGCircleElement>(null);
  const bead = useRef<SVGGElement>(null);
  const countN = useRef<HTMLParagraphElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const exhibitEl = useRef<HTMLDivElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  const printOut = useRef<HTMLDivElement>(null);

  const speak = (glyph: string, text: string) => {
    flushSync(() => setSaid({ glyph, text }));
    if (sayG.current) void run(sayG.current, { scale: [1.3, 1], duration: dur.seal }, ease.snapSettle);
  };

  // ---------- the sheet: N and the buyer's seal follow every keystroke (jitsuin-wasm) ----------
  const value = (k: keyof SheetFields) => fields[k].current!.value;
  const edited = (): { invoice: string; changed: string[] } => {
    const f: InvoiceFields = {
      invoice_id: value("id").trim(),
      supplier_pk: orig.supplier_pk,
      buyer_pk: orig.buyer_pk,
      amount_zat: zecToZat(value("amount").trim()),
      issue_date: dateToDays(value("issued").trim()),
      due_date: dateToDays(value("due").trim()),
      terms_hash: value("terms").trim().toLowerCase(),
    };
    const changed = (["invoice_id", "amount_zat", "issue_date", "due_date", "terms_hash"] as const).filter((k) => f[k] !== orig[k]);
    return { invoice: changed.length ? encodeEdited(wasm, f) : KIT.invoice, changed };
  };
  const follow = () => {
    try {
      const r = edited();
      setLive({ n: json<Decoded>(wasm.invoiceDecode(r.invoice)).nullifier, changed: r.changed, sealed: sealHolds(r.invoice) });
    } catch {
      setLive({ n: null, changed: ["unreadable"], sealed: false });
    }
  };
  const onInput = () => {
    follow();
    if (markNow.current && !busyNow.current) void peel();
  };
  const putBack = () => {
    fields.id.current!.value = orig.invoice_id;
    fields.amount.current!.value = zatToZec(orig.amount_zat);
    fields.issued.current!.value = daysToDate(orig.issue_date);
    fields.due.current!.value = daysToDate(orig.due_date);
    fields.terms.current!.value = orig.terms_hash;
    onInput();
  };

  /** N's hex digits resolve left to right (MASTER §5: each digit cycles for 400ms, 20ms apart). */
  const resolveN = (n: string | null): Promise<void> => {
    const code = nCode.current;
    if (!n || !code || still()) return Promise.resolve();
    const parts = [...code.children] as HTMLElement[];
    if (parts.length !== 4) return Promise.resolve();
    const hex = "0123456789abcdef";
    const total = 15 * 20 + 400;
    const line = (s: string, e: number) => [...s].map((c, i) => (e >= i * 20 + 400 ? c : e < i * 20 ? "·" : hex[(Math.floor(e / 60) * 7 + i * 13) % 16])).join("");
    return tween(0, 1, total, (u) => parts.forEach((p, k) => void (p.textContent = line(n.slice(k * 16, k * 16 + 16), u * total))), ease.linear);
  };

  // ---------- the board ----------
  const rows = () => [...(rowsEl.current?.querySelectorAll<HTMLLIElement>("li[data-n]") ?? [])];
  const clearBoard = () => {
    for (const r of rows()) {
      r.classList.remove("is-hit", "is-also", "is-read");
      delete r.dataset.mark;
    }
    if (scan.current) scan.current.style.opacity = "0";
    thPath.current!.setAttribute("d", "");
    for (const el of [pinA.current!, pinB.current!, bead.current!]) el.setAttribute("visibility", "hidden");
  };
  const placeScan = (r: HTMLElement) => {
    scan.current!.style.transform = `translateY(${r.offsetTop}px)`;
    const box = rowsEl.current!;
    if (r.offsetTop < box.scrollTop || r.offsetTop + r.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = r.offsetTop - box.clientHeight / 2;
  };

  // ---------- the red thread, from N on the sheet to a row of the board ----------
  const rel = (el: Element) => rectIn(el, desk.current!);
  const fromN = (): XY => {
    const r = rel(nCode.current!);
    return { x: r.x + r.w + 6, y: r.y + r.h / 2 };
  };
  const toBoard = (el: Element): XY => {
    const r = rel(el);
    const b = rel(boardEl.current!);
    return { x: b.x + 8, y: r.y + r.h / 2 };
  };
  const threadTo = (p1: XY, p2: XY) => {
    const sag = 40 + Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.16;
    const c1 = { x: p1.x + (p2.x - p1.x) * 0.33, y: p1.y + (p2.y - p1.y) * 0.33 + sag };
    const c2 = { x: p1.x + (p2.x - p1.x) * 0.7, y: p1.y + (p2.y - p1.y) * 0.7 + sag };
    thPath.current!.setAttribute("d", `M${p1.x} ${p1.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`);
    for (const [pin, p] of [
      [pinA.current!, p1],
      [pinB.current!, p2],
    ] as const) {
      pin.removeAttribute("visibility");
      pin.setAttribute("cx", String(p.x));
      pin.setAttribute("cy", String(p.y));
    }
  };
  const drawThread = async (target: Element) => {
    threadTo(fromN(), toBoard(target));
    const path = thPath.current!;
    const b = bead.current!;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    await tween(
      0,
      1,
      600,
      (u) => {
        path.style.strokeDashoffset = String(len * (1 - u));
        const p = path.getPointAtLength(len * u);
        if (u < 1) {
          b.removeAttribute("visibility");
          b.setAttribute("transform", `translate(${p.x} ${p.y})`);
        } else b.setAttribute("visibility", "hidden");
      },
      ease.softInOut,
    );
    path.style.strokeDasharray = "none";
    path.style.strokeDashoffset = "0";
  };

  // ---------- B's hanko comes down on the sheet; the stamped copy later peels into the pile ----------
  const center = (el: Element): XY => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const slam = async (glyph: string) => {
    const h = hanko.current!;
    const a = center(h);
    const b = center(spot.current!);
    const d = { x: b.x - a.x, y: b.y - a.y };
    await run(h, { x: d.x, y: d.y - 10, scale: 1.35, duration: 460 }, ease.softInOut);
    await run(h, { y: d.y, scale: 1, duration: dur.seal }, ease.snapSettle);
    await run(h, { scaleY: 0.92, scaleX: 1.04, duration: dur.press });
    flushSync(() => setMark(glyph));
    markNow.current = glyph;
    void run(markEl.current!, { scale: [1.5, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
    void run(skWrap.current!, { x: [0, -3, 3, 0], duration: 160 });
    void run(boardEl.current!, { x: [0, 2, -2, 0], duration: 160 });
    await run(h, { scaleY: 1, scaleX: 1, duration: dur.press });
    await run(h, { x: 0, y: 0, scale: 1, duration: dur.exit }, ease.accelExit);
  };
  const peel = async () => {
    const glyph = markNow.current;
    if (!glyph) return;
    markNow.current = null;
    flushSync(() => setPile((p) => [...p, glyph]));
    const slip = pileEl.current!.lastElementChild!;
    void run(markEl.current!, { opacity: 0, scale: 0.9, duration: dur.exit }, ease.accelExit).then(() => setMark(null));
    if (still()) setMark(null);
    await run(slip, { x: [60, 0], y: [40, 0], rotate: [10, 0], opacity: [0, 1], duration: dur.exit + 100 }, ease.softLand);
  };
  /** Where the k-th returned copy rests: a column under the sheet's edge, a row above it on phones. */
  const rest = (el: HTMLElement | null, k: number) => {
    if (!el || el.dataset.placed) return;
    const narrow = innerWidth <= 640;
    el.dataset.placed = "true";
    el.style.setProperty("--x", `${narrow ? k * 34 : 0}px`);
    el.style.setProperty("--y", `${narrow ? 0 : k * 44}px`);
    el.style.setProperty("--r", `${((k * 37) % 9) - 4}deg`);
  };

  // ---------- the attempts counter rolls ----------
  const setCount = (n: number) => {
    const box = countN.current!;
    const old = box.firstElementChild as HTMLElement | null;
    const nu = document.createElement("span");
    nu.textContent = pad(n);
    box.append(nu);
    box.setAttribute("aria-label", `${n} attempt${n === 1 ? "" : "s"}`);
    if (!old) return;
    if (still()) return void old.remove();
    const h = box.getBoundingClientRect().height;
    void run(old, { y: [0, -h], opacity: [1, 0], duration: dur.exit }, ease.accelExit).then(() => old.remove());
    void run(nu, { y: [h, 0], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
  };

  /** On a phone the sheet and the board are stacked: bring the one that acts into view. */
  const bring = async (el: Element) => {
    const r = el.getBoundingClientRect();
    if (innerWidth >= 900 || (r.top >= 0 && r.bottom <= innerHeight)) return;
    el.scrollIntoView({ behavior: still() ? "auto" : "smooth", block: "center" });
    await wait(500);
  };

  // ---------- one try: N resolves, the seal is read, the thread runs to the board, the hanko comes down ----------
  const tryOnce = async () => {
    if (busyNow.current) return;
    busyNow.current = true;
    flushSync(() => setBusy(true));
    await peel();
    clearBoard();
    let forgedN = 0;
    let pledgedN = 0;
    try {
      tries.current++;
      let invoice: string | null = null;
      let changed: string[] = [];
      let n: string | null = null;
      try {
        ({ invoice, changed } = edited());
        n = json<Decoded>(wasm.invoiceDecode(invoice)).nullifier;
      } catch {
        invoice = null;
      }
      speak("待", "Let me see it. First the buyer's seal, on these exact bytes.");
      const b = await board();
      const exit = invoice ? checkOffer(wasm, invoice, KIT.buyerSignature, b.json) : ({ kind: "forged", reason: "not an invoice" } as const);
      await resolveN(n);

      // B's ring reads the seal
      const rg = ring.current!;
      rg.style.opacity = "1";
      await tween(0, 1, 700, (u) => rg.setAttribute("transform", `rotate(${u * 180} 34 34)`), ease.softInOut);
      rg.style.opacity = "0";

      if (exit.kind === "forged") {
        const c = crack.current!;
        if (!still()) {
          c.style.strokeDasharray = "80";
          await tween(0, 1, 260, (u) => void (c.style.strokeDashoffset = String(80 * (1 - u))), ease.snapSettle);
        }
        flushSync(() => {
          setIdle(true);
          setLookup("not consulted");
          setBoardNote("B stopped at the seal. The board was never asked.");
        });
        speak(
          "偽",
          !invoice
            ? "These fields do not make an invoice. Nobody sealed this."
            : changed.length
              ? `You changed the ${changed.map((k) => LABEL[k]).join(", ")}. The buyer sealed other bytes, so the seal does not hold. I stop here, before the board.`
              : `The buyer's seal does not hold for these bytes (${exit.reason}). I stop here, before the board.`,
        );
        await slam("偽");
        forgedN = 1;
      } else {
        speak("待", "The seal holds. Now the public board, for this fingerprint.");
        flushSync(() => {
          setIdle(false);
          setScanning(true);
          setLookup(n ? `N = ${short(n)}` : "N");
        });
        await bring(boardEl.current!);
        await drawThread(bdQ.current!);

        // the lookup scans the rows; the thread's end rides the scan
        const list = rows();
        const hits: HTMLLIElement[] = [];
        const step = Math.min(70, 1400 / Math.max(1, list.length));
        if (list.length) scan.current!.style.opacity = "1";
        for (const r of list) {
          placeScan(r);
          threadTo(fromN(), toBoard(r));
          r.classList.add("is-read");
          if (n && r.dataset.n === n) {
            hits.push(r);
            r.classList.add(hits.length === 1 ? "is-hit" : "is-also");
            r.dataset.mark = hits.length === 1 ? "重" : "②";
            void run(r, { x: [0, 3, 0], duration: dur.seal }, ease.snapSettle);
            await wait(220);
          }
          await wait(step);
          r.classList.remove("is-read");
        }
        flushSync(() => setScanning(false));

        if (exit.kind === "pledged") {
          const first = list.find((r) => r.dataset.txid === exit.txid) ?? hits[0];
          if (first) {
            placeScan(first);
            threadTo(fromN(), toBoard(first));
          }
          const entry = entries.find((e) => e.txid === exit.txid);
          const others = exit.others;
          const later = others ? `, and ${others} later entr${others === 1 ? "y" : "ies"} with the same N` : "";
          flushSync(() => setBoardNote(`Found at block ${exit.height ?? "?"}${entry ? ` · tx ${entry.tx_index}` : ""}${later}. ${boardLine(b)}`));
          speak(
            "重",
            `Block ${exit.height ?? "?"} already holds this fingerprint${others ? `, and ${others} later entr${others === 1 ? "y" : "ies"} for another financier` : ""}. Already pledged: I refuse. I learn only that, not who A is and not the amount.`,
          );
          await bring(sheet.current!);
          await slam("重");
          pledgedN = 1;
          // a double on the board: B hangs Exhibit A off the slab
          const doubles = n ? entries.filter((e) => e.n === n) : [];
          if (n && doubles.length >= 2) {
            if (!tag) {
              flushSync(() => setTag({ n, first: doubles[0].height, second: doubles[1].height }));
              const t = tagEl.current!;
              void run(t, { y: [-t.getBoundingClientRect().height, 0], duration: 650 }, ease.softLand);
            } else void run(tagEl.current!, { rotate: [0, -3.2, 0], duration: dur.exit });
          }
        } else {
          flushSync(() => setBoardNote(boardLine(b)));
          speak("認", `Not on the board: I could finance it. If the buyer sealed this invoice, you found a hole; please tell us. (${boardLine(b)})`);
        }
      }
    } catch (e) {
      flushSync(() => setScanning(false));
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      setTally((t) => ({ forged: t.forged + forgedN, pledged: t.pledged + pledgedN }));
      setCount(tries.current);
      busyNow.current = false;
      setBusy(false);
    }
  };

  // ---------- the chapters below the desk ----------
  const loadExhibit = async () => {
    const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`the proof answered ${r.status}`);
    const exhibit = wasm.exhibitFromProof((await r.text()).trim());
    const b = await board();
    return { exhibit, board: b.json, line: boardLine(b) };
  };
  const loadLens = async () => {
    const b = await board();
    const list = JSON.parse(b.json) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
    const mine = list.find((e) => e.txid === at.txid);
    if (!mine) throw new Error("the entry is not in this board data");
    const d = json<{ kind: string; nullifier: string; financier_commitment: string; discount_bucket: number; tenor_bucket: number; signature: string }>(wasm.boardMemoDescribe(mine.memo));
    return {
      invoice: { id: orig.invoice_id, amount: `${zatToZec(orig.amount_zat)} ZEC`, buyer: orig.buyer_pk, due: daysToDate(orig.due_date) },
      memo: {
        kind: d.kind === "RegisterWithHistory" ? "register, with a buyer history tag" : "register",
        n: d.nullifier,
        commitment: d.financier_commitment,
        classes: d.discount_bucket === 0 && d.tenor_bucket === 0 ? "not disclosed (0/0)" : `discount ${d.discount_bucket}, tenor ${d.tenor_bucket}`,
        signature: d.signature,
        where: `block ${mine.height}, tx ${mine.tx_index}`,
      },
    };
  };

  // runs once the desk is in <main> (Page draws it through a portal, after this component mounts)
  const ready = () => {
    setCount(0);
    void board().then(
      (b) => {
        flushSync(() => {
          setEntries(entriesOf(b.json, (m) => wasm.boardMemoDescribe(m), at.txid));
          setBoardNote(boardLine(b));
        });
        if (!still())
          rows().forEach((li, j) => {
            li.style.opacity = "0";
            void run(li, { opacity: [0, 1], x: [-8, 0], duration: dur.fade, delay: 300 + j * 40 });
          });
      },
      (e) => setBoardNote(e instanceof Error ? e.message : String(e)),
    );
    if (!still()) {
      // the title's words land, the sheet settles onto the folder, the buyer's seal is pressed
      const words = [...h1.current!.querySelectorAll<HTMLElement>(".w")];
      wordDelays(words.length).forEach((delay, i) => {
        words[i].style.opacity = "0";
        void run(words[i], { opacity: [0, 1], y: [5, 0], duration: dur.enter, delay }, ease.softLand);
      });
      const s = sheet.current!;
      s.style.opacity = "0";
      void run(s, { y: [24, 0], opacity: [0, 1], duration: dur.enter + 100 }, ease.softLand).then(() => run(art.current!, { scale: [1.4, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle));
      void resolveN(orig.nullifier);
    }
    if (autoplay) void play({ amount: fields.amount.current!, offer: offer.current!, takeHome: printButton.current!, glyph: sayG.current!, exOut: printOut.current! });
  };

  const kind = (e: Entry) => (e.mine ? "financier A" : e.kind === "RegisterWithHistory" ? "with history" : e.kind.toLowerCase());

  return (
    <Page wide>
      <div className="tcase" data-wide="true">
        <svg className="tc-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <filter id="tc-ink" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves={2} seed={4} />
              <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.7 1.25" />
              <feComposite in="SourceGraphic" operator="in" />
            </filter>
          </defs>
        </svg>

        {/* ===================== the case desk ===================== */}
        <div className="scene is-hero">
          <section className="cap cap-hero" aria-labelledby="tc-h1">
            <p className="kanji-tag">
              <span className="hk" lang="ja">
                試
              </span>
              {KIT.case}
            </p>
            <h1 id="tc-h1" ref={h1}>
              {TITLE.map((w, i) => (
                <span key={w}>
                  {i ? " " : null}
                  <span className="w">{w}</span>
                </span>
              ))}
            </h1>
            <p className="lede">You are Kurogane Trading. Financier A already paid for this invoice. Change anything you like and sell it again to financier B.</p>
            <ol className="rules" aria-label="How a try goes">
              <li>
                <span className="rn" lang="ja">
                  一
                </span>
                <span>
                  Edit any field on the <span lang="ja">請求書</span>. Its fingerprint N follows every keystroke.
                </span>
              </li>
              <li>
                <span className="rn" lang="ja">
                  二
                </span>
                <span>Offer it to financier B. B reads the buyer's seal, then the public board.</span>
              </li>
              <li>
                <span className="hk is-sm" lang="ja">
                  偽
                </span>
                <span>
                  <b>Forged seal.</b> The buyer sealed other bytes.
                </span>
              </li>
              <li>
                <span className="hk is-sm" lang="ja">
                  重
                </span>
                <span>
                  <b>Already pledged.</b> N is already on the Zcash testnet board.
                </span>
              </li>
              <li className="is-none">
                <span className="hk is-sm is-ghost" lang="ja">
                  済
                </span>
                <span>
                  <b>Financed twice.</b> No try has reached it.
                </span>
              </li>
            </ol>
            <div className="count" role="status">
              <p className="count-k">Attempts</p>
              <p className="count-n" aria-label="0 attempts" ref={countN} />
              <p className="count-t">
                <span>
                  <i lang="ja">偽</i>
                  <b>{tally.forged}</b>forged seal
                </span>
                <span>
                  <i lang="ja">重</i>
                  <b>{tally.pledged}</b>already pledged
                </span>
                <span>
                  <i lang="ja">済</i>
                  <b>0</b>financed twice
                </span>
              </p>
            </div>
          </section>

          <section className="desk" aria-label="The case desk: your invoice and the public board" ref={desk}>
            <div className="sk-wrap" ref={skWrap}>
              <span className="folder" aria-hidden="true">
                <span className="folder-tab" lang="ja">
                  案 0417
                </span>
              </span>
              <div className="pile" aria-hidden="true" ref={pileEl}>
                {pile.map((g, k) => (
                  <span key={k} className="slip" ref={(el) => rest(el, k)}>
                    <b lang="ja">{g}</b>
                  </span>
                ))}
              </div>
              <Seikyusho
                o={{ id: orig.invoice_id, amount: zatToZec(orig.amount_zat), issued: daysToDate(orig.issue_date), due: daysToDate(orig.due_date), terms: orig.terms_hash, buyer: orig.buyer_pk, supplier: orig.supplier_pk, issuer: KIT.supplier }}
                fields={fields}
                changed={live.changed}
                n={live.n}
                onInput={onInput}
                sheet={sheet}
                kase={{
                  sealed: live.sealed,
                  nCode,
                  ring,
                  crack,
                  art,
                  inside: (
                    <>
                      <span className="sk-spot" aria-hidden="true" ref={spot} />
                      <span className="sk-mark" aria-hidden="true" hidden={!mark} ref={markEl}>
                        {mark ? (
                          <svg viewBox="0 0 156 156">
                            <g filter="url(#tc-ink)">
                              <rect className="mk-line" x="6" y="6" width="144" height="144" rx="10" strokeWidth="5.5" />
                              <rect className="mk-line" x="15" y="15" width="126" height="126" rx="6" strokeWidth="1.6" />
                              <text className="mk-g" x="78" y="104" textAnchor="middle">
                                {mark}
                              </text>
                              <text className="mk-s" x="78" y="131" textAnchor="middle">
                                {MARK_SUB[mark] ?? ""}
                              </text>
                            </g>
                          </svg>
                        ) : null}
                      </span>
                    </>
                  ),
                }}
              />
            </div>

            <div className="act">
              <button type="button" className="seal-btn" disabled={busy} ref={offer} onClick={() => void tryOnce()}>
                <span>Offer it to financier B</span>
              </button>
              <button type="button" className="ink-link" disabled={busy} onClick={putBack}>
                Put back the original
              </button>
              <span className="hanko-rest" aria-hidden="true">
                <span className="hanko" ref={hanko}>
                  <i />
                </span>
              </span>
            </div>

            <div className="say">
              <span className="hk" lang="ja" ref={sayG}>
                {said.glyph}
              </span>
              <p className="say-who">Financier B</p>
              <p className="say-t" aria-live="polite">
                {said.text}
              </p>
            </div>

            <section className={idle ? "bd is-idle" : "bd"} aria-label="The public board on the Zcash testnet" ref={boardEl}>
              <div className="bd-face">
                <span className="bd-screw a" />
                <span className="bd-screw b" />
                <span className="bd-screw c" />
                <span className="bd-screw d" />
                <header className="bd-head">
                  <span className="bd-k" lang="ja">
                    公開台帳
                  </span>
                  <span className="bd-t">Public board · Zcash testnet</span>
                  <span className={scanning ? "bd-led is-busy" : "bd-led"} />
                </header>
                <p className="bd-q">
                  <span>lookup</span>
                  <code ref={bdQ}>{lookup}</code>
                </p>
                <div className="bd-cols" aria-hidden="true">
                  <span>block</span>
                  <span>fingerprint N</span>
                  <span>entry</span>
                </div>
                <ol className="bd-rows" ref={rowsEl}>
                  <li className="bd-scan" aria-hidden="true" ref={scan} />
                  {entries.map((e, j) => (
                    <li key={j} data-n={e.n} data-txid={e.txid}>
                      <span className="h">{String(e.height)}</span>
                      <code title={e.n}>{short(e.n)}</code>
                      <span className="k">{kind(e)}</span>
                    </li>
                  ))}
                </ol>
                <p className="bd-note">{boardNote}</p>
              </div>
            </section>

            <div className="tagwrap">
              <a
                className="tag-mini"
                href="#exhibit"
                hidden={!tag}
                ref={tagEl}
                onClick={(e) => {
                  e.preventDefault();
                  exhibitEl.current?.scrollIntoView({ behavior: still() ? "auto" : "smooth" });
                }}
              >
                <span className="tag-string" aria-hidden="true" />
                <span className="tag-hole" aria-hidden="true" />
                <h3>Exhibit A</h3>
                <p>One key signed this N for two financiers.</p>
                {tag ? (
                  <>
                    <code>{`N ${short(tag.n)}`}</code>
                    <code>{`① block ${tag.first} · ② block ${tag.second}`}</code>
                    <Bars n={tag.n} className="tag-bars" />
                  </>
                ) : null}
                <span className="tag-go">Take it home ↓</span>
              </a>
            </div>

            <svg className="thread" aria-hidden="true">
              <path ref={thPath} d="" />
              <circle className="pin" r="5" visibility="hidden" ref={pinA} />
              <circle className="pin" r="5" visibility="hidden" ref={pinB} />
              <g visibility="hidden" ref={bead}>
                <circle className="tn" r="9" />
                <text className="tn-t" textAnchor="middle" y="3.5">
                  N
                </text>
              </g>
            </svg>
          </section>
        </div>

        {/* ===================== Exhibit A ===================== */}
        <div className="scene chapter" id="exhibit" ref={exhibitEl}>
          <section className="cap">
            <p className="kanji-tag">
              <span className="hk" lang="ja">
                証
              </span>
              Exhibit A
            </p>
            <h2>What B takes home: Exhibit A</h2>
            <p>Kurogane also signed an entry for another financier, and it reached the board. B prints the evidence: the two signatures and where they sit on the board. It names no invoice, amount, buyer or financier, so B can hand it to anyone.</p>
          </section>
          <Exhibit load={loadExhibit} button={printButton} out={printOut} />
        </div>

        {/* ===================== the lens ===================== */}
        <div className="scene chapter">
          <section className="cap">
            <p className="kanji-tag">
              <span className="hk" lang="ja">
                視
              </span>
              The lens
            </p>
            <h2>What the world sees</h2>
            <p>The board's viewing key is published so anyone can audit it. Hold the seal: financier A's registration of this invoice, the way everyone else reads it.</p>
          </section>
          <Lens load={loadLens} />
        </div>

        {/* ===================== the limits ===================== */}
        <div className="scene chapter">
          <section className="cap">
            <p className="kanji-tag">
              <span className="hk" lang="ja">
                告
              </span>
              The limits
            </p>
            <h2>What the board does not stop</h2>
            <p>The board stops one signed invoice from being financed twice. It is not credit diligence.</p>
          </section>
          <Notice />
        </div>

        {/* ===================== the financier's side ===================== */}
        <div className="scene chapter">
          <section className="cap">
            <p className="kanji-tag">
              <span className="hk" lang="ja">
                融
              </span>
              The financier
            </p>
            <h2>The financier's side</h2>
            <p>A financier runs its own node and works from a passkey console. Try the demo console: create a passkey, read the node's sealed mailbox, see that payments wait for the passkey. Nothing there moves money.</p>
            <p className="fin-links">
              <a className="seal-btn" href="https://jitsuinfi-console-demo.vercel.app/console" target="_blank" rel="noopener">
                <span>Open the demo console</span>
              </a>
              <a className="ink-link" href="/apply">
                Become a financier
              </a>
            </p>
          </section>
          <Phone />
        </div>
        <Mounted then={ready} />
      </div>
      <NextRoom from="try" />
    </Page>
  );
}

// The 20-second clip of the video (HNK-30.T9, M-01 then M-03): /try/play runs the demo by itself
// at a filmable pace, the same way every time: change the amount (偽), put it back (重), print
// Exhibit A. Nothing else differs from the page a judge uses.
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await pause(100);
}

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  input.focus();
  input.value = "";
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await pause(110);
  }
}

async function play(p: { amount: HTMLInputElement; offer: HTMLButtonElement; takeHome: HTMLButtonElement; glyph: HTMLElement; exOut: HTMLElement }): Promise<void> {
  const original = p.amount.value;
  const verdict = (glyph: string) => () => p.glyph.textContent === glyph && !p.offer.disabled;
  await pause(1200);
  p.amount.scrollIntoView({ behavior: "smooth", block: "center" });
  await pause(700);
  await typeInto(p.amount, "0.0005");
  await pause(500);
  p.offer.click();
  await until(verdict("偽"));
  await pause(1600);
  await typeInto(p.amount, original);
  await pause(400);
  p.offer.click();
  await until(verdict("重"));
  await pause(2000);
  p.takeHome.scrollIntoView({ behavior: "smooth", block: "center" });
  await pause(600);
  p.takeHome.click();
  await until(() => p.exOut.dataset.printed === "true");
}
