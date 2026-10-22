// Landing entry. Lenis carries the scroll (off on reduced motion); chapters mount in order.
import "./tokens.css";
import "./landing.css";
import Lenis from "lenis";
import { mountHero } from "./hero";
import { mountFingerprint } from "./fingerprint";
import { reducedMotion } from "./motion";

/** Mounts the chapters into `root` (HNK-31: called by the Landing route). */
export function mountLanding(root: HTMLElement): void {
  const reduced = reducedMotion();
  mountHero(root, reduced);

  // Chapters land here one at a time, each after it is validated.
  mountFingerprint(root, reduced);
  // chapters 3 – 6 (SealChain, Twice, History, Finale) are React components since HNK-31.T4, drawn after these by Landing

  if (!reduced) {
    const lenis = new Lenis({ duration: 1.2 });
    const raf = (t: number) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }
}
