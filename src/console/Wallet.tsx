// The node's wallet (wave 5): what it holds, what it can spend now, whose money it is, how to top
// it up, and what moved lately; the financier never needs a terminal for it. The top-up QR is the
// app's shared plate (QrPlate); its drawing comes from the wasm, loaded only here, so the rest of
// the console stays small. A node from before `/node/console/wallet` says so in words.
import { createContext, useEffect, useState, type ReactNode } from "react";
import { QrPlate } from "../app/QrPlate";
import { CopyButton, Stamp } from "./bits";
import { agoSec, short, zec } from "./model";
import { KIND_WORDS, txUrl, type Wallet, type WalletView } from "./wallet-model";

/** The wallet as the desk last read it, for the deal paper's pay preflight. */
export const WalletCtx = createContext<WalletView>(null);

/** The wasm's QR drawing of `text` (the wasm loads on first use, here only). */
export function useQrSvg(text: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSvg(null);
    if (!text) return;
    void import("../wasm/jitsuin_wasm.js").then(async (m) => {
      await m.default();
      if (live) setSvg(m.qrSvg(text));
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [text]);
  return svg;
}

/** The top-up plate: the node's address as a QR, its copy, and the address in words. */
export function TopUp({ w, caption }: { w: Wallet; caption?: string }): ReactNode {
  const svg = useQrSvg(w.topup_uri || w.topup_address || null);
  return (
    <div className="cs-topup">
      <QrPlate
        svg={svg}
        text={w.topup_uri || w.topup_address}
        caption={caption ?? "Top up the node's wallet"}
        file="jitsuinfi-node-topup"
        copyLabel="Copy payment link"
        wallet
        shareTitle="Top up the node's wallet"
        veil={{ glyph: "入", text: "Drawing the QR…" }}
      />
      <p className="cs-topup-addr">
        <span>Address</span> <span className="is-mono" title={w.topup_address}>{short(w.topup_address)}</span> <CopyButton className="cs-tx-copy" label="Copy address" value={w.topup_address} />
      </p>
    </div>
  );
}

export function WalletSection({ wallet }: { wallet: WalletView }): ReactNode {
  return (
    <section className="cs-sec" id="wallet" aria-labelledby="cs-wallet-t">
      <div className="cs-cap">
        <p className="cs-eyebrow">
          <Stamp k="財" />
          The node pays advances from it
        </p>
        <h2 id="cs-wallet-t">Wallet</h2>
        {wallet === null ? (
          <p className="cs-note">Reading the node's wallet…</p>
        ) : wallet === "missing" ? (
          <p className="cs-note">Update the node to see its wallet here: this node does not show it to the console yet.</p>
        ) : (
          <>
            <p className="cs-wal-bal">
              <span className="is-mono">{zec(wallet.balance_zat)}</span> <small>ZEC</small>
            </p>
            <dl className="cs-totals is-tight" aria-label="The wallet at a glance">
              <div className="is-act">
                <dt>can be spent now</dt>
                <dd className="is-mono">{zec(wallet.spendable_zat)}</dd>
              </div>
              <div>
                <dt>waiting for confirmations</dt>
                <dd className="is-mono">{zec(wallet.pending_zat)}</dd>
              </div>
              {wallet.fund_cash_zat !== null ? (
                <>
                  <div>
                    <dt>Fund members' money</dt>
                    <dd className="is-mono">{zec(wallet.fund_cash_zat)}</dd>
                  </div>
                  <div>
                    <dt>Your own money</dt>
                    <dd className="is-mono">{zec(wallet.own_zat ?? Math.max(0, wallet.balance_zat - wallet.fund_cash_zat))}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <p className="cs-sub">{`Each payment from this wallet adds a network fee of about ${zec(wallet.fee_zat)} ZEC.${wallet.synced_at ? ` Read from the chain ${agoSec(wallet.synced_at)}.` : ""}`}</p>
          </>
        )}
      </div>
      {wallet && wallet !== "missing" ? (
        <div className="cs-vis cs-wal">
          <TopUp w={wallet} />
          <h3 className="cs-wal-h">Recent transactions</h3>
          {wallet.txs.length ? (
            <ul className="cs-wal-txs">
              {wallet.txs.map((t) => (
                <li key={t.txid + t.kind}>
                  <span className="cs-wal-kind">{KIND_WORDS[t.kind] ?? KIND_WORDS.other}</span>
                  <span className={`cs-wal-d is-mono${t.delta_zat < 0 ? " is-out" : " is-in"}`}>{`${t.delta_zat < 0 ? "−" : "+"}${zec(Math.abs(t.delta_zat))} ZEC`}</span>
                  <span className="cs-wal-tx">
                    <a className="cs-link is-mono" href={txUrl(t.txid)} target="_blank" rel="noopener noreferrer" title={t.txid}>
                      {short(t.txid)}
                    </a>
                    <small>{t.height ? `block ${t.height.toLocaleString("en")}` : "not mined yet"}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cs-note">No transactions yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
