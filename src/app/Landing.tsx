// The landing world (HNK-31.T4): six chapters as components inside <div id="landing"> on
// <body class="landing">, as index.html had it, in one <main> after the skip link. Lenis carries
// the scroll (off on reduced motion).
import "../landing/tokens.css";
import "../landing/landing.css";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Lenis from "lenis";
import { Finale } from "../landing/Finale";
import { Fingerprint } from "../landing/Fingerprint";
import { Hero } from "../landing/Hero";
import { History } from "../landing/History";
import { reducedMotion } from "../landing/motion";
import { PitchDialog } from "../landing/PitchDialog";
import { SealChain } from "../landing/SealChain";
import { Twice } from "../landing/Twice";
import { SkipLink } from "./SkipLink";

export function Landing(): ReactNode {
  const reduced = useRef(reducedMotion()).current;
  const [pitchOpen, setPitchOpen] = useState(false);
  useLayoutEffect(() => {
    document.body.classList.add("landing");
    document.title = "JitsuinFi";
  }, []);
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.2 });
    let raf = requestAnimationFrame(function step(t) {
      lenis.raf(t);
      raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);
  return (
    <div id="landing">
      {/* past the nav, to the hero's copy (nav audit 2026-10-25) */}
      <SkipLink target="page-start" />
      <main>
        <Hero reduced={reduced} pitchOpen={pitchOpen} onPitch={() => setPitchOpen(true)} />
        <Fingerprint reduced={reduced} />
        <SealChain reduced={reduced} />
        <Twice reduced={reduced} />
        <History reduced={reduced} />
        <Finale reduced={reduced} />
      </main>
      <PitchDialog open={pitchOpen} onClose={() => setPitchOpen(false)} />
    </div>
  );
}
