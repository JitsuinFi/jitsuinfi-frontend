// Verify screen for auditors and judges (HNK-07.T2 crucial, HNK-07.T3 "caught" view): checks a
// bundle or a double-signature proof in the browser, offline or against board data.
// Proofs (HNK-28.T2): with board data, every position the proof claims is checked by the same
// rule as `jitsuin verify` (wasm `verifyProofOnBoard`); without it, positions are shown as
// claimed only, never as facts.
//
// The stage (HNK-30.T14, MASTER.md §8): the registry's public inspection window 閲覧所, in the
// same 登記所 as #/try. The visitor's side is the counter top, where what they were given is
// laid out as slips; the registry's side is the room behind the glass. The clerk's loupe (the
// hairline figure) waits over a blank sheet; the result comes back as an inspection certificate
// 検査証, one stamp per check, and the registry book opens at the entries the document claims.
// React since HNK-31.T6.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { loupe as hairlineLoupe } from "@lucasmarkes/hairline";
import { Mounted, Page } from "../app/AppShell";
import { boardLine, loadBoard } from "../lib/board";
import { bundleVerdict, letterStatus } from "../lib/bundle-verdict";
import { codeKind, daysToDate, json, wasm, zatToZec } from "../lib/core";
import { KIT } from "../lib/kit";
import { NET } from "../lib/network";
import { download } from "../lib/ui";
import { dur, ease, run, still } from "./try/anim";
import { entriesOf, Registry, type RegistryApi } from "./try/Registry";
// try.css and verify.css load with the app shell (src/app/legacy-main.ts), in their old cascade

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

/** One line of the certificate: what was checked, what was found, and its stamp. */
type Stamp = "認" | "偽" | "重" | "待" | "";
interface Check {
  what: string;
  found: string;
  stamp: Stamp;
  mono?: boolean;
}
interface Inspection {
  /** The big hanko on the certificate and its words. */
  verdict: { glyph: Stamp; title: string; text: string };
  kind: string;
  checks: Check[];
  /** Board entries the document claims, to open the registry at. */
  claims: string[];
  keep?: { name: string; text: string };
}

const at = (a: At) => `block ${a.height}, tx ${a.tx_index ?? "?"}`;
const claimLine = (c: { claimed_at: At | null; on_board: boolean | null }, none: string): [string, Stamp] =>
  !c.claimed_at ? [none, ""] : c.on_board === null ? [`claimed: ${at(c.claimed_at)}; no board data`, "待"] : c.on_board ? [`on the board at ${at(c.claimed_at)}`, "認"] : [`NOT on the board at ${at(c.claimed_at)}`, "偽"];

function inspectBundle(c: string, boardJson?: string): Inspection {
  const v = json<{ nullifier: string; invoice_id: string; amount_zat: number; due_date: number; assignment: string | null }>(wasm.verifyBundle(c));
  const verdict = bundleVerdict(v.assignment);
  const checks: Check[] = [
    { what: "Buyer's signature", found: "holds for these exact invoice bytes", stamp: "認" },
    { what: "Invoice", found: v.invoice_id, stamp: "" },
    { what: "Amount", found: `${zatToZec(v.amount_zat)} ZEC, due ${daysToDate(v.due_date)}`, stamp: "" },
    { what: "Assignment letter", found: letterStatus(v.assignment), stamp: v.assignment === null ? "" : v.assignment === "Sealed" ? "認" : "待" },
    { what: "Fingerprint N", found: v.nullifier, stamp: "", mono: true },
  ];
  const claims: string[] = [];
  let glyph: Stamp = verdict.kind === "ok" ? "認" : "待";
  let title = verdict.title;
  let text = verdict.text;
  if (boardJson) {
    const b = json<{ register: { status: string; txid?: string; conflicting?: string[] }; settled: { txid: string; on_time: boolean } | null }>(wasm.bundleOnBoard(c, boardJson));
    const reg = b.register;
    if (reg.txid) claims.push(reg.txid);
    if (reg.status === "DoubleFinanced") {
      checks.push({ what: "Registration", found: `registered for ${1 + (reg.conflicting?.length ?? 0)} financiers`, stamp: "重" });
      glyph = "重";
      title = "Double financing on the board";
      text = "The supplier registered this invoice for more than one financier.";
    } else if (reg.status === "Registered") {
      checks.push({ what: "Registration", found: `once, entry ${reg.txid?.slice(0, 16)}…`, stamp: "認" });
    } else {
      checks.push({ what: "Registration", found: "no register entry for this invoice", stamp: "待" });
    }
    checks.push({ what: "Settled", found: b.settled ? `yes, ${b.settled.on_time ? "on time" : "late"}` : "no", stamp: b.settled ? "認" : "" });
    if (b.settled) claims.push(b.settled.txid);
  }
  return { verdict: { glyph, title, text }, kind: "Verification bundle (JTSB)", checks, claims };
}

