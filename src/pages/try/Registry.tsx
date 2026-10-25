// The rows of the registry book 登記簿 (MASTER.md §8): one per real entry of the testnet board,
// read from a board snapshot for the try page.

export interface Entry {
  txid: string;
  height: number;
  tx_index: number;
  n: string;
  kind: string;
  mine: boolean;
}

/** The registry rows of a board snapshot (wasm `boardMemoDescribe` per entry); a settled entry
 *  carries its settled tag where a register entry carries N. */
export function entriesOf(boardJson: string, describe: (memo: string) => string, mine?: string): Entry[] {
  const list = JSON.parse(boardJson) as Array<{ txid: string; height: number; tx_index: number; memo: string }>;
  return list.flatMap((e) => {
    try {
      const d = JSON.parse(describe(e.memo)) as { kind: string; nullifier?: string; settled_tag?: string };
      return [{ txid: e.txid, height: e.height, tx_index: e.tx_index, n: d.nullifier ?? d.settled_tag ?? "", kind: d.kind, mine: e.txid === mine }];
    } catch {
      return [];
    }
  });
}
