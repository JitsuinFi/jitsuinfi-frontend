// "Try to double-finance" (HNK-30.T3 – T4, M-02 sealed invoice kit, M-01 two exits, D-40): the
// judge plays the supplier of Case File #0417 and offers an invoice that financier A already
// registered on the testnet board to financier B, as it is or changed in any field. Every try
// ends at one of two exits: 偽 (the buyer's seal does not hold for the bytes) or 重 (the board
// already holds the invoice's fingerprint). Nothing to install, no wallet, nothing recorded: the
// checks run in this browser with the same code as the node and `jitsuin verify`, against the
// live board scanned by the financier node (or a bundled copy when the node does not answer).
//
// The stage (HNK-30.T13, MASTER.md §8): financier B's 登記所 counter in first person. The judge's
// side is the counter top with the 請求書; B's side is the registry room behind the glass, where
// the board is the registry book under a lamp. Sliding the invoice across sends a copy through
// the slot; B's loupe reads the buyer's seal, B turns the registry to the invoice's fingerprint,
// the stamp comes down, and the copy comes back to the judge's pile with 偽 or 重 on it.
// React since HNK-31.T5: the stage is state; the choreography runs on refs, step after step.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Page } from "../app/AppShell";
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { dateToDays, daysToDate, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { checkOffer, encodeEdited, KIT, type InvoiceFields } from "../lib/kit";
import { dur, ease, rectIn, run, still, wait } from "./try/anim";
import { Lens } from "./try/Lens";
import { Notice } from "./try/Notice";
import { Phone } from "./try/Phone";
import { Printer } from "./try/Receipt";
import { entriesOf, Registry, type RegistryApi } from "./try/Registry";
import { Seikyusho, type SheetFields } from "./try/Seikyusho";
// try.css loads with the app shell (src/app/legacy-main.ts), where the verify page needs it too

const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-6)}`;
const LABEL: Record<string, string> = { invoice_id: "number", amount_zat: "amount", issue_date: "issue date", due_date: "due date", terms_hash: "terms" };

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

type Copy = { forged: boolean; amount: string; n: string | null; left: number; top: number; mark: string | null };
type Sheetlet = { glyph: string; r: string; i: string; shown: boolean };

export function TryPage({ autoplay = false }: { autoplay?: boolean }): ReactNode {
  const orig = useRef(json<Decoded>(wasm.invoiceDecode(KIT.invoice))).current;
  const at = KIT.financierA;

  const fields: SheetFields = { id: useRef(null), amount: useRef(null), issued: useRef(null), due: useRef(null), terms: useRef(null) };
  const [current, setCurrent] = useState<{ n: string | null; changed: string[] }>({ n: orig.nullifier, changed: [] });
  const cur = useRef(current);
  cur.current = current;
  const [said, setSaid] = useState({ glyph: "証", text: `Financier A registered this invoice at block ${at.height} before paying. Show me what you have.` });
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState({ forged: 0, pledged: 0 });
  const [copy, setCopy] = useState<Copy | null>(null);
  const [pile, setPile] = useState<Sheetlet[]>([]);
  const [threadD, setThreadD] = useState<string | null>(null);
  const [stampGlyph, setStampGlyph] = useState("");
  const [loupeUp, setLoupeUp] = useState(false);
  const [cracked, setCracked] = useState(false);

  const sheet = useRef<HTMLElement>(null);
  const counter = useRef<HTMLElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLSpanElement>(null);
  const loupe = useRef<HTMLSpanElement>(null);
  const loupeGlass = useRef<HTMLSpanElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const stampBase = useRef<HTMLSpanElement>(null);
  const copyEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLSpanElement>(null);
  const threadPath = useRef<SVGPathElement>(null);
  const pileEls = useRef<(HTMLSpanElement | null)[]>([]);
  const book = useRef<RegistryApi>(null);
  const offer = useRef<HTMLButtonElement>(null);
  const say = useRef<HTMLParagraphElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  const printOut = useRef<HTMLDivElement>(null);
  const tries = useRef(0);

  const speak = (glyph: string, text: string) => flushSync(() => setSaid({ glyph, text }));


  // ---------- live: the seal and N follow every keystroke ----------
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
      setCurrent({ n: json<Decoded>(wasm.invoiceDecode(r.invoice)).nullifier, changed: r.changed });
    } catch {
      setCurrent({ n: null, changed: ["unreadable"] });
    }
  };
  const putBack = () => {
    fields.id.current!.value = orig.invoice_id;
    fields.amount.current!.value = zatToZec(orig.amount_zat);
    fields.issued.current!.value = daysToDate(orig.issue_date);
    fields.due.current!.value = daysToDate(orig.due_date);
    fields.terms.current!.value = orig.terms_hash;
    follow();
  };

  // ---------- one try: slot, loupe, registry, stamp, back to the pile ----------
  const delta = (from: Element, to: Element) => {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
  };

  const press = async (glyph: string) => {
    flushSync(() => setStampGlyph(glyph));
    const s = stamp.current!;
    const d = delta(stampBase.current!, copyEl.current!);
    await run(s, { x: d.x, y: d.y - 46, rotate: -6, duration: 300 });
    await run(s, { y: d.y - 8, scaleY: 0.92, duration: dur.press }, ease.snapSettle);
    flushSync(() => setCopy((c) => (c ? { ...c, mark: glyph } : c)));
    void run(markEl.current!, { scale: [1.5, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
    void run(counter.current!, { x: [0, -3, 3, 0], duration: 160 });
    await run(s, { y: d.y - 8, scaleY: 1, duration: dur.press });
    await run(s, { x: 0, y: 0, rotate: 0, duration: dur.exit }, ease.accelExit);
  };

  const toPile = async (glyph: string) => {
    const k = tries.current;
    // CSS variables through the CSSOM: the CSP (style-src 'self') refuses inline style attributes
    flushSync(() => setPile((p) => [...p, { glyph, r: `${((k * 37) % 13) - 6}deg`, i: String(Math.min(k - 1, 8)), shown: false }]));
    const target = pileEls.current.filter(Boolean).at(-1)!;
    const d = delta(copyEl.current!, target);
    flushSync(() => setThreadD(null));
    await run(copyEl.current!, { x: d.x, y: d.y, scale: 0.42, rotate: 8, opacity: [1, 0.2], duration: dur.exit }, ease.accelExit);
    flushSync(() => {
      setCopy(null);
      setPile((p) => p.map((x, j) => (j === p.length - 1 ? { ...x, shown: true } : x)));
    });
    void run(target, { y: [-8, 0], duration: dur.enter }, ease.snapSettle);
  };

  const drawThread = (from: Element, to: Element) => {
    const host = counter.current!;
    const a = rectIn(from, host);
    const b = rectIn(to, host);
    const x1 = a.x + a.w,
      y1 = a.y + a.h / 2;
    const x2 = b.x,
      y2 = b.y + b.h / 2;
    const mid = (x1 + x2) / 2;
    flushSync(() => setThreadD(`M${x1} ${y1} C${mid} ${y1 + 40}, ${mid} ${y2 + 40}, ${x2} ${y2}`));
    const path = threadPath.current!;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = still() ? "0" : `${len}`;
    return run(path, { strokeDashoffset: [len, 0], duration: 600 }, ease.softInOut);
  };

  const tryOnce = async () => {
    flushSync(() => {
      setBusy(true);
      setThreadD(null);
    });
    book.current!.clear();
    let forgedN = 0;
    let pledgedN = 0;
    try {
      tries.current++;
      let invoice: string | null = null;
      let changed: string[] = [];
      try {
        ({ invoice, changed } = edited());
      } catch {
        invoice = null;
      }
      const b = await board();
      const exit = invoice ? checkOffer(wasm, invoice, KIT.buyerSignature, b.json) : ({ kind: "forged", reason: "not an invoice" } as const);
      const forged = exit.kind === "forged";

      // the copy goes through the slot onto B's desk
      speak("待", "Slide it under the glass. First the buyer's seal, on these exact bytes.");
      flushSync(() => setCopy({ forged, amount: value("amount"), n: cur.current.n, left: spot.current!.offsetLeft, top: spot.current!.offsetTop, mark: null }));
      const c = copyEl.current!;
      const d = delta(c, sheet.current!);
      const s = sheet.current!.getBoundingClientRect().width / Math.max(1, c.getBoundingClientRect().width);
      await run(c, { x: [d.x, 0], y: [d.y, 0], scale: [s, 1], rotate: [-2, 3], opacity: [0.3, 1], duration: dur.enter + 200 });

      // the loupe reads the seal
      flushSync(() => {
        setCracked(forged);
        setLoupeUp(true);
      });
      const seal = c.querySelector(".ct-copy-seal")!;
      const dl = delta(loupeGlass.current!, seal);
      await run(loupe.current!, { x: [0, dl.x - 60, dl.x], y: [0, dl.y + 30, dl.y], duration: 900 }, ease.softInOut);
      await wait(350);
      const park = () => run(loupe.current!, { x: 0, y: 0, duration: dur.exit }, ease.accelExit).then(() => setLoupeUp(false));

      if (forged) {
        speak("偽", invoice ? `You changed the ${changed.map((k) => LABEL[k]).join(", ")}. The buyer sealed other bytes, so the seal does not hold. I stop here, before the registry.` : "These fields do not make an invoice. Nobody sealed this.");
        void park();
        await press("偽");
        forgedN = 1;
        await wait(500);
        await toPile("偽");
      } else if (exit.kind === "pledged") {
        speak("待", "The seal holds. Now the registry, for this fingerprint.");
        void park();
        const row = await book.current!.find(exit.txid);
        if (row) await drawThread(copyEl.current!.querySelector(".ct-copy-n")!, row);
        speak(
          "重",
          `Block ${exit.height ?? "?"} already holds this fingerprint${exit.others ? `, and ${exit.others} later entr${exit.others === 1 ? "y" : "ies"} for another financier` : ""}. Already pledged: I refuse. I learn only that, not who A is and not the amount.`,
        );
        await press("重");
        pledgedN = 1;
        await wait(700);
        await toPile("重");
      } else {
        speak("認", `Not in the registry: I could finance it. If the buyer sealed this invoice, you found a hole; please tell us. (${boardLine(b)})`);
        void park();
        await toPile("認");
      }
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      setTally((t) => ({ forged: t.forged + forgedN, pledged: t.pledged + pledgedN }));
      setBusy(false);
    }
  };

  // ---------- below the counter ----------
  const loadExhibit = async () => {
    const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`the proof answered ${r.status}`);
    const exhibit = wasm.exhibitFromProof((await r.text()).trim());
    const b = await board();
    return { exhibit, board: b.json, line: boardLine(b) };
  };
  const loadLens = async () => {
    const b = await board();
    const entries = JSON.parse(b.json) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
    const mine = entries.find((e) => e.txid === at.txid);
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

  // runs once the stage is in <main> (Page draws it through a portal, after this component mounts)
  const ready = () => {
    void board().then(
      (b) => book.current!.set(entriesOf(b.json, (m) => wasm.boardMemoDescribe(m), at.txid), boardLine(b)),
      (e) => book.current!.set([], e instanceof Error ? e.message : String(e)),
    );
    if (autoplay) void play({ amount: fields.amount.current!, offer: offer.current!, takeHome: printButton.current!, out: say.current!, exOut: printOut.current! });
  };

  const count = (glyph: string, word: string, n: number) => (
    <p>
      <span lang="ja">{glyph}</span>
      <strong>{String(n)}</strong>
      <small>{word}</small>
    </p>
  );

  return (
    <Page wide>
      <div className="try" data-wide="true">
        <header className="try-head">
          <p className="try-case">
            <span lang="ja">案</span>
            {KIT.case}
          </p>
          <h1>Try to double-finance</h1>
          <p>You are Kurogane Trading. Financier A already paid for this invoice. Change anything you like and sell it again to financier B.</p>
        </header>
        <section className="ct" aria-label="Financier B's counter" ref={counter}>
          {/* the judge's side: the counter top */}
          <div className="ct-desk">
            <Seikyusho
              o={{ id: orig.invoice_id, amount: zatToZec(orig.amount_zat), issued: daysToDate(orig.issue_date), due: daysToDate(orig.due_date), terms: orig.terms_hash, buyer: orig.buyer_pk, supplier: orig.supplier_pk, issuer: KIT.supplier }}
              fields={fields}
              changed={current.changed}
              n={current.n}
              onInput={follow}
              sheet={sheet}
            />
            <div className="ct-act">
              <button type="button" className="seal-btn" disabled={busy} ref={offer} onClick={() => void tryOnce()}>
                <span>Slide it to financier B</span>
              </button>
              <button type="button" className="ink-link" disabled={busy} onClick={putBack}>
                Put back the original
              </button>
            </div>
            <div className="ct-pile">
              <div className="ct-stack" aria-hidden="true">
                {pile.map((x, i) => (
                  <span key={i} className="ct-sheetlet" lang="ja" style={{ "--r": x.r, "--i": x.i, visibility: x.shown ? undefined : "hidden" } as CSSProperties} ref={(e) => void (pileEls.current[i] = e)}>
                    {x.glyph}
                  </span>
                ))}
              </div>
              <div className="ct-tally" role="status">
                {count("偽", "forged seal", tally.forged)}
                {count("重", "already pledged", tally.pledged)}
                {count("済", "financed twice", 0)}
              </div>
            </div>
          </div>
          {/* B's side: the registry room behind the glass */}
          <div className="ct-window">
            <p className="ct-plaque">
              <span lang="ja">登記所</span>
              <small>Financier B</small>
            </p>
            <div className="ct-room" ref={room}>
              <div className="ct-light" aria-hidden="true">
                <span className="ct-cone" />
              </div>
              <span className="ct-lamp" aria-hidden="true">
                <i />
              </span>
              <span className="ct-bdesk" aria-hidden="true" />
              <Registry api={book} />
              <span className="ct-spot" aria-hidden="true" ref={spot} />
              <span className={`ct-loupe${loupeUp ? " is-up" : ""}`} aria-hidden="true" ref={loupe}>
                <span className={`ct-loupe-glass${cracked ? " is-cracked" : ""}`} ref={loupeGlass}>
                  <b lang="ja">買</b>
                  <i />
                </span>
                <span className="ct-loupe-handle" />
              </span>
              <span className="ct-stamp" aria-hidden="true" ref={stamp}>
                <span className="ct-stamp-knob" />
                <span className="ct-stamp-neck" />
                <span className="ct-stamp-base" ref={stampBase}>
                  <b lang="ja">{stampGlyph}</b>
                </span>
              </span>
              <p className="ct-say" aria-live="polite" ref={say}>
                <span className="hanko" lang="ja">
                  {said.glyph}
                </span>
                <span>{said.text}</span>
              </p>
              {copy ? (
                <div className={`ct-copy${copy.forged ? " is-forged" : ""}`} aria-hidden="true" style={{ left: `${copy.left}px`, top: `${copy.top}px` }} ref={copyEl}>
                  <span className="ct-copy-t" lang="ja">
                    請 求 書
                  </span>
                  <span className="ct-copy-a">{`${copy.amount || "?"} ZEC`}</span>
                  <span className="ct-copy-n">
                    <b>N</b>
                    {copy.n ? short(copy.n) : "none"}
                  </span>
                  <span className="ct-copy-seal" lang="ja">
                    買
                  </span>
                  {copy.mark ? (
                    <span className="ct-mark" lang="ja" ref={markEl}>
                      {copy.mark}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <span className="ct-grille" aria-hidden="true" />
            <span className="ct-slot" aria-hidden="true" />
          </div>
          <svg className="ct-thread" aria-hidden="true">
            {threadD ? <path d={threadD} ref={threadPath} /> : null}
          </svg>
        </section>
        <section className="ch ch-ex">
          <Printer load={loadExhibit} button={printButton} out={printOut} />
          <div className="ch-text">
            <h2>What B takes home: Exhibit A</h2>
            <p>Kurogane also signed an entry for another financier, and it reached the board. B prints the evidence: the two signatures and where they sit on the board. It names no invoice, amount, buyer or financier, so B can hand it to anyone.</p>
          </div>
        </section>
        <section className="ch ch-lens">
          <div className="ch-text">
            <h2>What the world sees</h2>
            <p>The board's viewing key is published so anyone can audit it. Hold the seal: financier A's registration of this invoice, the way everyone else reads it.</p>
          </div>
          <Lens load={loadLens} />
        </section>
        <section className="ch ch-wall">
          <Notice />
        </section>
        <section className="ch ch-fin">
          <div className="ch-text">
            <h2>The financier's side</h2>
            <p>A financier runs its own node and works from a passkey console. Try the demo console: create a passkey, read the node's sealed mailbox, see that payments wait for the passkey. Nothing there moves money.</p>
            <p className="ch-links">
              <a className="seal-btn" href="https://jitsuinfi-console-demo.vercel.app/console" target="_blank" rel="noopener">
                <span>Open the demo console</span>
              </a>
              <a className="ink-link" href="/apply">
                Become a financier
              </a>
            </p>
          </div>
          <Phone />
        </section>
        <Mounted then={ready} />
      </div>
    </Page>
  );
}

/** Calls `then` once, after the elements before it are in the document. */
function Mounted({ then }: { then: () => void }): null {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    then();
  });
  return null;
}

// The 20-second clip of the video (HNK-30.T9, M-01 then M-03): /try/play runs the demo by itself
// at a filmable pace, the same way every time: change the amount (偽), put it back (重), print
// Exhibit A. Nothing else differs from the page a judge uses.
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 12000): Promise<void> {
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

async function play(p: { amount: HTMLInputElement; offer: HTMLButtonElement; takeHome: HTMLButtonElement; out: HTMLElement; exOut: HTMLElement }): Promise<void> {
  const original = p.amount.value;
  const verdict = (glyph: string) => () => p.out.querySelector(".hanko")?.textContent === glyph && !p.offer.disabled;
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
