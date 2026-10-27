// The in-app QR scanner (2026-10-27): "Scan a QR" where the app takes a code people hand over as
// a QR (a contact link or card), so nobody needs the phone's own camera app. A full-screen sheet:
// the back camera (getUserMedia, facingMode environment) behind a viewfinder, the torch when the
// camera has one, "Use a photo instead" (a photo or a saved picture) and "Paste instead". Read
// with the browser's BarcodeDetector when it has one, else jsQR (loaded only when the sheet
// opens) on a canvas, 10 frames a second. The camera stops on close, on success and while the
// page is hidden. What it read goes to `onRead`, the paste field's own reader: a ScanRefused
// from it is said on the sheet and the camera keeps looking; anything else closes the sheet.
// Styles: src/app/qr.css.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cameraTrouble, SCAN_FPS, scanScale, ScanRefused } from "../lib/scan";
import { dismissSheet, useBackCloses } from "./sheet";
import "./qr.css";

/** Reads the first QR in a frame or picture of `w` × `h`, or null. */
type Decode = (src: CanvasImageSource, w: number, h: number) => Promise<string | null>;

interface Detector {
  detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorClass = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

/** The browser's own QR reader, else jsQR on a canvas (its chunk loads here, on first use). */
async function makeDecoder(max: number, both: boolean): Promise<Decode> {
  const BD = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (BD) {
    try {
      if ((await BD.getSupportedFormats()).includes("qr_code")) {
        const d = new BD({ formats: ["qr_code"] });
        return async (src) => (await d.detect(src))[0]?.rawValue ?? null;
      }
    } catch {
      /* no usable detector: jsQR below */
    }
  }
  const jsQR = (await import("jsqr")).default;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return async (src, w, h) => {
    const s = scanScale(w, h, max);
    c.width = s.w;
    c.height = s.h;
    ctx.drawImage(src, 0, 0, s.w, s.h);
    const img = ctx.getImageData(0, 0, s.w, s.h);
    return jsQR(img.data, s.w, s.h, { inversionAttempts: both ? "attemptBoth" : "dontInvert" })?.data ?? null;
  };
}

type View = { k: "start" } | { k: "live"; torch: boolean | null } | { k: "trouble"; title: string; text: string };

export function ScanSheet({ open, onClose, onRead, onPaste, what }: { open: boolean; onClose: () => void; onRead: (text: string) => void; onPaste?: () => void; what: string }): ReactNode {
  const dlg = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const picture = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>({ k: "start" });
  const [said, setSaid] = useState<string | null>(null);
  const live = useRef<{ stream: MediaStream | null; timer: number; run: number; refused: string }>({ stream: null, timer: 0, run: 0, refused: "" });
  // the caller's callbacks change on every render; the camera loop reads them here, so a render
  // of the page under the sheet never restarts the camera
  const cb = useRef({ onRead, onClose });
  cb.current = { onRead, onClose };
  useBackCloses(open, onClose);

  const stop = useCallback(() => {
    const l = live.current;
    l.run++;
    window.clearTimeout(l.timer);
    l.stream?.getTracks().forEach((t) => t.stop());
    l.stream = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  /** What was read: the field's reader decides; a refusal is said and the camera keeps looking. */
  const take = useCallback(
    (text: string): boolean => {
      try {
        cb.current.onRead(text);
      } catch (e) {
        live.current.refused = text;
        setSaid(e instanceof ScanRefused || e instanceof Error ? e.message : String(e));
        return false;
      }
      navigator.vibrate?.(40);
      stop();
      dismissSheet(cb.current.onClose);
      return true;
    },
    [stop],
  );

  const start = useCallback(async () => {
    stop();
    const run = live.current.run;
    setView({ k: "start" });
    if (!navigator.mediaDevices?.getUserMedia) return setView({ k: "trouble", ...cameraTrouble("NoMediaDevices") });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      if (run === live.current.run) setView({ k: "trouble", ...cameraTrouble(e instanceof DOMException ? e.name : "") });
      return;
    }
    if (run !== live.current.run) return stream.getTracks().forEach((t) => t.stop());
    live.current.stream = stream;
    const v = video.current!;
    v.srcObject = stream;
    try {
      await v.play();
    } catch {
      /* muted and inline: plays on iOS too; a refusal leaves the frame still */
    }
    const track = stream.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    setView({ k: "live", torch: caps.torch ? false : null });
    const decode = await makeDecoder(720, false);
    const tick = async () => {
      if (run !== live.current.run) return;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          const t = await decode(v, v.videoWidth, v.videoHeight);
          if (run !== live.current.run) return;
          if (t && t !== live.current.refused && take(t)) return;
        } catch {
          /* a frame that could not be read: the next one */
        }
      }
      live.current.timer = window.setTimeout(() => void tick(), 1000 / SCAN_FPS);
    };
    void tick();
  }, [stop, take]);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
      setSaid(null);
      live.current.refused = "";
      void start();
      // the camera stops while the page is hidden, and comes back with it
      const vis = () => (document.hidden ? stop() : void start());
      document.addEventListener("visibilitychange", vis);
      return () => {
        document.removeEventListener("visibilitychange", vis);
        stop();
      };
    }
    if (d.open) d.close();
    stop();
  }, [open, start, stop]);

  const torch = async (on: boolean) => {
    const track = live.current.stream?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setView({ k: "live", torch: on });
    } catch {
      setView({ k: "live", torch: null });
    }
  };

  const fromPicture = async (f: File | undefined) => {
    if (!f) return;
    setSaid(null);
    try {
      const bmp = await createImageBitmap(f);
      const t = await (await makeDecoder(1024, true))(bmp, bmp.width, bmp.height);
      bmp.close();
      if (!t) return setSaid("No QR found in this picture. Take it again with the whole code in the frame, sharp and not too close.");
      live.current.refused = "";
      take(t);
    } catch {
      setSaid("This picture could not be opened. Try another photo, or paste the link.");
    }
  };

  const close = () => {
    stop();
    dismissSheet(onClose);
  };

  return (
    <dialog
      className="qrs"
      ref={dlg}
      aria-labelledby="qrs-h"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <video className={`qrs-video${view.k === "live" ? " is-on" : ""}`} ref={video} muted playsInline autoPlay aria-hidden="true" />
      <div className="qrs-in">
        <header className="qrs-head">
          <h2 id="qrs-h">Scan a QR</h2>
          <button type="button" className="qrs-x" aria-label="Close" onClick={close}>
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </header>
        {view.k === "trouble" ? (
          <div className="qrs-trouble" role="alert">
            <span className="qrs-hanko" lang="ja" aria-hidden="true">
              拒
            </span>
            <strong>{view.title}</strong>
            <p>{view.text}</p>
            <button type="button" className="qrs-pill" onClick={() => void start()}>
              Try the camera again
            </button>
          </div>
        ) : (
          <div className="qrs-finder" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span className="qrs-sweep" />
          </div>
        )}
        <p className="qrs-say" role="status" aria-live="polite">
          {said ?? (view.k === "start" ? "Opening the camera…" : view.k === "live" ? `Point the camera at ${what}.` : "")}
        </p>
        <div className="qrs-acts">
          {view.k === "live" && view.torch !== null ? (
            <button type="button" className={`qrs-pill${view.torch ? " is-on" : ""}`} aria-pressed={view.torch} onClick={() => void torch(!view.torch)}>
              {view.torch ? "Torch off" : "Torch on"}
            </button>
          ) : null}
          <button type="button" className="qrs-pill" onClick={() => photo.current?.click()}>
            Use a photo instead
          </button>
          <button type="button" className="qrs-pill is-quiet" onClick={() => picture.current?.click()}>
            Pick a saved picture
          </button>
          {onPaste ? (
            <button
              type="button"
              className="qrs-pill is-quiet"
              onClick={() => {
                close();
                // after the dialog has closed and handed focus back to its opener
                window.setTimeout(onPaste, 60);
              }}
            >
              Paste instead
            </button>
          ) : null}
        </div>
        <input
          className="qrs-file"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          ref={photo}
          onChange={(e) => {
            void fromPicture(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          className="qrs-file"
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          ref={picture}
          onChange={(e) => {
            void fromPicture(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </dialog>
  );
}

/** A "Scan a QR" button and its sheet. */
export function ScanButton({ onRead, onPaste, what, label = "Scan a QR", secondary = true }: { onRead: (text: string) => void; onPaste?: () => void; what: string; label?: string; secondary?: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={`qrs-open${secondary ? " secondary" : ""}`} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2 7V3.5A1.5 1.5 0 0 1 3.5 2H7M13 2h3.5A1.5 1.5 0 0 1 18 3.5V7M18 13v3.5a1.5 1.5 0 0 1-1.5 1.5H13M7 18H3.5A1.5 1.5 0 0 1 2 16.5V13M2 10h16" />
        </svg>
        {label}
      </button>
      <ScanSheet open={open} onClose={close} onRead={onRead} onPaste={onPaste} what={what} />
    </>
  );
}
