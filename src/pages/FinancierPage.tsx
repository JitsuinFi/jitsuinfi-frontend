// Financier screen (HNK-05.T5 layout, HNK-05.T4 integration for the parts the browser does):
// write the assignment letter, check the buyer's history, assemble the verification bundle.
// Registering on the board and the Sign-to-Pay advance run in the financier's backend wallet.
// The real financier works from its node's console (HNK-26); this simulation stays reachable by
// address only, not in the navigation. React since HNK-31.T10.
import { useRef, type ReactNode } from "react";
import { Page } from "../app/AppShell";
import { Actions, Banner, Button, Card, CodeBlock, Field, FileField, Kv, useOut } from "../app/ui";
import { fileHash, json, today, wasm } from "../lib/core";
import { NET } from "../lib/network";

type Area = HTMLInputElement & HTMLTextAreaElement;

export function FinancierPage(): ReactNode {
  const aInvoice = useRef<Area>(null);
  const aKey = useRef<Area>(null);
  const aAddress = useRef<Area>(null);
  const aTerms = useRef<HTMLInputElement>(null);
  const aOut = useOut();
  const hCerts = useRef<Area>(null);
  const hIdentity = useRef<Area>(null);
  const hAllow = useRef<Area>(null);
  const hBoard = useRef<HTMLInputElement>(null);
  const hGrace = useRef<Area>(null);
  const hOut = useOut();
  const bInvoice = useRef<Area>(null);
  const bSig = useRef<Area>(null);
  const bLetter = useRef<Area>(null);
  const bSeals = useRef<Area>(null);
  const bSettle = useRef<HTMLInputElement>(null);
  const bOut = useOut();
  const v = (r: { current: Area | null }) => r.current!.value.trim();
  return (
    <Page>
      <div>
        <h1>Financier</h1>
        <p className="lead">Finance invoices that are provably not financed elsewhere, to buyers whose full history you can check.</p>
        <div>
          <Banner kind="warn" title="Runs in your backend wallet" text="Board registration, waiting for confirmation, the Sign-to-Pay advance and the repayment watchdog need your shielded wallet. They run in the financier backend (jitsuin-flow); this page covers what the browser verifies." />
        </div>
        <Card step="Deal" title="Write the assignment letter" hint="After your board entry is confirmed, send this letter to the supplier and the buyer. Your backend pays the advance only once both have sealed it, and your seal travels with the money.">
          <Field label="Invoice code" area inputRef={aInvoice} />
          <Field label="Your financier key" placeholder="64 hex characters" inputRef={aKey} />
          <Field label="Your shielded pay address" placeholder={NET.addressHint} help="The buyer pays here at maturity." inputRef={aAddress} />
          <FileField label="Letter document (PDF)" help="Hashed in your browser with SHA-256; never uploaded." inputRef={aTerms} />
          <Actions>
            <Button
              onClick={async () => {
                try {
                  const file = aTerms.current!.files?.[0];
                  if (!file) throw new Error("choose the letter document");
                  const code = wasm.assignmentEncode(v(aInvoice), v(aKey), v(aAddress), await fileHash(file));
                  aOut.show(<CodeBlock label="Assignment letter code: send it to the supplier and the buyer" value={code} filename="assignment.letter.txt" />);
                } catch (e) {
                  aOut.error(e);
                }
              }}
            >
              Create letter
            </Button>
          </Actions>
          {aOut.el}
        </Card>
        <Card step="Before you finance" title="Check the buyer's history" hint="Your browser checks the chain against the board itself: every past invoice must be anchored, nothing may follow the last one, and defaults show up as unsettled entries past due.">
          <Field label="Buyer's history certificates" area help="One certificate per line, from #0 up." inputRef={hCerts} />
          <Field label="Buyer identity key" placeholder="64 hex characters" inputRef={hIdentity} />
          <Field label="Registered financiers (allowlist)" area help="One financier key per line." inputRef={hAllow} />
          <FileField label="Board data (JSON from the backend)" help="List of {txid, height, tx_index, output_index, memo}." inputRef={hBoard} />
          <Field label="Grace days" type="number" value="7" inputRef={hGrace} />
          <Actions>
            <Button
              onClick={async () => {
                try {
                  const board = await hBoard.current!.files?.[0]?.text();
                  if (!board) throw new Error("choose the board data file");
                  const lines = (s: string) => s.split(/\s+/).filter(Boolean);
                  const r = json<{ on_time: number; late: number; defaults: number; open: number; lines: Array<{ index: number; outcome: string }> }>(
                    wasm.verifyHistory(JSON.stringify(lines(v(hCerts))), v(hIdentity), JSON.stringify(lines(v(hAllow))), board, today(), Number(v(hGrace))),
                  );
                  hOut.show(
                    <>
                      {r.defaults > 0 ? <Banner kind="bad" title="Defaults found" text={`${r.defaults} unpaid invoice(s) past due.`} /> : <Banner kind="ok" title="Complete history" text="No defaults." />}
                      <Kv
                        rows={[
                          ["Paid on time", String(r.on_time)],
                          ["Paid late", String(r.late)],
                          ["Defaults", String(r.defaults)],
                          ["Still open", String(r.open)],
                          ...r.lines.map((l): [string, string] => [`Invoice #${l.index}`, l.outcome]),
                        ]}
                      />
                    </>,
                  );
                } catch (e) {
                  hOut.error(e);
                }
              }}
            >
              Check history
            </Button>
          </Actions>
          {hOut.el}
        </Card>
        <Card step="Evidence" title="Verification bundle" hint="One file with the signed invoice, the sealed letter and the settlement document. An auditor or judge verifies it offline, or against the board on the Verify page.">
          <Field label="Invoice code" area inputRef={bInvoice} />
          <Field label="Buyer signature" placeholder="128 hex characters" inputRef={bSig} />
          <Field label="Assignment letter code (optional)" area inputRef={bLetter} />
          <Field label="Letter seals (optional)" area help="One per line, in order: supplier, buyer, financier." inputRef={bSeals} />
          <label className="field">
            <input type="checkbox" ref={bSettle} /> include the settlement document
          </label>
          <Actions>
            <Button
              onClick={() => {
                try {
                  const code = wasm.bundleBuild(
                    JSON.stringify({
                      invoice: v(bInvoice),
                      buyer_signature: v(bSig),
                      assignment: v(bLetter) || undefined,
                      seals: v(bSeals).split(/\s+/).filter(Boolean),
                      with_settlement: bSettle.current!.checked,
                    }),
                  );
                  bOut.show(<CodeBlock label="Bundle (verified)" value={code} filename="deal.bundle.txt" />);
                } catch (e) {
                  bOut.error(e);
                }
              }}
            >
              Build bundle
            </Button>
          </Actions>
          {bOut.el}
        </Card>
      </div>
    </Page>
  );
}
