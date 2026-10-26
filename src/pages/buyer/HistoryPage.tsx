// History (HNK-25.T6, HNK-26.T8, BL-D26-02, BL-D26-09; IA port part 2, 2026-10-26, approved
// prototype ia-buyer-history): what a financier sees when you send your history. Check my history
// reads the chain against the board, counting the financiers named in your own certificates, so
// every outcome shows. The chain of certificates lies over the public board (公開台帳), each one
// anchored to it; a financier's request for it hangs off the chain as a branch, answered with
// "Send my history" (the same answer as the inbox's). A certificate is issued by hand under
// "Issue a certificate" (folded).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Page } from "../../app/AppShell";
import { act, lettersOf, letGo, type Letter } from "../../app/inbox";
import { useInbox } from "../../app/InboxPanel";
import { DidLine, useDid } from "../../app/outcome";
import { Banner, CodeBlock, useOut } from "../../app/ui";
import { boardLine, loadBoard } from "../../lib/board";
import { append, certFields, head, localNextIndex, type CertFields } from "../../lib/buyer-history";
import { daysToDate, json, today, wasm, zatToZec } from "../../lib/core";
import { explain } from "../../lib/explain";
import { chainState, loadHistory, saveHistory, useBoard, useInvoices, useKeyInfo, useVersion, withInvoiceIndex } from "./data";
import { Tag, useVars } from "./parts";
import "../role-paper.css";
import "../buyer.css";

const OUTCOME: Record<string, [string, string, string]> = {
  PaidOnTime: ["済", "paid on time", ""],
  PaidLate: ["遅", "paid late", "is-late"],
  Default: ["滞", "not paid past due", "is-late"],
  Open: ["待", "open, not due yet", "is-open"],
};

// what Check my history found, kept for this tab
let lastOutcomes: Record<number, string> | null = null;

/** A financier's request, hanging off the chain: who asks, for what, and Send my history (or what it did). */
function Branch({ l, said, onSent }: { l?: Letter; said?: string; onSent?: (said: string) => void }): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <div className="by-branch" role="group" aria-label="History request">
      <span className="rp-hanko is-bad" lang="ja" aria-hidden="true">
        請
      </span>
      <div>
        <b>A financier asks for your history</b>
        <p>{said ?? l?.about ?? "Reading who asks…"}</p>
        {l?.state === "failed" && l.error ? <p className="by-branch-err">{`Not sent: ${explain(l.error)}`}</p> : null}
      </div>
      {said || !l ? null : (
        <div className="actions rp-small">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const done = await act(l);
              setBusy(false);
              if (done) {
                onSent?.(done.said);
                letGo(l);
              }
            }}
          >
            {busy ? "Sending…" : "Send my history"}
          </button>
        </div>
      )}
    </div>
  );
}

