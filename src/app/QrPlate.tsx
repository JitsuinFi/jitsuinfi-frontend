// One QR for the whole app (2026-10-27): the contact link on Contacts, the buyer's 払込票 payment
// slip, the member's 入金票 deposit slip. The wasm's drawing is read back into modules
// (lib/qr.ts) and drawn here: an exact 4-module quiet zone of sheet, the palette's ink, a whole
// number of CSS pixels a module (crisp, never stretched; at most 280 px on a phone, 240 wider),
// centred on a sheet plate in a thin seal-red frame, a one-line caption of what it is and the
// readable fingerprint under it. One row of actions: Copy, Save PNG, Share (Web Share API when
// the browser has it), Enlarge (a full-screen sheet with a brightness hint; Back closes it). A
// payment opens in the wallet first ("Open in wallet"; on a phone above the QR, as nobody scans
// their own screen). The raw text waits behind "Show the link". Styles: src/app/qr.css.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { parseQrSvg, qrFit, qrPath, qrPixels, qrSpan, QR_CAP, type QrGrid } from "../lib/qr";
import { dismissSheet, useBackCloses } from "./sheet";
import { usePhone } from "./phone";
import { CodeBlock } from "./ui";
import { Dock } from "./Dock";
import "./qr.css";

const INK: [number, number, number] = [0x02, 0x0d, 0x2f]; // --head, Cetacean
const SHEET: [number, number, number] = [0xfc, 0xfc, 0xfe]; // --sheet