function inspectProof(c: string, boardJson?: string): Inspection {
  const p = json<{ nullifier: string; supplier_pk: string; first_commitment: string; second_commitment: string; first_at: At | null; second_at: At | null }>(wasm.verifyProof(c));
  const keep = { name: "double-signature.proof.txt", text: c };
  const keys: Check[] = [
    { what: "Fingerprint N", found: p.nullifier, stamp: "", mono: true },
    { what: "Supplier key", found: p.supplier_pk, stamp: "", mono: true },
  ];
  if (!boardJson) {
    return {
      verdict: p.first_at
        ? { glyph: "待", title: "Signatures check out; board not checked", text: "The supplier signed this invoice for two different financiers. Add board data to check the positions the proof claims." }
        : { glyph: "偽", title: "Proof does not hold", text: "It gives no board position for the first entry, so nobody can check that this financier registered first." },
      kind: "Double-signature proof (JTSP)",
      checks: [{ what: "Signatures", found: "the supplier signed N for two financiers", stamp: "認" }, ...keys],
      claims: [],
      keep,
    };
  }
  const r = json<ProofOnBoard>(wasm.verifyProofOnBoard(c, boardJson));
  const [f1, s1] = claimLine(r.first, "NO position given: the proof cannot be checked");
  const [f2, s2] = claimLine(r.second, "offered privately, never posted");
  const checks: Check[] = [
    { what: "Signatures", found: r.signatures.ok ? `the buyer signed invoice ${r.signatures.invoice_id}; the supplier signed it for 2 financiers` : `do not check out: ${r.signatures.error}`, stamp: r.signatures.ok ? "認" : "偽" },
    { what: "Entry ①", found: f1, stamp: s1 || "偽" },
    { what: "Entry ②", found: f2, stamp: s2 },
    ...keys,
  ];
  if (r.ordered !== null) checks.splice(3, 0, { what: "Order", found: r.ordered ? "① came before ②" : "① is NOT before ②", stamp: r.ordered ? "認" : "偽" });
  return {
    verdict: r.holds
      ? { glyph: "重", title: "Double financing proven", text: "Two registrations of one invoice for two financiers, both signed with the supplier's key, and every position the proof claims is on the board. Same rule as jitsuin verify." }
      : { glyph: "偽", title: "Proof does not hold", text: "At least one claim fails against this board data." },
    kind: "Double-signature proof (JTSP)",
    checks,
    claims: [r.first.claimed_at?.txid, r.second.claimed_at?.txid].filter((x): x is string => !!x),
    keep,
  };
}

/** Exhibit A (HNK-30.T5, D-44): the double signature without the deal; the invoice is optional. */
function inspectExhibit(c: string, boardJson: string | undefined, invoice: string | undefined): Inspection {
  const r = json<ExhibitOnBoard>(wasm.verifyExhibitOnBoard(c, boardJson ?? null, invoice ?? null));
  const [f1, s1] = claimLine(r.first, "NO position given: the exhibit cannot be checked");
  const [f2, s2] = claimLine(r.second, "offered privately to the financier that caught it, never posted");
  const checks: Check[] = [
    { what: "Signatures", found: r.signatures.ok ? "one key signed this fingerprint for 2 different financiers" : `do not check out: ${r.signatures.error}`, stamp: r.signatures.ok ? "認" : "偽" },
    { what: "Entry ①", found: f1, stamp: s1 || "偽" },
    { what: "Entry ②", found: f2, stamp: s2 },
  ];
  if (r.ordered !== null) checks.push({ what: "Order", found: r.ordered ? "① came before ②" : "① is NOT before ②", stamp: r.ordered ? "認" : "偽" });
  checks.push(
    {
      what: "Which invoice",
      found: r.binds === null ? "not stated: the exhibit names no invoice, amount or buyer. Add the invoice to check it is the one" : r.binds ? "the invoice you added: its N and supplier key are the exhibit's" : "NOT the invoice you added",
      stamp: r.binds === null ? "" : r.binds ? "認" : "偽",
    },
    { what: "Fingerprint N", found: r.signatures.nullifier ?? "", stamp: "", mono: true },
    { what: "Supplier key", found: r.signatures.supplier_pk ?? "", stamp: "", mono: true },
  );
  return {
    verdict: r.holds
      ? { glyph: "重", title: "Double signature on the board", text: "The same supplier key registered this fingerprint for two financiers, in this order, and both entries are on the board. Same rule as jitsuin verify --exhibit." }
      : { glyph: "待", title: "Exhibit does not hold here", text: r.board_entries === null ? "No board data could be read, so the positions are only claimed." : "At least one claim fails." },
    kind: "Exhibit A (JTSX)",
    checks,
    claims: [r.first.claimed_at?.txid, r.second.claimed_at?.txid].filter((x): x is string => !!x),
    keep: { name: "exhibit-a.txt", text: c },
  };
}