export function HistoryPage(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const chain = useRef<HTMLDivElement>(null);
  const chainScroll = useRef<HTMLDivElement>(null);
  const hInv = useRef<HTMLTextAreaElement>(null);
  const hFin = useRef<HTMLInputElement>(null);
  const v = useVersion();
  const recs = useInvoices();
  const board = useBoard();
  const key = useKeyInfo();
  const inbox = useInbox();
  const shown = useDid("/buyer/history");
  const mineOut = useOut();
  const histOut = useOut();
  const [certs, setCerts] = useState<CertFields[]>([]);
  const [outcomes, setOutcomes] = useState<Record<number, string> | null>(lastOutcomes);
  const [checking, setChecking] = useState(false);
  const [answered, setAnswered] = useState<Array<{ id: string; said: string }>>([]);
  useVars(root);
  const list = Array.isArray(recs) ? recs : [];
  const requests = lettersOf(inbox, "history.request");

  useEffect(() => {
    void loadHistory().then(
      (h) => setCerts(h.certs.map(certFields)),
      () => setCerts([]),
    );
  }, [v]);
  // the chain lands when it comes into view
  useEffect(() => {
    const el = chain.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // the newest end of the chain is what matters now
  useEffect(() => {
    const sc = chainScroll.current;
    if (sc) sc.scrollLeft = sc.scrollWidth;
  }, [certs.length, requests.length]);

  // HNK-25.T6 (BL-D26-09): my history as financiers see it, checked against the board here
  const checkMine = async () => {
    setChecking(true);
    try {
      const hist = await loadHistory();
      if (!hist.certs.length) return mineOut.show(<p className="hint">No certificate yet: your history starts with the first invoice a financier finances.</p>);
      const fields = hist.certs.map(certFields);
      setCerts(fields);
      const b = await loadBoard((u, i) => fetch(u, i));
      const allow = [...new Set(fields.map((f) => f.financier_pk))];
      const r = json<{ on_time: number; late: number; defaults: number; open: number; lines: Array<{ index: number; due_date: number; outcome: string }> }>(
        wasm.verifyHistory(JSON.stringify(hist.certs), fields[0].identity_pk, JSON.stringify(allow), b.json, today(), 7),
      );
      lastOutcomes = Object.fromEntries(r.lines.map((l) => [l.index, l.outcome]));
      setOutcomes(lastOutcomes);
      mineOut.show(<Banner kind={r.defaults ? "bad" : "ok"} title={`${r.on_time} on time · ${r.late} late · ${r.open} open · ${r.defaults} defaulted`} text={`Checked against the ${b.source} board up to block ${b.tip}.`} glyph={r.defaults ? "滞" : "済"} />);
    } catch (e) {
      mineOut.error(e);
    } finally {
      setChecking(false);
    }
  };

  const issue = async () => {
    try {
      if (chainState.successorOnBoard) throw new Error("your history on the board is ahead of this device; restore your certificates before issuing a new one");
      const invoice = hInv.current!.value.trim();
      const fin = hFin.current!.value.trim();
      const hist = await loadHistory();
      const next = localNextIndex(hist);
      const { cert, k } = await withInvoiceIndex(invoice, (m, k) => {
        if (k !== next) {
          m.fill(0);
          throw new Error(`this invoice is #${k} in your history, but the next certificate is #${next}`);
        }
        return { cert: wasm.buyerHistoryCertBytes(m, k, invoice, fin, head(hist)), k };
      });
      await saveHistory(append(hist, k, cert));
      histOut.show(<CodeBlock label={`Certificate #${k}: give it to the financier (this device keeps a copy)`} value={cert} filename={`history-${k}.cert.txt`} />);
    } catch (e) {
      histOut.error(e);
    }
  };

  const anchored = key?.anchored ?? null;
  const nextCert = key?.k ?? certs.length;
  const anchorLine = (i: number) => (anchored === null ? (outcomes && outcomes[i] ? "on the board" : "not checked yet") : i < anchored ? "anchored" : "not anchored yet");
  // the signed invoices a certificate can be issued for, newest first
  const signed = list.filter((r) => r.signature && !r.history_cert);

  return (
    <Page wide>
      <div className="rp by" ref={root}>
        <section className="rp-sec" aria-labelledby="by-th">
          <div className="rp-cap">
            <Tag k="歴" section="History" />
            <h1 id="by-th">History</h1>
            <p className="rp-lede">What a financier sees when you send your history: each invoice you financed, anchored on the board, and whether you paid it on time.</p>
            <div className="actions">
              <button type="button" disabled={checking} onClick={() => void checkMine()}>
                {checking ? "Checking…" : "Check my history"}
              </button>
            </div>
            {mineOut.el}
            <details className="by-fold">
              <summary>
                <b lang="ja">証</b>Issue a certificate by hand
              </summary>
              <div>
                <p className="hint">Financiers check your full payment history before financing. Each certificate links to the previous one, which this device keeps for you, and is anchored on the board, so a history cannot be trimmed. A financier's request in your inbox issues it for you.</p>
                <div className="rp-panel">
                  {signed.length ? (
                    <label className="field">
                      <span>Invoice</span>
                      <select defaultValue="" onChange={(e) => hInv.current && (hInv.current.value = signed.find((r) => r.n === e.currentTarget.value)?.invoice ?? "")}>
                        <option value="">Pick one of your signed invoices</option>
                        {signed.map((r) => (
                          <option key={r.n} value={r.n}>{`${r.invoice_id} · ${zatToZec(r.amount_zat)} ZEC · due ${daysToDate(r.due_date)}`}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="field">
                    <span>{signed.length ? "Or paste the invoice code" : "Invoice code"}</span>
                    <textarea spellCheck="false" autoCapitalize="none" autoCorrect="off" ref={hInv} />
                  </label>
                  <label className="field">
                    <span>Financier key</span>
                    <input type="text" placeholder="the financier's key, as its letter or card gives it" spellCheck="false" autoCapitalize="none" autoCorrect="off" autoComplete="off" ref={hFin} />
                  </label>
                  <div className="actions">
                    <button type="button" className="secondary" disabled={chainState.successorOnBoard} onClick={() => void issue()}>
                      Issue certificate
                    </button>
                  </div>
                  {histOut.el}
                </div>
              </div>
            </details>
          </div>

          <div className="by-chain" ref={chain}>
            {shown ? <DidLine did={shown} /> : null}
            {requests.map((l) => (
              <Branch key={l.r.relayId} l={l} onSent={(said) => setAnswered((a) => [...a, { id: l.r.relayId, said }])} />
            ))}
            {answered.map((a) => (
              <Branch key={a.id} said={a.said} />
            ))}
            <div className="by-chain-scroll" ref={chainScroll}>
              <ol className="by-certs" aria-label="Your history certificates, oldest first">
                {certs.map((c, j) => {
                  const o = outcomes?.[c.index];
                  const [g, word, cls] = o ? (OUTCOME[o] ?? ["待", o, "is-open"]) : ["待", "not checked yet", "is-open"];
                  const inv = list.find((r) => r.n === c.nullifier);
                  return (
                    <li key={c.index}>
                      <article className={`by-cert ${cls}`} aria-label={`Certificate ${c.index}`} data-v={`--d:${j * 67}ms`}>
                        <b lang="ja">証明書</b>
                        <strong>{`#${c.index}`}</strong>
                        <span>{`${inv ? inv.invoice_id : "an invoice not on this device"} · due ${daysToDate(c.due_date)}`}</span>
                        <span>{`${zatToZec(c.amount_zat)} ZEC · links to ${c.index ? `#${c.index - 1}` : "the start"}`}</span>
                        <span className="by-out">
                          <span className="rp-hanko" lang="ja" aria-hidden="true">
                            {g}
                          </span>
                          {word}
                        </span>
                      </article>
                      <div className={`by-anchor${anchored !== null && c.index >= anchored ? " is-loose" : ""}`} data-v={`--d:${200 + j * 67}ms`} />
                    </li>
                  );
                })}
                <li className="is-next-li">
                  <article className="by-cert is-next" aria-label="Your next certificate">
                    <b lang="ja">次</b>
                    <strong>{`#${nextCert}`}</strong>
                    <span>{certs.length ? "Your next certificate. Issued when a financier finances your next invoice." : "Your first certificate. Issued when a financier finances your first invoice."}</span>
                  </article>
                  <div className="by-anchor is-loose" />
                </li>
              </ol>
              <div className="by-board">
                <div className="by-board-in">
                  <b lang="ja">公開台帳</b>
                  <p>
                    {board ? `${boardLine(board)}. ` : "Public board: not read yet. "}
                    Each certificate's anchor, nothing about who.
                  </p>
                </div>
                <div className="by-board-rows" aria-hidden="true">
                  {certs.map((c) => (
                    <span key={c.index} className={anchorLine(c.index) === "anchored" || anchorLine(c.index) === "on the board" ? undefined : "is-next"}>
                      <b>{`anchor #${c.index}`}</b>
                      {anchorLine(c.index)}
                    </span>
                  ))}
                  <span className="is-next">
                    <b>—</b>
                    nothing yet
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
