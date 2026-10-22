// The landing world (HNK-31.T2 – T4): <div id="landing"> on <body class="landing">, as index.html
// had it. Chapters that are still DOM builders mount first (src/landing/main.ts); the chapters
// written as components follow them inside the same root, in chapter order.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Finale } from "../landing/Finale";
import { History } from "../landing/History";
import { mountLanding } from "../landing/main";
import { reducedMotion } from "../landing/motion";

export function Landing(): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState<HTMLElement | null>(null);
  const reduced = useRef(reducedMotion()).current;
  useLayoutEffect(() => {
    if (mounted || !root.current) return;
    document.body.classList.add("landing");
    document.title = "JitsuinFi";
    mountLanding(root.current);
    setMounted(root.current);
  }, [mounted]);
  return (
    <div id="landing" ref={root}>
      {mounted
        ? createPortal(
            <>
              <History reduced={reduced} />
              <Finale reduced={reduced} />
            </>,
            mounted,
          )
        : null}
    </div>
  );
}
