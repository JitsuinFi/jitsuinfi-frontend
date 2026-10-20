// Verify screen for auditors and judges (HNK-07.T2 crucial, HNK-07.T3 "caught" view): checks a
// bundle or a double-signature proof in the browser, offline or against board data.
// Proofs (HNK-28.T2): with board data, every position the proof claims is checked by the same
// rule as `jitsuin verify` (wasm `verifyProofOnBoard`); without it, positions are shown as
// claimed only, never as facts.
import { bundleVerdict, letterStatus } from "../lib/bundle-verdict";
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
      if (kind === "proof") return out.show(...proofView(c, boardJson));
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
  const verdict = bundleVerdict(v.assignment);
  const nodes: Node[] = [
    banner(verdict.kind, verdict.title, verdict.text),
    kv([
      ["Invoice", v.invoice_id],
      ["Amount", `${zatToZec(v.amount_zat)} ZEC`],
      ["Due", daysToDate(v.due_date)],
      ["Assignment letter", letterStatus(v.assignment)],
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

const at = (a: At) => `block ${a.height}, tx ${a.tx_index ?? "?"}, output ${a.output_index ?? "?"} (${a.txid.slice(0, 16)}…)`;

function proofView(c: string, boardJson?: string): Node[] {
  const p = json<{ nullifier: string; supplier_pk: string; first_commitment: string; second_commitment: string; first_at: At | null; second_at: At | null }>(wasm.verifyProof(c));
  const keys = (): Node =>
    kv([
      ["Fingerprint N", p.nullifier, true],
      ["Supplier key", p.supplier_pk, true],
      ["First financier (commitment)", p.first_commitment, true],
      ["Second financier (commitment)", p.second_commitment, true],
    ]);
  const save = actions(button("Download proof", () => download("double-signature.proof.txt", c), true));

  if (!boardJson) {
    // Offline: the signatures are checked; the positions are only what the proof claims.
    const claimed = (a: At | null, none: string) => (a ? `claimed: ${at(a)}; not checked against the board` : none);
    return [
      p.first_at
        ? banner("warn", "Signatures check out; board not checked", "The supplier signed this invoice for two different financiers. Add board data to check the board positions the proof claims.")
        : banner("bad", "Proof does not hold", "It gives no board position for the first entry, so nobody can check that this financier registered first."),
      keys(),
      kv([
        ["First entry", claimed(p.first_at, "no position given")],
        ["Second entry", claimed(p.second_at, "offered privately, never posted")],
      ]),
      save,
    ];
  }

  const r = json<ProofOnBoard>(wasm.verifyProofOnBoard(c, boardJson));
  const line = (claim: { claimed_at: At | null; on_board: boolean | null }, none: string) =>
    claim.claimed_at ? `${claim.on_board ? "on the board at" : "NOT on the board at"} ${at(claim.claimed_at)}` : none;
  const rows: Array<[string, string]> = [
    ["Signatures", r.signatures.ok ? `the buyer signed invoice ${r.signatures.invoice_id}; the supplier signed it for 2 financiers` : `do not check out: ${r.signatures.error}`],
    ["First entry", line(r.first, "NO position given: the proof cannot be checked")],
    ["Second entry", line(r.second, "offered privately to the financier that caught it, never posted")],
  ];
  if (r.ordered !== null) rows.push(["Order", r.ordered ? "the first entry came before the second" : "the \"first\" entry is NOT before the second"]);
  rows.push(["Board data", `${r.board_entries} register entries read`]);
  return [
    r.holds
      ? h(
          "div",
          { class: "banner bad" },
          h("strong", {}, "Double financing proven"),
          "Two registrations of the same invoice for two different financiers, both signed with the supplier's key, and every board position the proof claims is on the board. Checked in your browser, by the same rule as jitsuin verify.",
        )
      : banner("warn", "Proof does not hold", "At least one claim below fails against this board data."),
    keys(),
    kv(rows),
    save,
  ];
}
