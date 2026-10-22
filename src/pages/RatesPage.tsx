// Public rate index (HNK-08.T3): "price public, participants private". Recomputes the index from
// board data in the browser with the same rule as `jitsuin index` (wasm `rateIndex`): each invoice
// counts once, with its first entry, and a class is shown only with at least k = 5 invoices.
// React since HNK-31.T6.
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Mounted } from "../app/AppShell";
import { Actions, Button, Card, DeskPage, Field, FileField, useOut } from "../app/ui";
import { boardLine, loadBoard } from "../lib/board";
import { json, wasm } from "../lib/core";
import { NET } from "../lib/network";
import { classRows, indexRows, summary, type RateIndex } from "../lib/rate-index";

function Table({ head, rows }: { head: string[]; rows: string[][] }): ReactNode {
  return (
    <div className="table-scroll">
      <table className="kv grid-table">
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The tide gauge (M-08, HNK-30.T17): one glass tube per tenor class. A published class fills to
 *  its median discount class; a class under k stays dry, its count not shown (k protects it). */
function Gauge({ idx, line }: { idx: RateIndex | null; line: string }): ReactNode {
  const discounts = idx?.classes.discount_bps ?? [];
  const tubes = (idx?.tenors ?? []).map((t) => {
    const level = t.published && t.median_discount ? t.median_discount.class / Math.max(1, discounts.length) : 0;
    return (
      <div key={t.label} className={`tg-tube${t.published ? " is-published" : ""}`}>
        <span className="tg-glass">
          {/* the level is a CSS variable set through the CSSOM (CSP-safe) */}
          <span className="tg-water" style={{ "--level": String(level) } as CSSProperties} />
        </span>
        <strong>{t.label}</strong>
        <span>{t.published ? `median ${t.median_discount?.label ?? "-"} · ${t.invoices ?? 0} invoices` : `fewer than ${idx!.k}: dry`}</span>
      </div>
    );
  });
  return (
    <section className="tg" aria-label="The rate index as a tide gauge">
      <div className="tg-scale" aria-hidden="true">
        {discounts
          .slice()
          .reverse()
          .map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
      </div>
      <div className="tg-tubes">{tubes.length ? tubes : <p className="tg-wait">Reading the board…</p>}</div>
      <p className="tg-cap">{idx ? `${summary(idx)}. A tube fills only once its class holds ${idx.k} invoices, so no single deal's rate shows. ${line}` : line}</p>
    </section>
  );
}

export function RatesPage(): ReactNode {
  const board = useRef<HTMLInputElement>(null);
  const k = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const out = useOut();
  const [gauge, setGauge] = useState<{ idx: RateIndex | null; line: string }>({ idx: null, line: "Reading the board…" });
  const run = async () => {
    try {
      const file = await board.current!.files?.[0]?.text();
      const b = file ? undefined : await loadBoard((u, i) => fetch(u, i));
      const boardJson = file ?? b!.json;
      const kv = Math.max(5, Math.floor(Number(k.current!.value.trim()) || 5));
      const idx = json<RateIndex>(wasm.rateIndex(boardJson, kv));
      setGauge({ idx, line: `Board data: ${b ? boardLine(b) : "the file you added"}.` });
      out.show(<Table head={["Tenor", "Invoices", "Median discount", "Discount classes (invoices)"]} rows={indexRows(idx)} />);
    } catch (e) {
      out.error(e);
    }
  };
  const legend = (
    <div>
      <p className="note">Discount is (face − advance) / face; tenor runs from the advance to the due date. Entries without classes (0/0) are counted as not disclosed.</p>
      <Table
        head={["Code", "Discount", "Tenor"]}
        rows={classRows({ k: 5, entries: 0, invoices: 0, undisclosed: 0, invalid: 0, tenors: [], classes: json<RateIndex>(wasm.rateIndex("[]", 5)).classes })}
      />
    </div>
  );
  return (
    <DeskPage
      glyph="価"
      eyebrow="Public rate index"
      title="Rate index"
      lede="Each register entry carries a discount class and a tenor class, never an amount or a party. Anyone can recompute the market's prices from the public board; nobody learns who financed whom."
      stage={
        <div>
          <Gauge idx={gauge.idx} line={gauge.line} />
        </div>
      }
    >
      <Card step="Index" title="Recompute it yourself" hint="Runs in your browser with the same rule as the jitsuin index command. Nothing is sent anywhere.">
        <FileField label="Board data (optional)" help={`Without a file the page reads the live ${NET.noun} board from the financier node (the last one this browser saw, or a bundled copy, if the node does not answer).`} inputRef={board} />
        <Field label="Smallest class (k)" type="number" value="5" help="A class is shown only with at least k invoices; k can be raised, not lowered below 5." inputRef={k} />
        <Actions>
          <Button onClick={run}>Recompute</Button>
        </Actions>
        {out.el}
      </Card>
      <Card step="Classes" title="What the codes mean" hint="The supplier signs both codes into the entry.">
        {legend}
      </Card>
      <Mounted then={() => void run()} />
    </DeskPage>
  );
}
