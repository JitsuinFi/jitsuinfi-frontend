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
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { checkOffer, encodeEdited, KIT, type InvoiceFields } from "../lib/kit";
import { dateToDays, daysToDate, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { h } from "../lib/ui";
import { dur, ease, rectIn, run, still, wait } from "./try/anim";
import { lens } from "./try/lens";
import { notice } from "./try/notice";
import { phone } from "./try/phone";
import { printer } from "./try/receipt";
import { entriesOf, registry } from "./try/registry";
import { seikyusho } from "./try/seikyusho";
import "./try.css";

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

export function tryPage(autoplay = false): HTMLElement {
  const orig = json<Decoded>(wasm.invoiceDecode(KIT.invoice));
  const at = KIT.financierA;

  // ---------- the judge's side: the counter top ----------
  const sheet = seikyusho({
    id: orig.invoice_id,
    amount: zatToZec(orig.amount_zat),
    issued: daysToDate(orig.issue_date),
    due: daysToDate(orig.due_date),
    terms: orig.terms_hash,
    buyer: orig.buyer_pk,
    supplier: orig.supplier_pk,
    issuer: KIT.supplier,
  });
  const f = sheet.fields;
  const reset = h("button", { type: "button", class: "ink-link" }, "Put back the original") as HTMLButtonElement;
  const offer = h("button", { type: "button", class: "seal-btn" }, h("span", {}, "Slide it to financier B")) as HTMLButtonElement;
  const stack = h("div", { class: "ct-stack", "aria-hidden": "true" });
  const count = (glyph: string, word: string) => {
    const n = h("strong", {}, "0");
    return { n, el: h("p", {}, h("span", { lang: "ja" }, glyph), n, h("small", {}, word)) };
  };
  const cF = count("偽", "forged seal");
  const cP = count("重", "already pledged");
  const cOk = count("済", "financed twice");
  const pile = h("div", { class: "ct-pile" }, stack, h("div", { class: "ct-tally", role: "status" }, cF.el, cP.el, cOk.el));
  const desk = h("div", { class: "ct-desk" }, sheet.el, h("div", { class: "ct-act" }, offer, reset), pile);

  // ---------- B's side: the registry room behind the glass ----------
  const book = registry();
  const say = h("p", { class: "ct-say", "aria-live": "polite" });
  const speak = (glyph: string, text: string) => say.replaceChildren(h("span", { class: "hanko", lang: "ja" }, glyph), h("span", {}, text));
  speak("証", `Financier A registered this invoice at block ${at.height} before paying. Show me what you have.`);
  const spot = h("span", { class: "ct-spot", "aria-hidden": "true" });
  const loupe = h("span", { class: "ct-loupe", "aria-hidden": "true" }, h("span", { class: "ct-loupe-glass" }, h("b", { lang: "ja" }, "買"), h("i")), h("span", { class: "ct-loupe-handle" }));
  const stamp = h("span", { class: "ct-stamp", "aria-hidden": "true" }, h("span", { class: "ct-stamp-knob" }), h("span", { class: "ct-stamp-neck" }), h("span", { class: "ct-stamp-base" }, h("b", { lang: "ja" }, "")));
  const thread = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  thread.setAttribute("class", "ct-thread");
  thread.setAttribute("aria-hidden", "true");
  const room = h(
    "div",
    { class: "ct-room" },
    h("div", { class: "ct-light", "aria-hidden": "true" }, h("span", { class: "ct-cone" })),
    h("span", { class: "ct-lamp", "aria-hidden": "true" }, h("i")),
    h("span", { class: "ct-bdesk", "aria-hidden": "true" }),
    book.el,
    spot,
    loupe,
    stamp,
    say,
  );
  const windowEl = h(
    "div",
    { class: "ct-window" },
    h("p", { class: "ct-plaque" }, h("span", { lang: "ja" }, "登記所"), h("small", {}, "Financier B")),
    room,
    h("span", { class: "ct-grille", "aria-hidden": "true" }),
    h("span", { class: "ct-slot", "aria-hidden": "true" }),
  );
  const counter = h("section", { class: "ct", "aria-label": "Financier B's counter" }, desk, windowEl, thread);

  void board().then(
    (b) => book.set(entriesOf(b.json, (m) => wasm.boardMemoDescribe(m), at.txid), boardLine(b)),
    (e) => book.set([], e instanceof Error ? e.message : String(e)),
  );


  // ---------- live: the seal and N follow every keystroke ----------
  const edited = (): { invoice: string; changed: string[] } => {
    const fields: InvoiceFields = {
      invoice_id: f.id.value.trim(),
      supplier_pk: orig.supplier_pk,
      buyer_pk: orig.buyer_pk,
      amount_zat: zecToZat(f.amount.value.trim()),
      issue_date: dateToDays(f.issued.value.trim()),
      due_date: dateToDays(f.due.value.trim()),
      terms_hash: f.terms.value.trim().toLowerCase(),
    };
    const changed = (["invoice_id", "amount_zat", "issue_date", "due_date", "terms_hash"] as const).filter((k) => fields[k] !== orig[k]);
    return { invoice: changed.length ? encodeEdited(wasm, fields) : KIT.invoice, changed };
  };
  let current: { n: string | null; changed: string[] } = { n: orig.nullifier, changed: [] };
  const follow = () => {
    try {
      const r = edited();
      current = { n: json<Decoded>(wasm.invoiceDecode(r.invoice)).nullifier, changed: r.changed };
    } catch {
      current = { n: null, changed: ["unreadable"] };
    }
    sheet.setChanged(current.changed);
    sheet.setN(current.n);
  };
  for (const i of Object.values(f)) i.addEventListener("input", follow);
  reset.addEventListener("click", () => {
    f.id.value = orig.invoice_id;
    f.amount.value = zatToZec(orig.amount_zat);
    f.issued.value = daysToDate(orig.issue_date);
    f.due.value = daysToDate(orig.due_date);
    f.terms.value = orig.terms_hash;
    follow();
  });

  // ---------- one try: slot, loupe, registry, stamp, back to the pile ----------
  const tally = { forged: 0, pledged: 0 };
  let tries = 0;

  const makeCopy = (forged: boolean): HTMLElement =>
    h(
      "div",
      { class: `ct-copy${forged ? " is-forged" : ""}`, "aria-hidden": "true" },
      h("span", { class: "ct-copy-t", lang: "ja" }, "請 求 書"),
      h("span", { class: "ct-copy-a" }, `${f.amount.value || "?"} ZEC`),
      h("span", { class: "ct-copy-n" }, h("b", {}, "N"), current.n ? short(current.n) : "none"),
      h("span", { class: "ct-copy-seal", lang: "ja" }, "買"),
    );

  const delta = (from: Element, to: Element) => {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
  };

  const press = async (copy: HTMLElement, glyph: string) => {
    stamp.querySelector("b")!.textContent = glyph;
    const d = delta(stamp.querySelector(".ct-stamp-base")!, copy);
    await run(stamp, { x: d.x, y: d.y - 46, rotate: -6, duration: 300 });
    await run(stamp, { y: d.y - 8, scaleY: 0.92, duration: dur.press }, ease.snapSettle);
    const mark = h("span", { class: "ct-mark", lang: "ja" }, glyph);
    copy.append(mark);
    void run(mark, { scale: [1.5, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
    void run(counter, { x: [0, -3, 3, 0], duration: 160 });
    await run(stamp, { y: d.y - 8, scaleY: 1, duration: dur.press });
    await run(stamp, { x: 0, y: 0, rotate: 0, duration: dur.exit }, ease.accelExit);
  };

  const toPile = async (copy: HTMLElement, glyph: string) => {
    // CSSOM, not a style attribute: the CSP (style-src 'self') refuses inline style attributes
    const slot = h("span", { class: "ct-sheetlet", lang: "ja" }, glyph);
    slot.style.setProperty("--r", `${((tries * 37) % 13) - 6}deg`);
    slot.style.setProperty("--i", String(Math.min(tries - 1, 8)));
    stack.append(slot);
    slot.style.visibility = "hidden";
    const d = delta(copy, slot);
    thread.replaceChildren();
    await run(copy, { x: d.x, y: d.y, scale: 0.42, rotate: 8, opacity: [1, 0.2], duration: dur.exit }, ease.accelExit);
    copy.remove();
    slot.style.visibility = "";
    void run(slot, { y: [-8, 0], duration: dur.enter }, ease.snapSettle);
  };

  const drawThread = (from: Element, to: Element) => {
    const a = rectIn(from, counter);
    const b = rectIn(to, counter);
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const mid = (x1 + x2) / 2;
    path.setAttribute("d", `M${x1} ${y1} C${mid} ${y1 + 40}, ${mid} ${y2 + 40}, ${x2} ${y2}`);
    thread.replaceChildren(path);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = still() ? "0" : `${len}`;
    return run(path, { strokeDashoffset: [len, 0], duration: 600 }, ease.softInOut);
  };

  offer.addEventListener("click", async () => {
    offer.disabled = true;
    reset.disabled = true;
    thread.replaceChildren();
    book.clear();
    try {
      tries++;
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
      const copy = makeCopy(forged);
      copy.style.left = `${spot.offsetLeft}px`;
      copy.style.top = `${spot.offsetTop}px`;
      room.append(copy);
      const d = delta(copy, sheet.el);
      const s = sheet.el.getBoundingClientRect().width / Math.max(1, copy.getBoundingClientRect().width);
      await run(copy, { x: [d.x, 0], y: [d.y, 0], scale: [s, 1], rotate: [-2, 3], opacity: [0.3, 1], duration: dur.enter + 200 });

      // the loupe reads the seal
      loupe.querySelector(".ct-loupe-glass")!.classList.toggle("is-cracked", forged);
      const seal = copy.querySelector(".ct-copy-seal")!;
      const dl = delta(loupe.querySelector(".ct-loupe-glass")!, seal);
      loupe.classList.add("is-up");
      await run(loupe, { x: [0, dl.x - 60, dl.x], y: [0, dl.y + 30, dl.y], duration: 900 }, ease.softInOut);
      await wait(350);
      const park = () => run(loupe, { x: 0, y: 0, duration: dur.exit }, ease.accelExit).then(() => loupe.classList.remove("is-up"));

      if (forged) {
        speak("偽", invoice ? `You changed the ${changed.map((k) => LABEL[k]).join(", ")}. The buyer sealed other bytes, so the seal does not hold. I stop here, before the registry.` : "These fields do not make an invoice. Nobody sealed this.");
        void park();
        await press(copy, "偽");
        tally.forged++;
        await wait(500);
        await toPile(copy, "偽");
      } else if (exit.kind === "pledged") {
        speak("待", "The seal holds. Now the registry, for this fingerprint.");
        void park();
        const row = await book.find(exit.txid);
        if (row) await drawThread(copy.querySelector(".ct-copy-n")!, row);
        speak(
          "重",
          `Block ${exit.height ?? "?"} already holds this fingerprint${exit.others ? `, and ${exit.others} later entr${exit.others === 1 ? "y" : "ies"} for another financier` : ""}. Already pledged: I refuse. I learn only that, not who A is and not the amount.`,
        );
        await press(copy, "重");
        tally.pledged++;
        await wait(700);
        await toPile(copy, "重");
      } else {
        speak("認", `Not in the registry: I could finance it. If the buyer sealed this invoice, you found a hole; please tell us. (${boardLine(b)})`);
        void park();
        await toPile(copy, "認");
      }
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      cF.n.textContent = String(tally.forged);
      cP.n.textContent = String(tally.pledged);
      offer.disabled = false;
      reset.disabled = false;
    }
  });

  // ---------- below the counter ----------
  const print = printer(async () => {
    const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`the proof answered ${r.status}`);
    const exhibit = wasm.exhibitFromProof((await r.text()).trim());
    const b = await board();
    return { exhibit, board: b.json, line: boardLine(b) };
  });
  const exhibitCh = h(
    "section",
    { class: "ch ch-ex" },
    print.el,
    h(
      "div",
      { class: "ch-text" },
      h("h2", {}, "What B takes home: Exhibit A"),
      h("p", {}, "Kurogane also signed an entry for another financier, and it reached the board. B prints the evidence: the two signatures and where they sit on the board. It names no invoice, amount, buyer or financier, so B can hand it to anyone."),
    ),
  );

  const lensCh = h(
    "section",
    { class: "ch ch-lens" },
    h("div", { class: "ch-text" }, h("h2", {}, "What the world sees"), h("p", {}, "The board's viewing key is published so anyone can audit it. Hold the seal: financier A's registration of this invoice, the way everyone else reads it.")),
    lens(async () => {
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
    }),
  );

  const wall = h("section", { class: "ch ch-wall" }, notice());

  const finCh = h(
    "section",
    { class: "ch ch-fin" },
    h(
      "div",
      { class: "ch-text" },
      h("h2", {}, "The financier's side"),
      h("p", {}, "A financier runs its own node and works from a passkey console. Try the demo console: create a passkey, read the node's sealed mailbox, see that payments wait for the passkey. Nothing there moves money."),
      h(
        "p",
        { class: "ch-links" },
        h("a", { class: "seal-btn", href: "https://jitsuinfi-console-demo.vercel.app/console", target: "_blank", rel: "noopener" }, h("span", {}, "Open the demo console")),
        h("a", { class: "ink-link", href: "#/apply" }, "Become a financier"),
      ),
    ),
    phone(),
  );

  const root = h(
    "div",
    { class: "try", "data-wide": "true" },
    h(
      "header",
      { class: "try-head" },
      h("p", { class: "try-case" }, h("span", { lang: "ja" }, "案"), KIT.case),
      h("h1", {}, "Try to double-finance"),
      h("p", {}, "You are Kurogane Trading. Financier A already paid for this invoice. Change anything you like and sell it again to financier B."),
    ),
    counter,
    exhibitCh,
    lensCh,
    wall,
    finCh,
  );
  follow();
  if (autoplay) void play({ amount: f.amount, offer, takeHome: print.button, out: say, exOut: print.out });
  return root;
}

// The 20-second clip of the video (HNK-30.T9, M-01 then M-03): #/try/play runs the demo by itself
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
    input.dispatchEvent(new Event("input"));
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
