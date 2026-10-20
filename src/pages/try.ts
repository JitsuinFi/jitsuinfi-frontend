// "Try to double-finance" (HNK-30.T3, M-02 sealed invoice kit, D-40): the judge plays the
// supplier of Case File #0417 and offers an invoice that financier A already registered on the
// testnet board to financier B. Nothing to install, no wallet, nothing sent anywhere: the checks
// run in this browser with the same code as the node and `jitsuin verify`.
import { checkOffer, KIT } from "../lib/kit";
import { daysToDate, json, wasm, zatToZec } from "../lib/core";
import { actions, banner, button, card, kv, Out, page } from "../lib/ui";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-6)}`;

interface Decoded {
  invoice_id: string;
  buyer_pk: string;
  amount_zat: number;
  issue_date: number;
  due_date: number;
  terms_hash: string;
  nullifier: string;
}

let boardCache: Promise<string> | null = null;
function boardData(): Promise<string> {
  boardCache ??= fetch(KIT.board.url, { credentials: "same-origin" }).then((r) => {
    if (!r.ok) throw new Error(`board data answered ${r.status}`);
    return r.text();
  });
  return boardCache;
}

export function tryPage(): HTMLElement {
  const inv = json<Decoded>(wasm.invoiceDecode(KIT.invoice));
  const at = KIT.financierA;

  const envelope = card(
    "Step 1",
    "The envelope",
    `${KIT.supplier} holds one invoice its buyer signed. This is all a supplier brings to a financier.`,
    kv([
      ["Invoice", inv.invoice_id],
      ["Amount", `${zatToZec(inv.amount_zat)} ZEC (testnet)`],
      ["Issued / due", `${daysToDate(inv.issue_date)} / ${daysToDate(inv.due_date)}`],
      ["Buyer key", short(inv.buyer_pk), true],
      ["Terms (SHA-256 of the PDF)", short(inv.terms_hash), true],
      ["Buyer's seal", short(KIT.buyerSignature), true],
    ]),
  );

  const deskA = card(
    "Step 2",
    "Financier A already paid",
    "Kurogane already sold this invoice to financier A. A registered it on the shielded board before paying.",
    banner("ok", "Registered on the board", `Entry at block ${at.height}, transaction ${at.tx_index}. The board shows a fingerprint and a commitment, never A's name or the amount.`),
  );

  const out = new Out();
  const offer = button("Offer it to financier B", async () => {
    offer.disabled = true;
    try {
      out.show(banner("warn", "Financier B is checking", "First the buyer's seal on these exact bytes, then the board."));
      const exit = checkOffer(wasm, KIT.invoice, KIT.buyerSignature, await boardData());
      if (exit.kind === "forged") {
        out.show(banner("bad", "Forged seal", `The buyer's signature does not hold for this invoice (${exit.reason}). B stops here.`, "偽"));
      } else if (exit.kind === "pledged") {
        out.show(
          banner(
            "bad",
            "Already pledged",
            `The board already holds an entry for this invoice's fingerprint, registered at block ${exit.height ?? "unknown"}${exit.others ? `, and ${exit.others} later entr${exit.others === 1 ? "y" : "ies"} for another financier` : ""}. B refuses. B learns only that, not who A is and not the amount.`,
            "重",
          ),
          kv([
            ["Fingerprint N", inv.nullifier, true],
            ["First entry", exit.txid, true],
            ["Board data", `Testnet board up to block ${KIT.board.upToHeight} (${KIT.board.taken})`],
          ]),
        );
      } else {
        out.show(banner("ok", "Not on the board", "B could finance it. (The kit invoice never ends here.)"));
      }
    } catch (e) {
      out.error(e);
    } finally {
      offer.disabled = false;
    }
  });

  const deskB = card(
    "Step 3",
    "Now try financier B",
    "You are Kurogane. Offer the same invoice to a second financier and see what B can tell.",
    actions(offer),
    out.el,
  );

  return page(
    "Try to double-finance",
    `${KIT.case}. Play the supplier who sells one invoice twice. No wallet, no account: every check runs in your browser against Zcash testnet board data.`,
    envelope,
    deskA,
    deskB,
  );
}
