// Verify screen for auditors and judges (HNK-07.T2 crucial, HNK-07.T3 "caught" view): checks a
// bundle or a double-signature proof in the browser, offline or against board data.
// Proofs (HNK-28.T2): with board data, every position the proof claims is checked by the same
// rule as `jitsuin verify` (wasm `verifyProofOnBoard`); without it, positions are shown as
// claimed only, never as facts.
//
// The page (HNK-34.T4, design sample design-samples/internal/verify.html): the registry's public
// inspection window 閲覧所. Caption on the left (what you can hand in, the board's block); on the
// right a paper in-tray groups the inputs, and the bench shows the handed-in sheet with one line
// per check under the clerk's loupe (src/pages/verify/loupe.ts). The real result drives it: the
// loupe slides line by line and presses each check's mark (認 偽 重 待, a dot for a line read),
// one big hanko gives the verdict (真 genuine, 偽 not genuine, 未 not yet, 重 double financing,
// 拒 refused), and the board strip lights the entries the document claims.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Mounted, Page } from "../app/AppShell";
import { boardLine, loadBoard } from "../lib/board";
import { bundleVerdict, letterStatus } from "../lib/bundle-verdict";
import { codeKind, daysToDate, json, wasm, zatToZec } from "../lib/core";
import { KIT } from "../lib/kit";
import { NET } from "../lib/network";
import { download } from "../lib/download";
import { takeForVerify } from "../lib/verify-handoff";
import { NextRoom } from "../app/NextRoom";
import { dur, ease, run, still, wait } from "./try/anim";
import { BoardStrip, boardRows, type BoardApi } from "./verify/BoardStrip";
import { Loupe } from "./verify/loupe";
import type { Glyph, Sheet, Stamp } from "./verify/sheet";
// verify.css loads with the app shell (src/app/app-styles.ts)

interface At {
  txid: string;
  height: number;
  tx_index?: number;
  output_index?: number;
}

interface ProofOnBoard {
  holds: boolean;
  signatures: { ok: boolean; error?: string; nullifier?: string; supplier_pk?: string; first_commitment?: string; second_commitment?: string; invoice_id?: string };
  first: { claimed_at: At | null; on_board: boolean | null };
  second: { claimed_at: At | null; on_board: boolean | null };
  ordered: boolean | null;
  board_entries: number;
}

interface ExhibitOnBoard extends Omit<ProofOnBoard, "board_entries"> {
  board_entries: number | null;
  binds: boolean | null;
}

/** One line of the sheet: what was checked, what was found, and its mark. */
interface Check {
  g: Glyph;
  what: string;
  found: string;
  stamp: Stamp;
  mono?: boolean;
  /** For the letter: seals still open. */
  open?: number;
  /** Board entries this line names, lit on the board strip. */
  hit?: string[];
  unread?: boolean;
}
/** The big hanko: 真 genuine, 偽 not genuine, 未 not yet, 重 double financing. */
type Hanko = "真" | "偽" | "未" | "重";
interface Inspection {
  verdict: { glyph: Hanko; title: string; text: string; err?: string };
  kind: string;
  checks: Check[];
  keep?: { name: string; text: string };
  /** Refused: the first line failed and nothing else was read; the board is not asked. */
  refused?: boolean;
}

/** The first wasm check threw: the sheet is not genuine, nothing else in it is read. */
class Refused extends Error {}
function first<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new Refused(e instanceof Error ? e.message : String(e));
  }
}

const at = (a: At) => `block ${a.height}, tx ${a.tx_index ?? "?"}`;
const claimLine = (c: { claimed_at: At | null; on_board: boolean | null }, none: string): [string, Stamp] =>
  !c.claimed_at ? [none, ""] : c.on_board === null ? [`claimed: ${at(c.claimed_at)}; no board data`, "待"] : c.on_board ? [`on the board at ${at(c.claimed_at)}`, "認"] : [`NOT on the board at ${at(c.claimed_at)}`, "偽"];
