// "Try to double-finance" (HNK-30.T3 – T4, M-02 sealed invoice kit, M-01 two exits, D-40): the
// judge plays the supplier of Case File #0417 and offers an invoice that financier A already
// registered on the testnet board to financier B, as it is or changed in any field. Every try
// ends at one of two exits: 偽 (the buyer's seal does not hold for the bytes) or 重 (the board
// already holds the invoice's fingerprint). Nothing to install, no wallet, nothing recorded: the
// checks run in this browser with the same code as the node and `jitsuin verify`, against the
// live board scanned by the financier node (or a bundled copy when the node does not answer).
//
// Visual pass (HNK-30.T13, FE-M0): the page is an evidence desk. The invoice is a paper sheet
// with the buyer's jitsuin pressed on it; every edit is typed onto the sheet and the seal cracks
// the moment the bytes differ from what the buyer signed. Its fingerprint N is drawn as a print
// (the landing's print view) and redrawn on every change. The board is the deep pool beside it,
// one ledger slip per real entry. Offering to financier B runs the real check, sweeps the board
// and slams a hanko: 偽 on the sheet, or 重 on the slip a seal-red thread ties N to.
import { animate, stagger } from "animejs";
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { checkOffer, encodeEdited, KIT, type InvoiceFields } from "../lib/kit";
import { dateToDays, daysToDate, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { h, kv } from "../lib/ui";
import { createPrintView } from "../landing/print";
import { dur, ease } from "../landing/motion";
import { exhibitView } from "./verify";
import "./try.css";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-6)}`;
const fn = (f: (t: number) => number) => () => f;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const LABEL: Record<string, string> = { invoice_id: "number", amount_zat: "amount", issue_date: "issue date", due_date: "due date", terms_hash: "terms" };

interface Decoded extends InvoiceFields {
  nullifier: string;
}

interface Slip {
  txid: string;
  height: number;
  tx_index: number;
  n: string;
  kind: string;
  el: HTMLElement;
}

let boardCache: Promise<BoardData> | null = null;
function board(): Promise<BoardData> {
  boardCache ??= loadBoard((u, i) => fetch(u, i)).catch((e) => {
    boardCache = null;
    throw e;
  });
  return boardCache;
}

/** A field typed onto the invoice sheet: a label and an underlined value, no box. */
function line(label: string, value: string, opts: { type?: string; mono?: boolean; wide?: boolean } = {}) {
  const input = h("input", { type: opts.type ?? "text", spellcheck: "false", autocomplete: "off", class: opts.mono ? "is-mono" : undefined, "aria-label": label }) as HTMLInputElement;
  input.value = value;
  const el = h("label", { class: `inv-line${opts.wide ? " is-wide" : ""}` }, h("span", {}, label), input);
  return { el, input };
}

/** The buyer's jitsuin on the sheet: whole while the bytes are the signed ones, cracked otherwise. */
function sealMark(): HTMLElement {
  return h(
    "div",
    { class: "inv-seal", "aria-hidden": "true" },
    h("span", { class: "inv-seal-ring" }),
    h("span", { class: "inv-seal-glyph" }, "買"),
    h("span", { class: "inv-seal-crack" }),
  );
}

/** A hanko slammed over `host` (snapSettle with a squash), with its words beside it. */
function slam(host: HTMLElement, glyph: string, title: string): void {
  host.querySelector(".slam")?.remove();
  const s = h("div", { class: "slam", "aria-hidden": "true" }, h("span", { class: "slam-glyph" }, glyph), h("span", { class: "slam-word" }, title));
  host.append(s);
  if (still()) return;
  animate(s, {
    scale: [{ from: 2.1, to: 0.94, duration: dur.seal, ease: fn(ease.snapSettle) }, { to: 1, duration: 140, ease: fn(ease.softLand) }],
    rotate: { from: -18, to: -8, duration: dur.seal, ease: fn(ease.snapSettle) },
    opacity: { from: 0, to: 1, duration: 120 },
  });
  animate(host, { translateX: [{ to: -5, duration: 50 }, { to: 4, duration: 50 }, { to: 0, duration: 80 }], delay: dur.seal - 60 });
}

export function tryPage(autoplay = false): HTMLElement {
  const orig = json<Decoded>(wasm.invoiceDecode(KIT.invoice));
  const at = KIT.financierA;
  const root = h("div", { class: "try", "data-wide": "true" });

  // ---------- the invoice sheet ----------
  const id = line("Invoice no.", orig.invoice_id, { wide: true });
  const amount = line("Amount (ZEC)", zatToZec(orig.amount_zat));
  const issued = line("Issued", daysToDate(orig.issue_date), { type: "date" });
  const due = line("Due", daysToDate(orig.due_date), { type: "date" });
  const terms = line("Terms (SHA-256 of the PDF)", orig.terms_hash, { mono: true, wide: true });
  const inputs = [id.input, amount.input, issued.input, due.input, terms.input];
  const seal = sealMark();
  const sealNote = h("p", { class: "inv-seal-note" }, "Buyer's seal over these exact bytes");
  const reset = h("button", { type: "button", class: "ink-link" }, "Put back the original") as HTMLButtonElement;
  const sheet = h(
    "article",
    { class: "inv-sheet", "aria-label": "The invoice" },
    h("div", { class: "inv-clip", "aria-hidden": "true" }),
    h("div", { class: "inv-tag", "aria-hidden": "true" }, h("span", {}, "Exhibit"), h("strong", {}, "0417")),
    h("p", { class: "inv-from" }, KIT.supplier),
    h("h2", { class: "inv-title" }, "Invoice"),
    h("div", { class: "inv-grid" }, id.el, amount.el, issued.el, due.el, terms.el),
    h("div", { class: "inv-foot" }, h("div", { class: "inv-buyer" }, h("span", {}, "Buyer key"), h("code", {}, short(orig.buyer_pk))), seal),
    sealNote,
    reset,
  );

  // ---------- the fingerprint and the board ----------
  const print = createPrintView();
  const nLine = h("p", { class: "n-line" }, h("span", {}, "N"), h("code", {}, orig.nullifier));
  const thread = h("div", { class: "thread", "aria-hidden": "true" });
  const slips = h("ol", { class: "slips", "aria-label": "Board entries" });
  const boardNote = h("p", { class: "pool-note" }, "Reading the board…");
  const pool = h(
    "section",
    { class: "pool", "aria-label": "The public board" },
    h("div", { class: "pool-head" }, h("span", { class: "pool-kanji", "aria-hidden": "true" }, "登記"), h("div", {}, h("h2", {}, "The board"), h("p", {}, "Fingerprints and commitments only. No names, no amounts."))),
    slips,
    boardNote,
  );
  let slipList: Slip[] = [];
  void board().then(
    (b) => {
      const entries = JSON.parse(b.json) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
      slipList = entries.flatMap((e) => {
        try {
          const d = json<{ kind: string; nullifier: string }>(wasm.boardMemoDescribe(e.memo));
          const mine = e.txid === at.txid;
          const el = h(
            "li",
            { class: `slip${mine ? " is-a" : ""}` },
            h("span", { class: "slip-h" }, String(e.height)),
            h("code", {}, short(d.nullifier)),
            h("span", { class: "slip-k" }, mine ? "financier A" : d.kind === "RegisterWithHistory" ? "with history" : d.kind.toLowerCase()),
          );
          return [{ txid: e.txid, height: e.height, tx_index: e.tx_index, n: d.nullifier, kind: d.kind, el }];
        } catch {
          return [];
        }
      });
      slips.replaceChildren(...slipList.map((s) => s.el));
      boardNote.textContent = boardLine(b);
      if (!still()) animate(slipList.map((s) => s.el), { opacity: { from: 0, to: 1 }, translateY: { from: 12, to: 0 }, delay: stagger(67), duration: dur.enter, ease: fn(ease.softLand) });
    },
    (e) => (boardNote.textContent = e instanceof Error ? e.message : String(e)),
  );

  // ---------- live state: the seal and N follow every edit ----------
  const edited = (): { invoice: string; changed: string[] } => {
    const f: InvoiceFields = {
      invoice_id: id.input.value.trim(),
      supplier_pk: orig.supplier_pk,
      buyer_pk: orig.buyer_pk,
      amount_zat: zecToZat(amount.input.value.trim()),
      issue_date: dateToDays(issued.input.value.trim()),
      due_date: dateToDays(due.input.value.trim()),
      terms_hash: terms.input.value.trim().toLowerCase(),
    };
    const changed = (["invoice_id", "amount_zat", "issue_date", "due_date", "terms_hash"] as const).filter((k) => f[k] !== orig[k]);
    return { invoice: changed.length ? encodeEdited(wasm, f) : KIT.invoice, changed };
  };
  let lastN = orig.nullifier;
  let redraw = 0;
  const clearVerdict = () => {
    for (const el of root.querySelectorAll(".slam")) el.remove();
    for (const s of slipList) s.el.classList.remove("is-hit", "is-scan");
    thread.classList.remove("is-drawn");
  };
  const follow = () => {
    clearVerdict();
    let n: string | null = null;
    let changed: string[] = [];
    try {
      const r = edited();
      changed = r.changed;
      n = json<Decoded>(wasm.invoiceDecode(r.invoice)).nullifier;
    } catch {
      changed = ["unreadable"];
    }
    sheet.dataset.seal = changed.length ? "broken" : "whole";
    sealNote.textContent = changed.length
      ? changed[0] === "unreadable"
        ? "Not a valid invoice: no seal can hold"
        : `You changed the ${changed.map((k) => LABEL[k]).join(", ")}: the buyer's seal no longer holds`
      : "Buyer's seal over these exact bytes";
    for (const i of inputs) i.dataset.changed = String(changed.includes(Object.keys(LABEL)[inputs.indexOf(i)]));
    nLine.querySelector("code")!.textContent = n ?? "—";
    clearTimeout(redraw);
    if (n && n !== lastN) {
      lastN = n;
      redraw = window.setTimeout(() => print.set(n!, !still()), 220);
    }
  };
  for (const i of inputs) i.addEventListener("input", follow);
  reset.addEventListener("click", () => {
    id.input.value = orig.invoice_id;
    amount.input.value = zatToZec(orig.amount_zat);
    issued.input.value = daysToDate(orig.issue_date);
    due.input.value = daysToDate(orig.due_date);
    terms.input.value = orig.terms_hash;
    follow();
  });
  print.set(orig.nullifier, false);

  // ---------- financier B's check ----------
  const tally = { forged: 0, pledged: 0 };
  const count = (glyph: string, word: string) => {
    const n = h("strong", {}, "0");
    return { n, el: h("div", { class: "tally-item" }, h("span", { class: "tally-glyph", "aria-hidden": "true" }, glyph), n, h("span", {}, word)) };
  };
  const cForged = count("偽", "forged seal");
  const cPledged = count("重", "already pledged");
  const cPaid = count("済", "financed twice");
  const out = h("div", { class: "verdict", "aria-live": "polite" });
  const say = (glyph: string, title: string, text: string, ...more: Node[]) =>
    out.replaceChildren(h("p", { class: "verdict-line" }, h("span", { class: "hanko", "aria-hidden": "true" }, glyph), h("strong", {}, title), h("span", {}, text)), ...more);

  const sweep = async (match: Slip | undefined) => {
    for (const s of slipList) s.el.classList.remove("is-hit", "is-scan");
    thread.classList.remove("is-drawn");
    if (still()) {
      match?.el.classList.add("is-hit");
      return;
    }
    for (const s of slipList) {
      s.el.classList.add("is-scan");
      await new Promise((r) => setTimeout(r, 70));
      s.el.classList.remove("is-scan");
      if (s === match) break;
    }
    match?.el.classList.add("is-hit");
    if (match) {
      const a = print.el.getBoundingClientRect();
      const b = match.el.getBoundingClientRect();
      const stage = desk.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - stage.left, y1 = a.top + a.height * 0.55 - stage.top;
      const x2 = b.left + 10 - stage.left, y2 = b.top + b.height / 2 - stage.top;
      const len = Math.hypot(x2 - x1, y2 - y1);
      thread.style.cssText = `left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      thread.classList.add("is-drawn");
    }
  };

  const offer = h("button", { type: "button", class: "seal-btn" }, h("span", {}, "Offer it to financier B")) as HTMLButtonElement;
  offer.addEventListener("click", async () => {
    offer.disabled = true;
    clearVerdict();
    out.dataset.state = "checking";
    try {
      say("待", "Financier B is checking", "First the buyer's seal on these exact bytes, then the board.");
      let invoice: string;
      let changed: string[];
      try {
        ({ invoice, changed } = edited());
      } catch (e) {
        tally.forged++;
        say("偽", "Not a valid invoice", `B cannot even read it: ${e instanceof Error ? e.message : String(e)}. No buyer signed this.`);
        slam(sheet, "偽", "forged");
        return;
      }
      const b = await board();
      const exit = checkOffer(wasm, invoice, KIT.buyerSignature, b.json);
      if (exit.kind === "forged") {
        tally.forged++;
        say("偽", "Forged seal", `You changed the ${changed.map((k) => LABEL[k]).join(", ")}. The buyer signed the original bytes, so its signature does not hold for these. B stops here, before the board.`);
        slam(sheet, "偽", "forged");
      } else if (exit.kind === "pledged") {
        tally.pledged++;
        await sweep(slipList.find((s) => s.txid === exit.txid));
        say(
          "重",
          "Already pledged",
          `The board already holds this fingerprint, registered at block ${exit.height ?? "unknown"}${exit.others ? `, and ${exit.others} later entr${exit.others === 1 ? "y" : "ies"} for another financier` : ""}. B refuses. B learns only that, not who A is and not the amount.`,
          kv([
            ["Fingerprint N", json<Decoded>(wasm.invoiceDecode(invoice)).nullifier, true],
            ["First entry", exit.txid, true],
          ]),
        );
        slam(pool, "重", "pledged");
      } else {
        say("認", "Not on the board", `B could finance it. If you got here with a buyer-signed invoice, you found a hole: please tell us. (${boardLine(b)})`);
      }
    } catch (e) {
      say("拒", "Refused", e instanceof Error ? e.message : String(e));
    } finally {
      offer.disabled = false;
      out.dataset.state = "done";
      cForged.n.textContent = String(tally.forged);
      cPledged.n.textContent = String(tally.pledged);
    }
  });

  const desk = h(
    "section",
    { class: "desk", "aria-label": "The evidence desk" },
    h("div", { class: "desk-paper" }, sheet),
    h("div", { class: "desk-print" }, print.el, nLine),
    pool,
    thread,
  );

  const deck = h(
    "div",
    { class: "deck" },
    h("div", { class: "deck-call" }, offer, h("p", {}, "Change any field on the sheet first, or offer it as it is. Try as often as you like.")),
    h("div", { class: "tally", role: "status" }, cForged.el, cPledged.el, cPaid.el),
    out,
  );

  // ---------- A's registration, Exhibit A, the lens, the limits, the financier ----------
  const aStrip = h(
    "div",
    { class: "a-strip" },
    h("span", { class: "a-kanji", "aria-hidden": "true" }, "登録"),
    h("p", {}, h("strong", {}, "Financier A already paid. "), `It registered this invoice on the board before paying: block ${at.height}, transaction ${at.tx_index}. The board shows a fingerprint and a commitment, never A's name or the amount.`),
  );

  const exOut = h("div", { class: "ex-out" });
  const takeHome = h("button", { type: "button", class: "seal-btn is-small" }, h("span", {}, "Take Exhibit A")) as HTMLButtonElement;
  takeHome.addEventListener("click", async () => {
    takeHome.disabled = true;
    try {
      const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`the proof answered ${r.status}`);
      const exhibit = wasm.exhibitFromProof((await r.text()).trim());
      const b = await board();
      exOut.replaceChildren(...exhibitView(exhibit, b.json, undefined, boardLine(b)));
      envelope.dataset.open = "true";
    } catch (e) {
      exOut.replaceChildren(h("p", { class: "pool-note" }, e instanceof Error ? e.message : String(e)));
    } finally {
      takeHome.disabled = false;
    }
  });
  const envelope = h(
    "section",
    { class: "chapter ex", "data-open": "false" },
    h(
      "div",
      { class: "ex-env", "aria-hidden": "true" },
      h("span", { class: "ex-flap" }),
      h("span", { class: "ex-stamp" }, "EVIDENCE · 証"),
      h("span", { class: "ex-sig is-1" }, "sig ①"),
      h("span", { class: "ex-sig is-2" }, "sig ②"),
    ),
    h(
      "div",
      { class: "chapter-text" },
      h("span", { class: "chapter-no" }, "四"),
      h("h2", {}, "What B takes home: Exhibit A"),
      h("p", {}, "Kurogane also signed an entry for another financier, and it reached the board. B keeps the evidence: the two signatures and where they sit on the board. It names no invoice, amount, buyer or financier, so B can share it with anyone; whoever holds the invoice can check it is this one."),
      takeHome,
      exOut,
    ),
  );

  // M-04 (HNK-30.T6): the same deal as the parties hold it, and as anyone holding the published
  // board key sees it. Honest by addition: what the key also reveals is listed under the lens.
  const lensOut = h("div", { class: "lens", "data-world": "false" });
  const hold = h("button", { class: "lens-hold", type: "button", "aria-pressed": "false" }, h("span", { "aria-hidden": "true" }, "◎"), "Hold to see it as the world does") as HTMLButtonElement;
  const setWorld = (on: boolean) => {
    lensOut.dataset.world = String(on);
    hold.setAttribute("aria-pressed", String(on));
  };
  hold.addEventListener("pointerdown", () => setWorld(true));
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) hold.addEventListener(ev, () => setWorld(false));
  hold.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setWorld(lensOut.dataset.world !== "true");
    }
  });
  const lensLoad = async () => {
    try {
      const b = await board();
      const entries = JSON.parse(b.json) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
      const mine = entries.find((e) => e.txid === KIT.financierA.txid);
      if (!mine) throw new Error("the entry is not in this board data");
      const d = json<{ kind: string; nullifier: string; financier_commitment: string; discount_bucket: number; tenor_bucket: number; signature: string }>(wasm.boardMemoDescribe(mine.memo));
      const hidden = h(
        "div",
        { class: "lens-side lens-paper" },
        h("div", { class: "lens-cap" }, "What the parties hold"),
        kv([
          ["Invoice", orig.invoice_id],
          ["Amount", `${zatToZec(orig.amount_zat)} ZEC`],
          ["Buyer", short(orig.buyer_pk), true],
          ["Due", daysToDate(orig.due_date)],
          ["Financier", "A (by name, in the letter)"],
        ]),
      );
      const world = h(
        "div",
        { class: "lens-side lens-pool" },
        h("div", { class: "lens-cap" }, "What anyone with the board key sees"),
        kv([
          ["Entry", d.kind === "RegisterWithHistory" ? "register, with a buyer history tag" : "register"],
          ["Fingerprint N", short(d.nullifier), true],
          ["Financier", `commitment ${short(d.financier_commitment)}`, true],
          ["Classes", d.discount_bucket === 0 && d.tenor_bucket === 0 ? "not disclosed (0/0)" : `discount ${d.discount_bucket}, tenor ${d.tenor_bucket}`],
          ["Supplier signature", short(d.signature), true],
          ["Where", `block ${mine.height}, transaction ${mine.tx_index}`],
        ]),
        h("p", { class: "lens-also" }, "The key also shows the small amount each post sends to the board address, the memo's length and layout, and the block's time. Nothing on the paper side."),
      );
      lensOut.replaceChildren(hidden, world);
    } catch (e) {
      lensOut.replaceChildren(h("p", { class: "pool-note" }, e instanceof Error ? e.message : String(e)));
    }
  };
  void lensLoad();
  const lens = h(
    "section",
    { class: "chapter lens-ch" },
    h(
      "div",
      { class: "chapter-text" },
      h("span", { class: "chapter-no" }, "五"),
      h("h2", {}, "What the world sees"),
      h("p", {}, "The board's viewing key is published so anyone can audit it. Press and hold to see financier A's registration of this invoice the way everyone else does."),
      hold,
    ),
    lensOut,
  );

  const limit = (no: string, glyph: string, text: string) => h("li", {}, h("span", { class: "lim-no", "aria-hidden": "true" }, no), h("span", { class: "lim-glyph", "aria-hidden": "true" }, glyph), h("p", {}, text));
  const limits = h(
    "section",
    { class: "chapter limits-ch" },
    h(
      "div",
      { class: "chapter-text" },
      h("span", { class: "chapter-no" }, "六"),
      h("h2", {}, "What this does not stop"),
      h("p", {}, "The board stops one signed invoice from being financed twice. It is not credit diligence."),
    ),
    h(
      "ol",
      { class: "lims" },
      limit("一", "共", "A fake invoice that the buyer itself co-signs: the buyer's signature is real, so the board sees a new invoice."),
      limit("二", "割", "One delivery split into two invoices that the buyer both signs."),
      limit("三", "怠", "A financier that does not check the board before paying."),
    ),
  );

  const fin = h(
    "section",
    { class: "chapter fin-ch" },
    h(
      "div",
      { class: "fin-phone", "aria-hidden": "true" },
      h("span", { class: "fin-notch" }),
      h("span", { class: "fin-row is-offer" }, h("i", {}, "売"), h("b", {}, "Financing offer"), h("em", {}, "認")),
      h("span", { class: "fin-row" }, h("i", {}, "買"), h("b", {}, "Buyer history"), h("em", {}, "KYC")),
      h("span", { class: "fin-steps" }, h("span", {}, h("i", {}, "売"), "supplier"), h("span", {}, h("i", {}, "買"), "buyer"), h("span", { class: "is-wait" }, h("i", {}, "証"), "you")),
      h("span", { class: "fin-advance" }, h("small", {}, "Advance waiting for your passkey"), h("strong", {}, "0.00036 ZEC")),
      h("span", { class: "fin-key" }, "Approve with passkey"),
    ),
    h(
      "div",
      { class: "chapter-text" },
      h("span", { class: "chapter-no" }, "七"),
      h("h2", {}, "The financier's side"),
      h("p", {}, "A financier runs its own node and works from a passkey console. Try the demo console: create a passkey, read the node's sealed mailbox, see that payments wait for the passkey. Nothing there moves money."),
      h(
        "div",
        { class: "fin-links" },
        h("a", { class: "seal-btn is-small", href: "https://jitsuinfi-console-demo.vercel.app/console", target: "_blank", rel: "noopener" }, h("span", {}, "Open the demo console")),
        h("a", { class: "ink-link", href: "#/apply" }, "Become a financier"),
      ),
    ),
  );

  root.append(
    h(
      "header",
      { class: "try-head" },
      h("p", { class: "case-no" }, h("span", { "aria-hidden": "true" }, "案"), KIT.case),
      h("h1", {}, "Try to ", h("em", {}, "double"), "-finance"),
      h("p", { class: "try-lede" }, "Play the supplier who sells one invoice twice. No wallet, no account: every check runs in your browser against the Zcash testnet board."),
    ),
    aStrip,
    desk,
    deck,
    envelope,
    lens,
    limits,
    fin,
  );
  follow();
  if (autoplay) void play({ amount: amount.input, offer, takeHome, out, exOut });
  return root;
}

