// "What outsiders see" (HNK-11.T2, HNK-28.T5): what the public board shows to anyone holding its
// viewing key. React since HNK-31.T6.
import { useRef, type ReactNode } from "react";
import { json, wasm } from "../lib/core";
import { Actions, Button, Card, DeskPage, Field, Kv, useOut } from "../app/ui";

// What anyone holding the board's public viewing key learns (HNK-28.T5, BL-D28-07; threat model
// rows "viewing key holder" and TM #13 – #14). The key is published (D-11), so "outsider" means
// everyone: the board shows codes and hashes, never a party, an amount or a document.
const TABLE: Array<[string, string, string]> = [
  ["Who the supplier, buyer and financier are", "Hidden", "Shielded payments; per-invoice keys; each financier behind a commitment whose salt is new for every invoice"],
  ["Invoice amount, dates, terms", "Hidden", "Only inside the signed invoice the parties hold"],
  ["Which invoice an entry is about", "Hidden", "N is a hash of the whole invoice, including a per-invoice key; it cannot be guessed"],
  ["That an invoice was registered, and when", "Visible", "A register entry appears on the board in a block"],
  ["Discount class and tenor class of each registration", "Hidden by default", "Entries carry 0/0 unless the supplier opts in to the public index (D-42). An opted-in entry's codes can be read by anyone holding the invoice; the index shows a class only from 5 invoices"],
  ["Whether the buyer brought a payment history", "Visible", "The entry kind: plain register, or register with a history tag"],
  ["That an invoice was settled, on time or late", "Visible", "A settled entry appears, with its on-time flag and two signatures"],
  ["Which registration a settlement closes", "Hidden", "The settled tag is a hash of N. Whoever holds N (the financiers who saw the invoice, a fund member, a lender shown the buyer's history) can link the two; timing and tenor class can hint"],
  ["That one N appears twice", "Visible", "Without the invoice nobody can tell a double financing from griefing"],
  ["A buyer's invoices belong together", "Hidden", "Each invoice uses its own buyer key. A lender the buyer showed its history to can find the buyer's next invoice on the board"],
  ["Advance and repayment amounts", "Hidden", "Shielded; visible only to the parties and to whoever holds their viewing key"],
];

type Fact = [string, string, string];

/** One fact behind the window: lit on clear glass, or behind frosted glass with its reason. */
function FactRow({ fact: [what, status, why] }: { fact: Fact }): ReactNode {
  const shown = status === "Visible";
  return (
    <li className={shown ? "os-fact is-shown" : "os-fact is-hidden"}>
      <span className="os-mark" lang="ja" aria-hidden="true">
        {shown ? "見" : status === "Hidden by default" ? "選" : "秘"}
      </span>
      <strong>{what}</strong>
      <span className="os-status">{status}</span>
      <span className="os-why">{why}</span>
    </li>
  );
}

export function OutsiderPage(): ReactNode {
  const memo = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  // The stage (HNK-30.T17, MASTER.md §8): the 登記所 window seen from the street. What anyone with
  // the board's key can read is lit on clear glass; what stays with the parties is behind frosted
  // glass, its content struck through, the reason still readable.
  const stage = (
    <section className="os" aria-label="Public and hidden, seen from outside the registry">
      <p className="ct-plaque os-plaque">
        <span lang="ja">登記所</span>
        <small>seen from the street</small>
      </p>
      <div className="os-window">
        <div className="os-pane is-clear">
          <p className="os-pane-k">
            <b lang="ja">見える</b>
            Anyone with the board key reads
          </p>
          <ol>
            {TABLE.filter((r) => r[1] === "Visible").map((f) => (
              <FactRow key={f[0]} fact={f} />
            ))}
          </ol>
        </div>
        <div className="os-pane is-frosted">
          <p className="os-pane-k">
            <b lang="ja">見えない</b>
            Stays with the parties
          </p>
          <ol>
            {TABLE.filter((r) => r[1] !== "Visible").map((f) => (
              <FactRow key={f[0]} fact={f} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
  return (
    <DeskPage glyph="外" eyebrow="Outside the registry" title="What outsiders see" lede="The registry board is public so anyone can audit it: its viewing key is published. This is everything anyone can learn from it." stage={stage}>
      <Card step="Explorer" title="What a block explorer shows for an advance" hint="Testnet advance 7b5687991a8df84c… paid a supplier 0.00015 TAZ with a receipt, a seal and a receivable note in its memo. An explorer sees this:">
        <Kv
          rows={[
            ["Transaction", "7b5687991a8df84cdb334d910f5d08850b98d5d02c7df09cd1bff4f2c167dbd9", true],
            ["Transparent inputs / outputs", "none / none"],
            ["Shielded pool", "Ironwood"],
            ["Fee", "0.0001 TAZ (ZIP-317)"],
            ["Amount, sender, recipient", "encrypted"],
            ["Memo (receipt, seal, note)", "encrypted"],
          ]}
        />
      </Card>
      <Card
        step="Try it"
        title="Read a board entry as an outsider"
        hint="You will see the entry's kind, N, the financier commitment, the two classes and any history tag, or a settlement's tag and on-time flag. No party, amount or document. Checking a signature needs the supplier's key, which is only inside the invoice."
      >
        <Field label="A board memo (base64url)" area placeholder="Paste a memo read with the board's public viewing key" inputRef={memo} />
        <Actions>
          <Button
            onClick={() => {
              try {
                const d = json<Record<string, unknown>>(wasm.boardMemoDescribe(memo.current!.value.trim()));
                out.show(<Kv rows={Object.entries(d).map(([k, v]): [string, string, boolean] => [k, String(v ?? "—"), true])} />);
              } catch (e) {
                out.error(e);
              }
            }}
          >
            Read entry
          </Button>
        </Actions>
        {out.el}
      </Card>
    </DeskPage>
  );
}