const hitOf = (c: { claimed_at: At | null }) => (c.claimed_at ? [c.claimed_at.txid] : undefined);
/** Seals of the letter still open: it is sealed supplier, buyer, financier in that order. */
const openSeals = (a: string | null) => (a === null ? 3 : a === "Sealed" ? 0 : ({ Supplier: 3, Buyer: 2, Financier: 1 } as Record<string, number>)[a.replace("AwaitingSeal:", "")] ?? 3);

function inspectBundle(c: string, boardJson?: string): Inspection {
  const v = json<{ nullifier: string; invoice_id: string; amount_zat: number; due_date: number; assignment: string | null }>(first(() => wasm.verifyBundle(c)));
  const verdict = bundleVerdict(v.assignment);
  const checks: Check[] = [
    { g: "seal", what: "Buyer's signature", found: "holds for these exact invoice bytes", stamp: "認" },
    { g: "doc", what: "Invoice", found: v.invoice_id, stamp: "" },
    { g: "amount", what: "Amount", found: `${zatToZec(v.amount_zat)} ZEC, due ${daysToDate(v.due_date)}`, stamp: "" },
    { g: "seals3", what: "Assignment letter", found: letterStatus(v.assignment), stamp: v.assignment === null ? "" : v.assignment === "Sealed" ? "認" : "待", open: openSeals(v.assignment) },
    { g: "n", what: "Fingerprint N", found: v.nullifier, stamp: "", mono: true },
  ];
  let glyph: Hanko = verdict.kind === "ok" ? "真" : "未";
  let title = verdict.title;
  let text = verdict.text;
  if (boardJson) {
    const b = json<{ register: { status: string; txid?: string; conflicting?: string[] }; settled: { txid: string; on_time: boolean } | null }>(wasm.bundleOnBoard(c, boardJson));
    const reg = b.register;
    const hit = [reg.txid, ...(reg.conflicting ?? [])].filter((x): x is string => !!x);
    if (reg.status === "DoubleFinanced") {
      checks.push({ g: "board", what: "Registration", found: `registered for ${1 + (reg.conflicting?.length ?? 0)} financiers`, stamp: "重", hit });
      glyph = "重";
      title = "Double financing on the board";
      text = "The supplier registered this invoice for more than one financier.";
    } else if (reg.status === "Registered") {
      checks.push({ g: "board", what: "Registration", found: `once, entry ${reg.txid?.slice(0, 16)}…`, stamp: "認", hit });
    } else {
      checks.push({ g: "board", what: "Registration", found: "no register entry for this invoice", stamp: "待" });
    }
    checks.push({ g: "settled", what: "Settled", found: b.settled ? `yes, ${b.settled.on_time ? "on time" : "late"}` : "no", stamp: b.settled ? "認" : "", hit: b.settled ? [b.settled.txid] : undefined });
  }
  return { verdict: { glyph, title, text }, kind: "Verification bundle (JTSB)", checks };
}

