// Verify screen for auditors and judges (HNK-07.T2 crucial, HNK-07.T3 "caught" view): checks a
// bundle or a double-signature proof in the browser, offline or against board data.
import { codeKind, daysToDate, json, wasm, zatToZec } from "../lib/core";
import { actions, banner, button, card, download, field, fileField, h, kv, Out, page } from "../lib/ui";

export function verifyPage(): HTMLElement {
  const code = field("Bundle or proof", { area: true, placeholder: "Paste a JitsuinFi bundle (JTSB) or double-signature proof (JTSP)" });
  const board = fileField("Board data (optional)", "JSON from the backend; adds the on-chain status. Without it the check is offline.");
  const out = new Out();
  const run = async () => {
    try {
      const c = code.value();
      const kind = codeKind(c);
      const boardJson = await board.input.files?.[0]?.text();
      if (kind === "proof") return out.show(...proofView(c));
      if (kind === "bundle") return out.show(...bundleView(c, boardJson));
      throw new Error("not a bundle or a proof");
    } catch (e) {
      out.error(e);
    }
  };
  return page(
    "Verify",
    "Everything here runs in your browser with the same code as the backend. Nothing is sent anywhere.",
    card("Check", "Verify a deal or catch a double financing", "Paste what you were given.", code.el, board.el, actions(button("Verify", run)), out.el),
  );
}

function bundleView(c: string, boardJson?: string): Node[] {
  const v = json<{ nullifier: string; invoice_id: string; amount_zat: number; due_date: number; assignment: string | null }>(wasm.verifyBundle(c));
  const letter =
    v.assignment === "Sealed"
      ? "sealed by supplier, buyer and financier"
      : v.assignment === null
        ? "not included"
        : `waiting for ${v.assignment.replace("AwaitingSeal:", "")}`;
  const nodes: Node[] = [
    banner("ok", "Bundle is genuine", "The buyer signed this invoice and every seal checks out."),
    kv([
      ["Invoice", v.invoice_id],
      ["Amount", `${zatToZec(v.amount_zat)} ZEC`],
      ["Due", daysToDate(v.due_date)],
      ["Assignment letter", letter],
      ["Fingerprint N", v.nullifier, true],
    ]),
  ];
  if (boardJson) {
    const b = json<{ register: { status: string; txid?: string; conflicting?: string[] }; settled: { txid: string; on_time: boolean } | null }>(wasm.bundleOnBoard(c, boardJson));
    const reg = b.register;
    nodes.push(
      reg.status === "DoubleFinanced"
        ? banner("bad", "Double financing on the board", `The supplier registered this invoice for ${1 + (reg.conflicting?.length ?? 0)} financiers.`)
        : reg.status === "Registered"
          ? banner("ok", "Registered once on the board", `Entry ${reg.txid?.slice(0, 16)}…`)
          : banner("warn", "Not on the board", "No register entry for this invoice."),
      kv([["Settled", b.settled ? `yes, ${b.settled.on_time ? "on time" : "late"} (entry ${b.settled.txid.slice(0, 16)}…)` : "no"]]),
    );
  }
  return nodes;
}

function proofView(c: string): Node[] {
  const p = json<{ nullifier: string; supplier_pk: string; first_commitment: string; second_commitment: string; first_at: { txid: string; height: number } | null; second_at: { txid: string; height: number } | null }>(
    wasm.verifyProof(c),
  );
  const where = (a: { txid: string; height: number } | null) => (a ? `on the board, block ${a.height} (${a.txid.slice(0, 16)}…)` : "offered privately, never posted");
  return [
    h(
      "div",
      { class: "banner bad" },
      h("strong", {}, "Caught: the supplier signed this invoice twice"),
      "Two registrations of the same invoice for two different financiers, both signed with the supplier's key from the invoice the buyer signed. Verified in your browser.",
    ),
    kv([
      ["Fingerprint N", p.nullifier, true],
      ["Supplier key", p.supplier_pk, true],
      ["First financier (commitment)", p.first_commitment, true],
      ["", where(p.first_at)],
      ["Second financier (commitment)", p.second_commitment, true],
      ["", where(p.second_at)],
    ]),
    actions(button("Download proof", () => download("double-signature.proof.txt", c), true)),
  ];
}
