// The sealed invoice kit of the judge demo (HNK-30.T3, M-02, D-40): one test invoice that the
// buyer signed and the supplier already registered on the Zcash testnet board for financier A.
// The visitor plays the supplier and offers the same invoice to financier B. B checks the buyer's
// seal on the exact bytes (偽 when it fails) and then the board for the invoice's fingerprint N
// (重 when an entry is there). Test data only: the supplier "Kurogane Trading" is fictional.
//
// Source: jitsuinfi-zcash examples/testnet/proof-tes-inv-0003.txt (the double-signature proof of
// this invoice; its two entries are on the board at the positions below).

export const KIT = {
  case: "Case File #0417",
  supplier: "Kurogane Trading (fictional)",
  invoice:
    "SlRTSQEXVEVTLUlOVi0wMDAzLTE3OTIxNzk3MDNmzWCLkouI5Q4O_qoz-vHEPO_gcpSwuH6f4Kumo892M3T4XNo00cJ8RiFIRzHpFXnD2cbPwNlLKBqhHpFiBYqpQJwAAAAAAAAGUQAAJFEAAG3JR6EwR9u_mFctb4x42gwOo0Cghvu65bHSUml6yWSx",
  buyerSignature:
    "82ff801a19c5ca32a72c27716a29b118ed64a32997b93e5f2cdec312eaa594a37c10cad8169b9e6d47df1490ebafe07ff3f27327e1a734967c9c8df68ebc1f07",
  financierA: { txid: "33b8f3b0aa754e790e9c7fac0ae7dc08ce8612a8c26620d551d790e1ea390a56", height: 4509299, tx_index: 2, output_index: 0 },
  /** Same-origin board data until the live snapshot service (HNK-28.T1, HNK-30.T4). */
  board: { url: "/demo/board-testnet-4511024.json", upToHeight: 4511024, taken: "2026-10-20" },
} as const;

export interface KitWasm {
  bundleBuild(json: string): string;
  bundleOnBoard(bundle: string, board: string): string;
}

/** Where financier B's check ends. */
export type Exit =
  | { kind: "forged"; reason: string }
  | { kind: "pledged"; txid: string; height?: number; others: number }
  | { kind: "free" };

/**
 * Financier B's check of an offer: the buyer's seal on these exact bytes, then the board for N.
 * `free` would mean B may finance; the kit invoice never reaches it.
 */
export function checkOffer(w: KitWasm, invoice: string, buyerSignature: string, boardJson: string): Exit {
  let bundle: string;
  try {
    bundle = w.bundleBuild(JSON.stringify({ invoice, buyer_signature: buyerSignature }));
  } catch (e) {
    return { kind: "forged", reason: e instanceof Error ? e.message : String(e) };
  }
  const r = JSON.parse(w.bundleOnBoard(bundle, boardJson)) as {
    register: { status: "NotFound" | "Registered" | "DoubleFinanced"; txid?: string; height?: number; conflicting?: string[] };
  };
  if (r.register.status === "NotFound") return { kind: "free" };
  const txid = r.register.txid ?? "";
  // A double-financed lookup names the first entry by txid only; its height comes from the board.
  const height = r.register.height ?? (JSON.parse(boardJson) as Array<{ txid: string; height: number }>).find((x) => x.txid === txid)?.height;
  return { kind: "pledged", txid, height, others: r.register.conflicting?.length ?? 0 };
}