function inspectProof(c: string, boardJson?: string): Inspection {
  const p = json<{ nullifier: string; supplier_pk: string; first_commitment: string; second_commitment: string; first_at: At | null; second_at: At | null }>(first(() => wasm.verifyProof(c)));
  const keep = { name: "double-signature.proof.txt", text: c };
  const keys: Check[] = [
    { g: "n", what: "Fingerprint N", found: p.nullifier, stamp: "", mono: true },
    { g: "key", what: "Supplier key", found: p.supplier_pk, stamp: "", mono: true },
  ];
  if (!boardJson) {
    return {
      verdict: p.first_at
        ? { glyph: "未", title: "Signatures check out; board not checked", text: "The supplier signed this invoice for two different financiers. Add board data to check the positions the proof claims." }
        : { glyph: "偽", title: "Proof does not hold", text: "It gives no board position for the first entry, so nobody can check that this financier registered first." },
      kind: "Double-signature proof (JTSP)",
      checks: [{ g: "seals2", what: "Signatures", found: "the supplier signed N for two financiers", stamp: "認" }, ...keys],
      keep,
    };
  }
  const r = json<ProofOnBoard>(wasm.verifyProofOnBoard(c, boardJson));
  const [f1, s1] = claimLine(r.first, "NO position given: the proof cannot be checked");
  const [f2, s2] = claimLine(r.second, "offered privately, never posted");
  const checks: Check[] = [
    { g: "seals2", what: "Signatures", found: r.signatures.ok ? `the buyer signed invoice ${r.signatures.invoice_id}; the supplier signed it for 2 financiers` : `do not check out: ${r.signatures.error}`, stamp: r.signatures.ok ? "認" : "偽" },
    { g: "board", what: "Entry ①", found: f1, stamp: s1 || "偽", hit: r.first.on_board ? hitOf(r.first) : undefined },
    { g: "board", what: "Entry ②", found: f2, stamp: s2, hit: r.second.on_board ? hitOf(r.second) : undefined },
    ...keys,
  ];
  if (r.ordered !== null) checks.splice(3, 0, { g: "order", what: "Order", found: r.ordered ? "① came before ②" : "① is NOT before ②", stamp: r.ordered ? "認" : "偽" });
  return {
    verdict: r.holds
      ? { glyph: "重", title: "Double financing proven", text: "Two registrations of one invoice for two financiers, both signed with the supplier's key, and every position the proof claims is on the board. Same rule as jitsuin verify." }
      : { glyph: "偽", title: "Proof does not hold", text: "At least one claim fails against this board data." },
    kind: "Double-signature proof (JTSP)",
    checks,
    keep,
  };
}

/** Exhibit A (HNK-30.T5, D-44): the double signature without the deal; the invoice is optional. */
function inspectExhibit(c: string, boardJson: string | undefined, invoice: string | undefined): Inspection {
  const r = json<ExhibitOnBoard>(first(() => wasm.verifyExhibitOnBoard(c, boardJson ?? null, invoice ?? null)));
  const [f1, s1] = claimLine(r.first, "NO position given: the exhibit cannot be checked");
  const [f2, s2] = claimLine(r.second, "offered privately to the financier that caught it, never posted");
  const checks: Check[] = [
    { g: "seals2", what: "Signatures", found: r.signatures.ok ? "one key signed this fingerprint for 2 different financiers" : `do not check out: ${r.signatures.error}`, stamp: r.signatures.ok ? "認" : "偽" },
    { g: "board", what: "Entry ①", found: f1, stamp: s1 || "偽", hit: r.first.on_board ? hitOf(r.first) : undefined },
    { g: "board", what: "Entry ②", found: f2, stamp: s2, hit: r.second.on_board ? hitOf(r.second) : undefined },
  ];
  if (r.ordered !== null) checks.push({ g: "order", what: "Order", found: r.ordered ? "① came before ②" : "① is NOT before ②", stamp: r.ordered ? "認" : "偽" });
  checks.push(
    {
      g: "doc",
      what: "Which invoice",
      found: r.binds === null ? "not stated: the exhibit names no invoice, amount or buyer. Add the invoice to check it is the one" : r.binds ? "the invoice you added: its N and supplier key are the exhibit's" : "NOT the invoice you added",
      stamp: r.binds === null ? "" : r.binds ? "認" : "偽",
    },
    { g: "n", what: "Fingerprint N", found: r.signatures.nullifier ?? "", stamp: "", mono: true },
    { g: "key", what: "Supplier key", found: r.signatures.supplier_pk ?? "", stamp: "", mono: true },
  );
  return {
    verdict: r.holds
      ? { glyph: "重", title: "Double signature on the board", text: "The same supplier key registered this fingerprint for two financiers, in this order, and both entries are on the board. Same rule as jitsuin verify --exhibit." }
      : r.board_entries === null
        ? { glyph: "未", title: "Exhibit does not hold here", text: "No board data could be read, so the positions are only claimed." }
        : { glyph: "偽", title: "Exhibit does not hold here", text: "At least one claim fails." },
    kind: "Exhibit A (JTSX)",
    checks,
    keep: { name: "exhibit-a.txt", text: c },
  };
}

