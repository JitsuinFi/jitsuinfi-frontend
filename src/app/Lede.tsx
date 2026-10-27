// A lede or hint that is longer than two lines on a phone (audit 2026-10-27, finding 15; DS-MOB P4):
// it shows two lines and a "More" button that opens the rest in place. Wider screens and short
// texts show everything, with no button. Shared by the app and the console (lede.css is its own).
import "./lede.css";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePhone } from "./phone";

export function Lede({ className, children }: { className: string; children: ReactNode }): ReactNode {
  const phone = usePhone();
  const el = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const p = el.current;
    if (!p || !phone || open) return;
    const check = () => setLong(p.scrollHeight > p.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(p);
    return () => ro.disconnect();
  }, [phone, open, children]);
  const clamp = phone && !open;
  return (
    <>
      <p className={`${className}${clamp ? " is-clamped" : ""}`} ref={el}>
        {children}
      </p>
      {phone && long && !open ? (
        <button type="button" className="lede-more" onClick={() => setOpen(true)}>
          More
        </button>
      ) : null}
    </>
  );
}
