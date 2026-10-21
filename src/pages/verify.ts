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
import { loupe as hairlineLoupe } from "@lucasmarkes/hairline";
import { bundleVerdict, letterStatus } from "../lib/bundle-verdict";
import { codeKind, daysToDate, json, wasm, zatToZec } from "../lib/core";
import { boardLine, loadBoard } from "../lib/board";
import { download, h } from "../lib/ui";
import { KIT } from "../lib/kit";
import { dur, ease, run, still } from "./try/anim";
import { entriesOf, registry } from "./try/registry";
import "./try.css";
import "./verify.css";

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

function slip(cls: string, jp: string, en: string, field: HTMLElement, note?: string): HTMLElement {
  return h("label", { class: `vf-slip ${cls}` }, h("span", { class: "vf-slip-k" }, h("b", { lang: "ja" }, jp), en), field, note ? h("small", {}, note) : null);
}

export function verifyPage(): HTMLElement {
  // ---------- the visitor's side: what they were given, laid on the counter ----------
  const code = h("textarea", { spellcheck: "false", rows: "6", placeholder: "JTSB…, JTSP… or JTSX…: paste what you were given" }) as HTMLTextAreaElement;
  const invoice = h("textarea", { spellcheck: "false", rows: "2", placeholder: "JTSI…, only for an exhibit, if you hold the invoice" }) as HTMLTextAreaElement;
  const file = h("input", { type: "file", accept: ".json,application/json" }) as HTMLInputElement;
  const fileName = h("span", { class: "vf-env-name" }, "No file: the live testnet board is read");
  file.addEventListener("change", () => (fileName.textContent = file.files?.[0]?.name ?? "No file: the live testnet board is read"));
  const sample = h("button", { type: "button", class: "ink-link" }, `Use ${KIT.case}'s Exhibit A`) as HTMLButtonElement;
  sample.addEventListener("click", async () => {
    try {
      const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`the proof answered ${r.status}`);
      code.value = wasm.exhibitFromProof((await r.text()).trim());
      code.dispatchEvent(new Event("input"));
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    }
  });
  const go = h("button", { type: "button", class: "seal-btn" }, h("span", {}, "Hand it to the registry")) as HTMLButtonElement;
  const desk = h(
    "div",
    { class: "ct-desk vf-desk" },
    slip("is-main", "提出書類", "What you were given", code, "A bundle (JTSB), a double-signature proof (JTSP) or Exhibit A (JTSX)."),
    slip("is-small", "請求書", "The invoice (optional)", invoice),
    h("label", { class: "vf-env" }, h("span", { class: "vf-env-flap", "aria-hidden": "true" }), h("span", { class: "vf-slip-k" }, h("b", { lang: "ja" }, "登記簿"), "Board data (optional)"), file, fileName),
    h("div", { class: "ct-act" }, go, sample),
  );

  // ---------- the registry's side: the clerk's loupe, then the certificate ----------
  const say = h("p", { class: "ct-say", "aria-live": "polite" });
  const speak = (glyph: string, text: string) => say.replaceChildren(h("span", { class: "hanko", lang: "ja" }, glyph), h("span", {}, text));
  speak("閲", "Bring a bundle, a proof or an exhibit. Everything is checked in this browser; nothing you hand over leaves it.");
  const fig = h("div", { class: "vf-fig" });
  const book = registry();
  book.el.classList.add("vf-book");
  const cert = h("article", { class: "vf-cert", "aria-live": "polite", hidden: true });
  const room = h("div", { class: "ct-room vf-room" }, h("div", { class: "ct-light", "aria-hidden": "true" }, h("span", { class: "ct-cone" })), h("span", { class: "ct-lamp", "aria-hidden": "true" }, h("i")), book.el, fig, cert, say);
  const windowEl = h(
    "div",
    { class: "ct-window" },
    h("p", { class: "ct-plaque" }, h("span", { lang: "ja" }, "閲覧所"), h("small", {}, "Public inspection")),
    room,
    h("span", { class: "ct-grille", "aria-hidden": "true" }),
    h("span", { class: "ct-slot", "aria-hidden": "true" }),
  );
  const scene = h("section", { class: "ct vf", "aria-label": "The registry's public inspection window" }, desk, windowEl);

  // The registry is on the clerk's desk from the start: the live board (or the bundled copy).
  void loadBoard((u, i) => fetch(u, i)).then(
    (b) => book.set(entriesOf(b.json, (m) => wasm.boardMemoDescribe(m)), boardLine(b)),
    () => undefined,
  );
  let figure: { destroy(): void } | null = null;
  requestAnimationFrame(() => {
    figure = hairlineLoupe(fig, { intensity: 0.7, play: true, label: "The registry clerk's loupe over a blank ruled sheet" });
  });

  const certify = (ins: Inspection) => {
    const rows = ins.checks.map((c) =>
      h("li", { class: c.stamp ? `is-${{ 認: "ok", 偽: "bad", 重: "bad", 待: "wait", "": "" }[c.stamp]}` : undefined }, h("span", { class: "vf-what" }, c.what), h("span", { class: c.mono ? "vf-found is-mono" : "vf-found" }, c.found), h("span", { class: "vf-stamp", lang: "ja", "aria-label": c.stamp ? { 認: "holds", 偽: "fails", 重: "already registered", 待: "not checked", "": "" }[c.stamp] : undefined }, c.stamp)),
    );
    const keep = ins.keep ? h("button", { type: "button", class: "ink-link" }, `Keep it (${ins.keep.name})`) : null;
    if (keep && ins.keep) {
      const k = ins.keep;
      keep.addEventListener("click", () => download(k.name, k.text));
    }
    cert.replaceChildren(
      ...([
      h("header", {}, h("p", { class: "vf-cert-t", lang: "ja" }, "検 査 証"), h("p", { class: "vf-cert-kind" }, `Inspection certificate · ${ins.kind}`)),
      h("p", { class: "vf-cert-v" }, h("strong", {}, ins.verdict.title), ins.verdict.text),
      h("ol", { class: "vf-checks" }, ...rows),
      keep,
      ins.verdict.glyph ? h("span", { class: "vf-hanko", lang: "ja", "aria-hidden": "true" }, ins.verdict.glyph) : null,
      ].filter((n): n is HTMLElement => n !== null)),
    );
  };

  const runCheck = async () => {
    go.disabled = true;
    try {
      const c = code.value.trim();
      const kind = codeKind(c);
      if (kind !== "bundle" && kind !== "proof" && kind !== "exhibit") throw new Error("this is not a bundle, a proof or an exhibit");
      speak("待", "Under the loupe: the signatures first, then the board.");
      const own = await file.files?.[0]?.text();
      const live = own ? undefined : await loadBoard((u, i) => fetch(u, i)).catch(() => undefined);
      const boardJson = own ?? live?.json;
      const source = own ? "the file you added" : live ? boardLine(live) : "no board data";
      const ins = kind === "exhibit" ? inspectExhibit(c, boardJson, invoice.value.trim() || undefined) : kind === "proof" ? inspectProof(c, boardJson) : inspectBundle(c, boardJson);
      figure?.destroy();
      figure = null;
      room.classList.add("is-done");
      if (boardJson) {
        book.set(entriesOf(boardJson, (m) => wasm.boardMemoDescribe(m)), source);
        if (ins.claims[0]) {
          await book.find(ins.claims[0]);
          for (const t of ins.claims.slice(1)) book.mark(t);
        }
      }
      certify(ins);
      cert.hidden = false;
      await run(cert, { y: [60, 0], rotate: [-4, -1], opacity: [0, 1], duration: dur.enter + 100 });
      const hanko = cert.querySelector(".vf-hanko");
      if (hanko && !still()) await run(hanko, { scale: [2, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
      speak(ins.verdict.glyph || "認", `${ins.verdict.title}. Board data: ${source}.`);
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      go.disabled = false;
    }
  };
  go.addEventListener("click", runCheck);

  return h(
    "div",
    { class: "try vf-page", "data-wide": "true" },
    h(
      "header",
      { class: "try-head" },
      h("p", { class: "try-case" }, h("span", { lang: "ja" }, "閲"), "Public inspection"),
      h("h1", {}, "Verify"),
      h("p", {}, "Hand the registry what you were given: a deal bundle, a double-signature proof or Exhibit A. It is checked here, with the same code as jitsuin verify."),
    ),
    scene,
  );
}