/** A sheet whose first check threw: that line fails, the rest is not read, the board is not asked. */
function refusedSheet(kind: "bundle" | "proof" | "exhibit", err: string): Inspection {
  const unread = (g: Glyph, what: string): Check => ({ g, what, found: "not read", stamp: "", unread: true });
  const bundle = kind === "bundle";
  const checks: Check[] = bundle
    ? [
        { g: "seal", what: "Buyer's signature", found: "does not hold for these bytes", stamp: "偽" },
        unread("doc", "Invoice"),
        unread("amount", "Amount"),
        unread("seals3", "Assignment letter"),
        unread("n", "Fingerprint N"),
        unread("board", "Registration"),
        unread("settled", "Settled"),
      ]
    : [
        { g: "seals2", what: "Signatures", found: "do not hold for these bytes", stamp: "偽" },
        unread("board", "Entry ①"),
        unread("board", "Entry ②"),
        unread("n", "Fingerprint N"),
        unread("key", "Supplier key"),
      ];
  return {
    verdict: {
      glyph: "偽",
      title: "Not genuine",
      text: bundle
        ? "The buyer's signature does not hold for the bytes on this sheet, so nothing else in it is read and the board is not asked."
        : "The signatures do not hold for the bytes on this sheet, so nothing else in it is read and the board is not asked.",
      err,
    },
    kind: KIND_NAME[kind],
    checks,
    refused: true,
  };
}

const KIND_NAME: Record<string, string> = {
  bundle: "Verification bundle (JTSB)",
  proof: "Double-signature proof (JTSP)",
  exhibit: "Exhibit A (JTSX)",
  invoice: "Invoice (JTSI)",
  assignment: "Assignment letter (JTSA)",
  seal: "Seal (JTL1)",
  history: "History certificate (JTSH)",
};
const STAMP_WORD: Record<Stamp, string> = { 認: "holds", 偽: "fails", 重: "already registered", 待: "not checked", "": "" };
const HANKO_STATE: Record<Hanko | "拒", Said["v"]> = { 真: "ok", 偽: "bad", 重: "dup", 未: "wait", 拒: "no" };

/** The verdict line beside the big hanko. */
interface Said {
  v: "idle" | "busy" | "ok" | "bad" | "dup" | "wait" | "no";
  glyph: string;
  text: string;
  title?: string;
  err?: string;
  src?: string;
  keep?: { name: string; text: string };
}

const IDLE: Said = { v: "idle", glyph: "閲", text: "Bring a bundle, a proof or an exhibit. Everything is checked in this browser; nothing you hand over leaves it." };
const NO_FILE = `No file: the live ${NET.noun} board is read`;
const NARROW = "(max-width: 860px)";
const magicOf = (v: string) => {
  try {
    return atob(v.slice(0, 8).replace(/-/g, "+").replace(/_/g, "/")).slice(0, 4);
  } catch {
    return "????";
  }
};
/** Restarts a one-shot CSS animation class. */
const replay = (e: Element | null, cls: string) => {
  if (!e || still()) return;
  e.classList.remove(cls);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(cls);
};

