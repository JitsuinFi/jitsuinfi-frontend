// "Try to double-finance" (HNK-30.T3 – T4, M-02 sealed invoice kit, M-01 two exits, D-40): the
// judge plays the supplier of Case File #0417 and offers an invoice that financier A already
// registered on the testnet board to financier B, as it is or changed in any field. Every try
// ends at one of two exits: 偽 (the buyer's seal does not hold for the bytes) or 重 (the board
// already holds the invoice's fingerprint). Nothing to install, no wallet, nothing recorded: the
// checks run in this browser with the same code as the node and `jitsuin verify`, against the
// live board scanned by the financier node (or a bundled copy when the node does not answer).
import { boardLine, loadBoard, type BoardData } from "../lib/board";
import { checkOffer, encodeEdited, KIT, type InvoiceFields } from "../lib/kit";
import { dateToDays, daysToDate, json, wasm, zatToZec, zecToZat } from "../lib/core";
import { actions, banner, button, card, field, h, kv, Out, page } from "../lib/ui";
import { exhibitView } from "./verify";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-6)}`;

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

  const id = field("Invoice number", { value: orig.invoice_id });
  const amount = field("Amount (ZEC)", { value: zatToZec(orig.amount_zat) });
  const issued = field("Issued", { type: "date", value: daysToDate(orig.issue_date) });
  const due = field("Due", { type: "date", value: daysToDate(orig.due_date) });
  const terms = field("Terms hash (SHA-256 of the PDF)", { value: orig.terms_hash });
  const reset = button(
    "Put back the original",
    () => {
      id.input.value = orig.invoice_id;
      amount.input.value = zatToZec(orig.amount_zat);
      issued.input.value = daysToDate(orig.issue_date);
      due.input.value = daysToDate(orig.due_date);
      terms.input.value = orig.terms_hash;
    },
    true,
  );

  const envelope = card(
    "Step 1",
    "The envelope",
    `${KIT.supplier} holds one invoice its buyer signed. Change anything you like (number, amount, dates, terms): a new-looking invoice is what a second financier would need.`,
    h("div", { class: "row" }, id.el, amount.el),
    h("div", { class: "row" }, issued.el, due.el),
    terms.el,
    kv([
      ["Buyer key", short(orig.buyer_pk), true],
      ["Buyer's seal (signature)", short(KIT.buyerSignature), true],
    ]),
    actions(reset),
  );

  const deskA = card(
    "Step 2",
    "Financier A already paid",
    "Kurogane already sold this invoice to financier A. A registered it on the shielded board before paying.",
    banner("ok", "Registered on the board", `Entry at block ${at.height}, transaction ${at.tx_index}. The board shows a fingerprint and a commitment, never A's name or the amount.`),
  );

  const tally = { forged: 0, pledged: 0 };
  const score = h("p", { class: "note", "aria-live": "polite" });
  const out = new Out();

  const edited = (): { invoice: string; changed: string[] } => {
    const f: InvoiceFields = {
      invoice_id: id.value(),
      supplier_pk: orig.supplier_pk,
      buyer_pk: orig.buyer_pk,
      amount_zat: zecToZat(amount.value()),
      issue_date: dateToDays(issued.value()),
      due_date: dateToDays(due.value()),
      terms_hash: terms.value().toLowerCase(),
    };
    const changed = (["invoice_id", "amount_zat", "issue_date", "due_date", "terms_hash"] as const).filter((k) => f[k] !== orig[k]);
    return { invoice: changed.length ? encodeEdited(wasm, f) : KIT.invoice, changed };
  };

  const offer = button("Offer it to financier B", async () => {
    offer.disabled = true;
    try {
      out.show(banner("warn", "Financier B is checking", "First the buyer's seal on these exact bytes, then the board."));
      let invoice: string;
      let changed: string[];
      try {
        ({ invoice, changed } = edited());
      } catch (e) {
        tally.forged++;
        out.show(banner("bad", "Not a valid invoice", `B cannot even read it: ${e instanceof Error ? e.message : String(e)}. No buyer signed this.`, "偽"));
        return;
      }
      const b = await board();
      const exit = checkOffer(wasm, invoice, KIT.buyerSignature, b.json);
      if (exit.kind === "forged") {
        tally.forged++;
        out.show(
          banner("bad", "Forged seal", `You changed the ${changed.map((k) => LABEL[k]).join(", ")}. The buyer signed the original bytes, so its signature does not hold for these. B stops here, before the board.`, "偽"),
        );
      } else if (exit.kind === "pledged") {
        tally.pledged++;
        out.show(
          banner(
            "bad",
            "Already pledged",
            `The board already holds an entry for this invoice's fingerprint, registered at block ${exit.height ?? "unknown"}${exit.others ? `, and ${exit.others} later entr${exit.others === 1 ? "y" : "ies"} for another financier` : ""}. B refuses. B learns only that, not who A is and not the amount.`,
            "重",
          ),
          kv([
            ["Fingerprint N", json<Decoded>(wasm.invoiceDecode(invoice)).nullifier, true],
            ["First entry", exit.txid, true],
            ["Board data", boardLine(b)],
          ]),
        );
      } else {
        out.show(banner("ok", "Not on the board", `B could finance it. If you got here with a buyer-signed invoice, you found a hole: please tell us. (${boardLine(b)})`));
      }
    } catch (e) {
      out.error(e);
    } finally {
      offer.disabled = false;
      score.textContent = `Your tries: ${tally.forged} ended at 偽 (forged seal), ${tally.pledged} at 重 (already pledged), 0 got financed. Nothing about your tries leaves this page.`;
    }
  });

  const deskB = card(
    "Step 3",
    "Now try financier B",
    "You are Kurogane. Offer the invoice to a second financier, as it is or changed. Try as often as you like.",
    actions(offer),
    out.el,
    score,
  );

  const exOut = new Out();
  const takeHome = button("Take Exhibit A", async () => {
    takeHome.disabled = true;
    try {
      const r = await fetch(KIT.proofUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`the proof answered ${r.status}`);
      const exhibit = wasm.exhibitFromProof((await r.text()).trim());
      const b = await board();
      exOut.show(...exhibitView(exhibit, b.json, undefined, boardLine(b)));
    } catch (e) {
      exOut.error(e);
    } finally {
      takeHome.disabled = false;
    }
  });
  const exhibit = card(
    "Step 4",
    "What B takes home: Exhibit A",
    "Kurogane also signed an entry for another financier, and it reached the board. B keeps the evidence: the two signatures and where they sit on the board. It names no invoice, amount, buyer or financier, so B can share it with anyone; whoever holds the invoice can check it is this one.",
    actions(takeHome),
    exOut.el,
  );

  // M-04 (HNK-30.T6): the same deal as the parties hold it, and as anyone holding the published
  // board key sees it. Honest by addition: what the key also reveals is listed under the lens.
  const lensOut = h("div", { class: "lens", "data-world": "false" });
  const hold = h("button", { class: "secondary", type: "button", "aria-pressed": "false" }, "Hold to see it as the world does") as HTMLButtonElement;
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
        h("div", { class: "label" }, "What the parties hold"),
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
        h("div", { class: "label" }, "What anyone with the board key sees"),
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
      lensOut.replaceChildren(h("p", { class: "note" }, e instanceof Error ? e.message : String(e)));
    }
  };
  void lensLoad();
  const lens = card(
    "Step 5",
    "What the world sees",
    "The board's viewing key is published so anyone can audit it. Press and hold to see financier A's registration of this invoice the way everyone else does.",
    actions(hold),
    lensOut,
  );

  const limits = card(
    "Step 6",
    "What this does not stop",
    "The board stops one signed invoice from being financed twice. It is not credit diligence.",
    h(
      "ul",
      { class: "limits" },
      h("li", {}, "A fake invoice that the buyer itself co-signs: the buyer's signature is real, so the board sees a new invoice."),
      h("li", {}, "One delivery split into two invoices that the buyer both signs."),
      h("li", {}, "A financier that does not check the board before paying."),
    ),
  );

  const root = page(
    "Try to double-finance",
    `${KIT.case}. Play the supplier who sells one invoice twice. No wallet, no account: every check runs in your browser against the Zcash testnet board.`,
    envelope,
    deskA,
    deskB,
    exhibit,
    lens,
    limits,
    card(
      "Step 7",
      "The financier's side",
      "A financier runs its own node and works from a passkey console. Try the demo console: create a passkey, read the node's sealed mailbox, see that payments wait for the passkey. Nothing there moves money.",
      actions(
        h("a", { class: "button", href: "https://jitsuinfi-console-demo.vercel.app/console", target: "_blank", rel: "noopener" }, "Open the demo console"),
        h("a", { class: "button secondary", href: "#/apply" }, "Become a financier"),
      ),
    ),
  );
  if (autoplay) void play({ amount: amount.input, offer, takeHome, out: out.el, exOut: exOut.el });
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
    await wait(110);
  }
}

async function play(p: { amount: HTMLInputElement | HTMLTextAreaElement; offer: HTMLButtonElement; takeHome: HTMLButtonElement; out: HTMLElement; exOut: HTMLElement }): Promise<void> {
  const original = p.amount.value;
  const focus = (el: Element) => el.scrollIntoView({ behavior: "smooth", block: "center" });
  const verdict = (box: HTMLElement, glyph: string) => () => box.querySelector(".banner .hanko")?.textContent === glyph;
  await wait(1200);
  focus(p.amount);
  await wait(700);
  await typeInto(p.amount, "0.0005");
  await wait(500);
  focus(p.offer);
  await wait(600);
  p.offer.click();
  await until(verdict(p.out, "偽"));
  await wait(2600);
  focus(p.amount);
  await wait(600);
  await typeInto(p.amount, original);
  await wait(400);
  focus(p.offer);
  await wait(500);
  p.offer.click();
  await until(verdict(p.out, "重"));
  await wait(2800);
  focus(p.takeHome);
  await wait(600);
  p.takeHome.click();
  await until(() => p.exOut.querySelector(".banner") !== null);
  focus(p.exOut);
}
