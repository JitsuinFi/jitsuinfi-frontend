// The pitch video: a modal over the landing. The native <dialog> gives the focus trap, Esc and the
// return of focus to the button; the YouTube player is mounted only while it is open, so the page
// makes no request to YouTube until the viewer asks, and closing it stops the video.
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "./use-lang";

const PITCH_ID = "RB9hKSLarJo";
// the privacy-enhanced host; the referrer policy is set on the frame because the page sends none,
// and YouTube refuses to play an embed that arrives with no referrer
const EMBED = `https://www.youtube-nocookie.com/embed/${PITCH_ID}?autoplay=1&rel=0&playsinline=1`;

export function PitchDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) {
      d.showModal();
      // start on the card, not on the close button, so no focus ring greets the viewer
      card.current?.focus({ preventScroll: true });
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      className="pitch"
      ref={dialog}
      aria-labelledby="pitch-title"
      data-lenis-prevent
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="pitch-card" tabIndex={-1} ref={card}>
        <div className="pitch-head">
          <h2 className="pitch-title" id="pitch-title">
            {t("pitch.title")}
          </h2>
          <button className="pitch-close" type="button" aria-label={t("pitch.close")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5 19 19M19 5 5 19" />
            </svg>
          </button>
        </div>
        <div className="pitch-frame">
          {open ? (
            <iframe
              src={EMBED}
              title={t("pitch.frame")}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
        <a className="pitch-alt" href={`https://youtu.be/${PITCH_ID}`} target="_blank" rel="noreferrer">
          {t("pitch.alt")}
        </a>
      </div>
    </dialog>
  );
}