export function VerifyPage(): ReactNode {
  const [said, setSaid] = useState<Said>(IDLE);
  const [fileName, setFileName] = useState(NO_FILE);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  const [tag, setTag] = useState<{ magic: string; name: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const code = useRef<HTMLTextAreaElement>(null);
  const invoice = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const slot = useRef<HTMLLabelElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const vd = useRef<HTMLDivElement>(null);
  const board = useRef<BoardApi>(null);
  const loupe = useRef<Loupe | null>(null);
  const last = useRef<{ sheet: Sheet; park: number } | null>(null);
  const runId = useRef(0);

  const speak = (s: Said) => {
    flushSync(() => setSaid(s));
    const t = vd.current?.querySelector(".vf-vd-t") ?? null;
    replay(t, "is-new");
  };

  /** The big hanko lands (snapSettle, from 2.1x), and the bench takes the knock. */
  const slam = async () => {
    const h = vd.current?.querySelector(".vf-hanko");
    if (!h || still()) return;
    window.setTimeout(() => replay(scene.current, "is-slam"), dur.seal - 40);
    await run(h, { scale: [2.1, 1], rotate: [-14, -6], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
  };

  // runs once the page is in <main> (Page draws it through a portal, after this component mounts)
  const ready = () => {
    loupe.current = new Loupe(scene.current!, "The clerk's loupe over the sheet you handed in");
    loupe.current.build(null, matchMedia(NARROW).matches);
    // a settled deal's bundle, carried here by "Check it on Verify" (src/lib/verify-handoff.ts)
    const handed = takeForVerify();
    if (handed) {
      code.current!.value = handed;
      trayUpdate(true);
      speak({ ...IDLE, text: "The settlement bundle is in the in-tray. Hand it to the registry to check it." });
    }
    // The board is on the bench from the start: the live board (or the kept or bundled copy).
    void loadBoard((u, i) => fetch(u, i)).then(
      (b) => {
        setTip(b.tip);
        if (!last.current) board.current?.set(boardRows(b.json, (m) => wasm.boardMemoDescribe(m)), boardLine(b));
      },
      () => undefined,
    );
  };

  // The sheet is laid out for the width: on a change, redraw it at its end state.
  useEffect(() => {
    const mq = matchMedia(NARROW);
    const relayout = () => {
      const l = loupe.current;
      if (!l || l.L.narrow === mq.matches) return;
      const done = last.current;
      l.build(done?.sheet ?? null, mq.matches);
      if (done) l.settle(done.park);
    };
    mq.addEventListener("change", relayout);
    void document.fonts?.ready.then(() => {
      if (loupe.current?.idle) loupe.current.build(null, mq.matches);
    });
    return () => {
      mq.removeEventListener("change", relayout);
      runId.current++;
      loupe.current?.destroy();
    };
  }, []);

  const trayUpdate = (land: boolean) => {
    const v = code.current!.value.trim();
    const k = v ? codeKind(v) : null;
    setTag(v ? (k === "unknown" ? { magic: "????", name: "Not a JitsuinFi code" } : { magic: magicOf(v), name: (KIND_NAME[k!] ?? "").replace(/ \(.*\)$/, "") }) : null);
    if (land && v) replay(slot.current, "is-landing");
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    code.current!.value = (await f.text()).trim();
    trayUpdate(true);
  };

  const sample = async () => {
    try {
      const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`the proof answered ${r.status}`);
      code.current!.value = wasm.exhibitFromProof((await r.text()).trim());
      trayUpdate(true);
    } catch (e) {
      speak({ v: "no", glyph: "拒", text: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Not a bundle, a proof or an exhibit: refused at the counter, the sheet stays blank. */
  const refuse = (text: string) => {
    runId.current++;
    last.current = null;
    replay(slot.current, "is-shake");
    loupe.current!.idle = true;
    loupe.current!.build(null, matchMedia(NARROW).matches);
    board.current?.clear();
    setChecks([]);
    speak({ v: "no", glyph: "拒", title: "Refused at the counter", text });
    void slam();
  };

  const runCheck = async () => {
    const c = code.current!.value.trim();
    const kind = codeKind(c);
    if (kind !== "bundle" && kind !== "proof" && kind !== "exhibit") return refuse("this is not a bundle, a proof or an exhibit");
    const id = ++runId.current;
    const live = () => id === runId.current;
    const l = loupe.current!;
    setBusy(true);
    slot.current?.classList.add("is-out");
    try {
      setChecks([]);
      board.current?.clear();
      speak({ v: "busy", glyph: "待", text: "Under the loupe: the signatures first, then the board." });
      const own = await file.current!.files?.[0]?.text();
      const fetched = own ? undefined : await loadBoard((u, i) => fetch(u, i)).catch(() => undefined);
      const boardJson = own ?? fetched?.json;
      const source = own ? "the file you added" : fetched ? boardLine(fetched) : "no board data";
      let result: Inspection;
      try {
        result = kind === "exhibit" ? inspectExhibit(c, boardJson, invoice.current!.value.trim() || undefined) : kind === "proof" ? inspectProof(c, boardJson) : inspectBundle(c, boardJson);
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        result = refusedSheet(kind, e.message);
      }
      if (!live()) return;
      if (boardJson && !result.refused) board.current?.set(boardRows(boardJson, (m) => wasm.boardMemoDescribe(m)), source);

      // the sheet lands under the loupe, which reads it line by line
      const sheet: Sheet = { kind: result.kind, code: c, rows: result.checks };
      l.idle = false;
      l.build(sheet, matchMedia(NARROW).matches);
      last.current = null;
      await l.land();
      if (!live()) return;
      const L = l.L;
      const readCrossed = (_x: number, y: number) =>
        L.rows.forEach((r, i) => {
          if (!r.stamp && !r.unread && y >= r.y - 4 && y <= r.y + r.h) l.mark(i);
        });
      const xStart = L.narrow ? 80 : 96;
      const xEnd = L.W * (L.narrow ? 0.62 : 0.7);
      let park = 0;
      for (let i = 0; i < L.rows.length; i++) {
        const r = result.checks[i];
        if (!r.stamp || r.unread) continue;
        await l.move(xStart, L.rows[i].cy, 380, ease.softInOut, readCrossed);
        if (!live()) return;
        const hits = r.hit ?? [];
        const scan = (async () => {
          for (const t of hits) await board.current?.find(t);
        })();
        await l.move(xEnd, L.rows[i].cy, 440, ease.glide);
        await scan;
        if (!live()) return;
        l.mark(i);
        park = i;
        await wait(170);
      }
      if (result.refused) {
        for (let i = 1; i < L.rows.length; i++) {
          l.dim(i);
          await wait(40);
        }
      } else if (park < L.rows.length - 1) {
        await l.move(L.W * 0.42, L.rows[L.rows.length - 1].cy, 520, ease.softInOut, readCrossed);
      }
      if (!live()) return;
      L.rows.forEach((r, i) => {
        if (!r.stamp && !r.unread) l.mark(i);
      });
      last.current = { sheet, park };
      // the loupe settles on the last mark it pressed, magnifying it
      void l.move(L.mx - 6, L.rows[park].cy, 560, ease.softInOut);
      setChecks(result.checks);
      speak({
        v: HANKO_STATE[result.verdict.glyph],
        glyph: result.verdict.glyph,
        title: result.verdict.title,
        text: result.verdict.text,
        err: result.verdict.err,
        src: result.refused ? undefined : `Board data: ${source}.`,
        keep: result.keep,
      });
      await slam();
    } catch (e) {
      if (live()) speak({ v: "no", glyph: "拒", text: e instanceof Error ? e.message : String(e) });
    } finally {
      slot.current?.classList.remove("is-out");
      if (live()) setBusy(false);
    }
  };

  return (
    <Page wide>
      <div className="vf-page">
        <section className="vf-cap" aria-labelledby="vf-title">
          <p className="vf-tag">
            <b lang="ja">閲</b>
            Public inspection
          </p>
          <h1 id="vf-title">Verify</h1>
          <p className="vf-lede">
            Hand the registry what you were given: a deal bundle, a double-signature proof or Exhibit A. It is checked here, with the same code as <code>jitsuin verify</code>.
          </p>
          <p className="vf-kinds-k">What you can hand in</p>
          <ul className="vf-kinds">
            <li>
              <span className="vf-code">JTSB</span>
              <div>
                <strong>A deal bundle</strong>
                <span>The invoice, its letter and its seals: is it genuine, registered once, settled?</span>
              </div>
            </li>
            <li>
              <span className="vf-code">JTSP</span>
              <div>
                <strong>A double-signature proof</strong>
                <span>One invoice signed for two financiers, and where each entry sits on the board.</span>
              </div>
            </li>
            <li>
              <span className="vf-code">JTSX</span>
              <div>
                <strong>Exhibit A</strong>
                <span>The double signature without the deal. Add the invoice if you hold it.</span>
              </div>
            </li>
          </ul>
          <div className="vf-facts">
            <span className="vf-big">{tip ?? "…"}</span>
            <span className="vf-lbl">{`the ${NET.noun} block this board is read up to`}</span>
            <span className="vf-line">Nothing you hand over leaves this browser.</span>
          </div>
        </section>

        <section className="vf-work" aria-label="The registry's public inspection window">
          <form className="vf-tray" aria-label="In-tray: what you hand to the registry" onSubmit={(e) => e.preventDefault()}>
            <p className="vf-tray-k">
              <span>
                <b lang="ja">受付</b>In-tray
              </span>
            </p>
            <label
              className={`vf-slot is-main${tag ? " is-sheet" : ""}${drag ? " is-drag" : ""}`}
              ref={slot}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => void onDrop(e)}
            >
              <span className="vf-slot-k">
                <b lang="ja">提出書類</b>What you were given
              </span>
              <span className="vf-well">
                {tag ? (
                  <span className="vf-slot-kind" aria-hidden="true">
                    <i>{tag.magic}</i>
                    {tag.name}
                  </span>
                ) : null}
                <textarea
                  spellCheck="false"
                  rows={6}
                  placeholder="JTSB…, JTSP… or JTSX…: paste what you were given"
                  ref={code}
                  onInput={() => trayUpdate(false)}
                  onPaste={() => window.setTimeout(() => trayUpdate(true))}
                />
              </span>
              <small>A bundle (JTSB), a double-signature proof (JTSP) or Exhibit A (JTSX). Paste it, or drop the file on the tray.</small>
            </label>
            <label className="vf-slot is-small">
              <span className="vf-slot-k">
                <b lang="ja">請求書</b>The invoice (optional)
              </span>
              <span className="vf-well">
                <textarea spellCheck="false" rows={2} placeholder="JTSI…, only for an exhibit, if you hold the invoice" ref={invoice} />
              </span>
            </label>
            <label className="vf-env">
              <span className="vf-slot-k">
                <b lang="ja">登記簿</b>A board file (optional: without one, the live board is read)
              </span>
              <span className="vf-env-row">
                <input type="file" accept=".json,application/json" ref={file} onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? NO_FILE)} />
                <span className="vf-env-btn">Add a file</span>
                <span className="vf-env-name">{fileName}</span>
              </span>
            </label>
            <div className="vf-act">
              <button type="button" className="vf-go" disabled={busy} onClick={() => void runCheck()}>
                <span>Hand it to the registry</span>
              </button>
              <button type="button" className="vf-link" onClick={() => void sample()}>
                {`Use ${KIT.case}'s Exhibit A`}
              </button>
            </div>
          </form>

          <div className="vf-bench">
            <div className="vf-scene-host" ref={scene} />
            <ol className="vf-sr" aria-live="polite">
              {checks.map((c, i) => (
                <li key={i}>{`${c.what}: ${c.found}${c.stamp ? ` (${STAMP_WORD[c.stamp]})` : ""}`}</li>
              ))}
            </ol>
            <div className="vf-vd" data-v={said.v} aria-live="polite" ref={vd}>
              <span className="vf-hanko" aria-hidden="true">
                <span lang="ja">{said.glyph}</span>
              </span>
              <div className="vf-vd-t">
                {said.title ? <strong className="vf-vd-title">{said.title}</strong> : null}
                <p className="vf-vd-text">{said.text}</p>
                {said.err ? <p className="vf-vd-err">{said.err}</p> : null}
                {said.src ? <p className="vf-vd-src">{said.src}</p> : null}
                {said.keep ? (
                  <button type="button" className="vf-link" onClick={() => download(said.keep!.name, said.keep!.text)}>
                    {`Keep it (${said.keep.name})`}
                  </button>
                ) : null}
              </div>
            </div>
            <BoardStrip api={board} />
          </div>
        </section>
        <Mounted then={ready} />
      </div>
      <NextRoom from="verify" />
    </Page>
  );
}