// The 20-second clip of the video (HNK-30.T9, M-01 then M-03): #/try/play runs the demo by itself
// at a filmable pace, the same way every time: change the amount (偽), put it back (重), take
// Exhibit A (PASS). Nothing else differs from the page a judge uses.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await wait(100);
}

async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  input.focus();
  input.value = "";
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input"));
    await wait(110);
  }
}

async function play(p: { amount: HTMLInputElement | HTMLTextAreaElement; offer: HTMLButtonElement; takeHome: HTMLButtonElement; out: HTMLElement; exOut: HTMLElement }): Promise<void> {
  const original = p.amount.value;
  const focus = (el: Element) => el.scrollIntoView({ behavior: "smooth", block: "center" });
  const verdict = (box: HTMLElement, glyph: string) => () => box.querySelector(".hanko")?.textContent === glyph;
  await wait(1200);
  focus(p.amount);
  await wait(700);
  await typeInto(p.amount, "0.0005");
  await wait(500);
  p.offer.click();
  await until(verdict(p.out, "偽"));
  await wait(2600);
  await typeInto(p.amount, original);
  await wait(400);
  p.offer.click();
  await until(verdict(p.out, "重"));
  await wait(2800);
  focus(p.takeHome);
  await wait(600);
  p.takeHome.click();
  await until(() => p.exOut.childElementCount > 0);
  focus(p.exOut);
}