const STAMP_CLASS: Record<Stamp, string> = { 認: "ok", 偽: "bad", 重: "bad", 待: "wait", "": "" };
const STAMP_WORD: Record<Stamp, string> = { 認: "holds", 偽: "fails", 重: "already registered", 待: "not checked", "": "" };

function Slip({ cls, jp, en, note, children }: { cls: string; jp: string; en: string; note?: string; children: ReactNode }): ReactNode {
  return (
    <label className={`vf-slip ${cls}`}>
      <span className="vf-slip-k">
        <b lang="ja">{jp}</b>
        {en}
      </span>
      {children}
      {note ? <small>{note}</small> : null}
    </label>
  );
}

/** The inspection certificate 検査証: one stamp per check, the big hanko for the verdict. */
function Certificate({ ins, cert }: { ins: Inspection | null; cert: RefObject<HTMLElement | null> }): ReactNode {
  return (
    <article className="vf-cert" aria-live="polite" hidden={!ins} ref={cert}>
      {ins ? (
        <>
          <header>
            <p className="vf-cert-t" lang="ja">
              検 査 証
            </p>
            <p className="vf-cert-kind">{`Inspection certificate · ${ins.kind}`}</p>
          </header>
          <p className="vf-cert-v">
            <strong>{ins.verdict.title}</strong>
            {ins.verdict.text}
          </p>
          <ol className="vf-checks">
            {ins.checks.map((c, i) => (
              <li key={i} className={c.stamp ? `is-${STAMP_CLASS[c.stamp]}` : undefined}>
                <span className="vf-what">{c.what}</span>
                <span className={c.mono ? "vf-found is-mono" : "vf-found"}>{c.found}</span>
                <span className="vf-stamp" lang="ja" aria-label={c.stamp ? STAMP_WORD[c.stamp] : undefined}>
                  {c.stamp}
                </span>
              </li>
            ))}
          </ol>
          {ins.keep ? (
            <button type="button" className="ink-link" onClick={() => download(ins.keep!.name, ins.keep!.text)}>
              {`Keep it (${ins.keep.name})`}
            </button>
          ) : null}
          {ins.verdict.glyph ? (
            <span className="vf-hanko" lang="ja" aria-hidden="true">
              {ins.verdict.glyph}
            </span>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

const NO_FILE = `No file: the live ${NET.noun} board is read`;

export function VerifyPage(): ReactNode {
  const [said, setSaid] = useState({ glyph: "閲", text: "Bring a bundle, a proof or an exhibit. Everything is checked in this browser; nothing you hand over leaves it." });
  const [fileName, setFileName] = useState(NO_FILE);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [ins, setIns] = useState<Inspection | null>(null);
  const code = useRef<HTMLTextAreaElement>(null);
  const invoice = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const fig = useRef<HTMLDivElement>(null);
  const cert = useRef<HTMLElement>(null);
  const book = useRef<RegistryApi>(null);
  const figure = useRef<{ destroy(): void } | null>(null);

  const speak = (glyph: string, text: string) => flushSync(() => setSaid({ glyph, text }));

  // runs once the stage is in <main> (Page draws it through a portal, after this component mounts)
  const ready = () => {
    // The registry is on the clerk's desk from the start: the live board (or the bundled copy).
    void loadBoard((u, i) => fetch(u, i)).then(
      (b) => book.current!.set(entriesOf(b.json, (m) => wasm.boardMemoDescribe(m)), boardLine(b)),
      () => undefined,
    );
    requestAnimationFrame(() => {
      if (fig.current) figure.current = hairlineLoupe(fig.current, { intensity: 0.7, play: true, label: "The registry clerk's loupe over a blank ruled sheet" });
    });
  };
  useEffect(() => () => figure.current?.destroy(), []);

  const sample = async () => {
    try {
      const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`the proof answered ${r.status}`);
      code.current!.value = wasm.exhibitFromProof((await r.text()).trim());
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    }
  };

  const runCheck = async () => {
    setBusy(true);
    try {
      const c = code.current!.value.trim();
      const kind = codeKind(c);
      if (kind !== "bundle" && kind !== "proof" && kind !== "exhibit") throw new Error("this is not a bundle, a proof or an exhibit");
      speak("待", "Under the loupe: the signatures first, then the board.");
      const own = await file.current!.files?.[0]?.text();
      const live = own ? undefined : await loadBoard((u, i) => fetch(u, i)).catch(() => undefined);
      const boardJson = own ?? live?.json;
      const source = own ? "the file you added" : live ? boardLine(live) : "no board data";
      const result = kind === "exhibit" ? inspectExhibit(c, boardJson, invoice.current!.value.trim() || undefined) : kind === "proof" ? inspectProof(c, boardJson) : inspectBundle(c, boardJson);
      figure.current?.destroy();
      figure.current = null;
      flushSync(() => setDone(true));
      if (boardJson) {
        book.current!.set(entriesOf(boardJson, (m) => wasm.boardMemoDescribe(m)), source);
        if (result.claims[0]) {
          await book.current!.find(result.claims[0]);
          for (const t of result.claims.slice(1)) book.current!.mark(t);
        }
      }
      flushSync(() => setIns(result));
      await run(cert.current!, { y: [60, 0], rotate: [-4, -1], opacity: [0, 1], duration: dur.enter + 100 });
      const hanko = cert.current!.querySelector(".vf-hanko");
      if (hanko && !still()) await run(hanko, { scale: [2, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
      speak(result.verdict.glyph || "認", `${result.verdict.title}. Board data: ${source}.`);
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page wide>
      <div className="try vf-page" data-wide="true">
        <header className="try-head">
          <p className="try-case">
            <span lang="ja">閲</span>
            Public inspection
          </p>
          <h1>Verify</h1>
          <p>Hand the registry what you were given: a deal bundle, a double-signature proof or Exhibit A. It is checked here, with the same code as jitsuin verify.</p>
        </header>
        <section className="ct vf" aria-label="The registry's public inspection window">
          {/* the visitor's side: what they were given, laid on the counter */}
          <div className="ct-desk vf-desk">
            <Slip cls="is-main" jp="提出書類" en="What you were given" note="A bundle (JTSB), a double-signature proof (JTSP) or Exhibit A (JTSX).">
              <textarea spellCheck="false" rows={6} placeholder="JTSB…, JTSP… or JTSX…: paste what you were given" ref={code} />
            </Slip>
            <Slip cls="is-small" jp="請求書" en="The invoice (optional)">
              <textarea spellCheck="false" rows={2} placeholder="JTSI…, only for an exhibit, if you hold the invoice" ref={invoice} />
            </Slip>
            <label className="vf-env">
              <span className="vf-env-flap" aria-hidden="true" />
              <span className="vf-slip-k">
                <b lang="ja">登記簿</b>
                Board data (optional)
              </span>
              <input type="file" accept=".json,application/json" ref={file} onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? NO_FILE)} />
              <span className="vf-env-name">{fileName}</span>
            </label>
            <div className="ct-act">
              <button type="button" className="seal-btn" disabled={busy} onClick={() => void runCheck()}>
                <span>Hand it to the registry</span>
              </button>
              <button type="button" className="ink-link" onClick={() => void sample()}>
                {`Use ${KIT.case}'s Exhibit A`}
              </button>
            </div>
          </div>
          {/* the registry's side: the clerk's loupe, then the certificate */}
          <div className="ct-window">
            <p className="ct-plaque">
              <span lang="ja">閲覧所</span>
              <small>Public inspection</small>
            </p>
            <div className={`ct-room vf-room${done ? " is-done" : ""}`}>
              <div className="ct-light" aria-hidden="true">
                <span className="ct-cone" />
              </div>
              <span className="ct-lamp" aria-hidden="true">
                <i />
              </span>
              <Registry api={book} className="vf-book" />
              <div className="vf-fig" ref={fig} />
              <Certificate ins={ins} cert={cert} />
              <p className="ct-say" aria-live="polite">
                <span className="hanko" lang="ja">
                  {said.glyph}
                </span>
                <span>{said.text}</span>
              </p>
            </div>
            <span className="ct-grille" aria-hidden="true" />
            <span className="ct-slot" aria-hidden="true" />
          </div>
        </section>
        <Mounted then={ready} />
      </div>
    </Page>
  );
}

