// "Skip to the page" (nav audit 2026-10-25): the first stop of the keyboard in every world (the app
// shell, the landing, the console), a seal pill that shows only while it has focus. It moves the
// focus past the bar and its nav to the page's own start, without a hash in the address (the
// router and the old #/ links read the hash).
import "./skip.css";
import type { MouseEvent, ReactNode } from "react";

/** `target`: the id of the element the page starts at (it needs tabIndex -1). */
export function SkipLink({ target, className = "skip" }: { target: string; className?: string }): ReactNode {
  const go = (e: MouseEvent) => {
    const el = document.getElementById(target);
    if (!el) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start" });
  };
  return (
    <a className={className} href={`#${target}`} onClick={go}>
      Skip to the page
    </a>
  );
}