/** The code as an SVG of `px` CSS pixels, in module units. */
function QrSvg({ g, px, label }: { g: QrGrid; px: number; label: string }): ReactNode {
  const span = qrSpan(g);
  const d = useMemo(() => qrPath(g), [g]);
  return (
    <svg className="qrp-code" width={px} height={px} viewBox={`0 0 ${span} ${span}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect className="qrp-sheet" width={span} height={span} />
      <path className="qrp-ink" d={d} />
    </svg>
  );
}

/** Width of `el`'s content box, followed as it changes. */
function useWidth(el: RefObject<HTMLElement | null>, fallback: number): number {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const read = () => setW(Math.floor(node.clientWidth) || fallback);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [el, fallback]);
  return w;
}

/** The QR as a PNG file: 6 to 12 pixels a module, quiet zone included. */
async function pngOf(g: QrGrid): Promise<Blob> {
  const scale = Math.max(6, Math.min(12, Math.ceil(720 / qrSpan(g))));
  const { size, data } = qrPixels(g, scale, INK, SHEET);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d")!.putImageData(new ImageData(data, size, size), 0, 0);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("this browser could not make the picture"))), "image/png"));
}

function saveBlob(name: string, b: Blob): void {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface QrPlateProps {
  /** The wasm's QR drawing; null draws the waiting plate (`veil`) at the same place. */
  svg: string | null;
  /** What the QR holds: copied, shared, and shown behind "Show the link". */
  text: string;
  /** One line of what it is: "Your contact · @name", "Pay 0.0009 ZEC to the financier". */
  caption: string;
  /** The readable fingerprint under it, and its label. */
  print?: { label: string; value: string };
  /** File name of the PNG, without .png. */
  file: string;
  copyLabel?: string;
  /** A zcash: payment: "Open in wallet" comes first. */
  wallet?: boolean;
  /** Share it as a link (a contact link) rather than as text (a payment request). */
  shareAsUrl?: boolean;
  shareTitle: string;
  /** The words and glyph of the waiting plate. */
  veil?: { glyph: string; text: string };
  /** "Show the link": its label and the .txt download it offers. */
  raw?: { label: string; filename?: string };
  /** The plate's primary is the screen's: on a phone it rides in the bottom bar (Dock.tsx). */
  dock?: boolean;
}

export function QrPlate(p: QrPlateProps): ReactNode {
  const phone = usePhone();
  const cap = phone ? QR_CAP.phone : QR_CAP.wide;
  const box = useRef<HTMLDivElement>(null);
  const avail = useWidth(box, cap + 24);
  const g = useMemo(() => {
    try {
      return p.svg ? parseQrSvg(p.svg) : null;
    } catch {
      return null;
    }
  }, [p.svg]);
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => setCopied(false), [p.text]);
  // the plate's frame, 1.5 px a side: the quiet zone inside is the code's own, no padding added
  const fit = g ? qrFit(qrSpan(g), avail - 3, cap) : null;
  const canShare = typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.text);
      setCopied(true);
      setSaid(null);
    } catch {
      setSaid("This browser did not allow copying. Open Show the link and copy it from there.");
    }
  };
  const share = async () => {
    try {
      const file = g ? new File([await pngOf(g)], `${p.file}.png`, { type: "image/png" }) : null;
      const data: ShareData = p.shareAsUrl ? { title: p.shareTitle, url: p.text } : { title: p.shareTitle, text: p.text };
      if (file && !p.shareAsUrl && navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch {
      /* closed, or not allowed: nothing to say */
    }
  };
  const save = async () => {
    if (!g) return;
    try {
      saveBlob(`${p.file}.png`, await pngOf(g));
    } catch (e) {
      setSaid(e instanceof Error ? e.message : String(e));
    }
  };
  const open = g && p.wallet;
  // one primary a screen (DS-MOB P2): a phone opens a payment in its wallet; wider, the button
  // that drew the payment QR stays the screen's primary and these stay secondary; a contact link
  // is copied
  const primary: "open" | "copy" | null = open ? (phone ? "open" : null) : "copy";
  return (
    <figure className={`qrp${open ? " has-wallet" : ""}${g ? " is-on" : ""}`} ref={box}>
      {g && fit ? (
        <div className="qrp-plate" key={p.svg}>
          <QrSvg g={g} px={fit.px} label={p.caption} />
        </div>
      ) : (
        <div className="qrp-plate is-veil" aria-hidden={p.veil ? undefined : "true"}>
          <span className="qrp-veil">
            <b lang="ja" aria-hidden="true">
              {p.veil?.glyph ?? "待"}
            </b>
            {p.veil ? <small>{p.veil.text}</small> : null}
          </span>
        </div>
      )}
      <figcaption className="qrp-cap">
        <strong>{p.caption}</strong>
        {p.print?.value ? (
          <span>
            {`${p.print.label} `}
            <code>{p.print.value}</code>
          </span>
        ) : null}
      </figcaption>
      {g ? (
        <div className="qrp-acts">
          {open ? (
            primary === "open" && p.dock ? (
              <Dock label="Pay">
                <a className="qrp-btn is-primary" href={p.text}>
                  Open in wallet
                </a>
              </Dock>
            ) : (
              <a className={primary === "open" ? "qrp-btn is-primary" : "qrp-btn is-quiet"} href={p.text}>
                Open in wallet
              </a>
            )
          ) : null}
          {primary === "copy" && p.dock ? (
            <Dock label="Share">
              <button type="button" className="qrp-btn is-primary" onClick={() => void copy()}>
                {copied ? "Copied" : (p.copyLabel ?? "Copy link")}
              </button>
            </Dock>
          ) : (
            <button type="button" className={primary === "copy" ? "qrp-btn is-primary" : "secondary qrp-btn"} onClick={() => void copy()}>
              {copied ? "Copied" : (p.copyLabel ?? "Copy link")}
            </button>
          )}
          <button type="button" className="secondary qrp-btn" onClick={() => void save()}>
            Save PNG
          </button>
          {canShare ? (
            <button type="button" className="secondary qrp-btn" onClick={() => void share()}>
              Share
            </button>
          ) : null}
          <button type="button" className="secondary qrp-btn" onClick={() => setBig(true)}>
            Enlarge
          </button>
        </div>
      ) : null}
      {said ? (
        <p className="qrp-said" role="alert">
          {said}
        </p>
      ) : null}
      {g && p.raw ? (
        <details className="qrp-raw">
          <summary>Show the link</summary>
          <CodeBlock label={p.raw.label} value={p.text} filename={p.raw.filename} />
        </details>
      ) : null}
      {g ? <QrBig open={big} g={g} caption={p.caption} print={p.print} onClose={() => setBig(false)} /> : null}
    </figure>
  );
}

/** The enlarged QR: a full-screen sheet on a phone, a tall one wider; Close, Esc and Back close it. */
function QrBig({ open, g, caption, print, onClose }: { open: boolean; g: QrGrid; caption: string; print?: QrPlateProps["print"]; onClose: () => void }): ReactNode {
  const dlg = useRef<HTMLDialogElement>(null);
  const [room, setRoom] = useState(0);
  useBackCloses(open, onClose);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const fit = () => setRoom(Math.min(window.innerWidth - 32, window.innerHeight - 280, 560));
      fit();
      addEventListener("resize", fit);
      // keep the screen awake while the other person's camera looks at it (where the browser allows)
      let lock: { release(): Promise<void> } | null = null;
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      wl?.request("screen").then((l) => (lock = l)).catch(() => undefined);
      return () => {
        removeEventListener("resize", fit);
        void lock?.release().catch(() => undefined);
      };
    }
    if (!open && d.open) d.close();
  }, [open]);
  const fit = qrFit(qrSpan(g), room, 560);
  return (
    <dialog
      className="qrp-big"
      ref={dlg}
      aria-labelledby="qrp-big-h"
      onCancel={(e) => {
        e.preventDefault();
        dismissSheet(onClose);
      }}
    >
      {open ? (
        <div className="qrp-big-in">
          <header className="qrp-big-head">
            <b lang="ja" aria-hidden="true">
              示
            </b>
            <h2 id="qrp-big-h">Show this QR</h2>
            <button type="button" className="qrp-x" aria-label="Close" onClick={() => dismissSheet(onClose)}>
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </header>
          <div className="qrp-big-body">
            <div className="qrp-plate is-big">
              <QrSvg g={g} px={fit.px} label={caption} />
            </div>
            <p className="qrp-cap">
              <strong>{caption}</strong>
              {print?.value ? (
                <span>
                  {`${print.label} `}
                  <code>{print.value}</code>
                </span>
              ) : null}
            </p>
            <p className="qrp-bright">
              <i lang="ja" aria-hidden="true">
                光
              </i>
              Turn your screen brightness up, then hold the screen still for their camera.
            </p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
