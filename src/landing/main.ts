// Landing entry. Lenis carries the scroll (off on reduced motion); chapters mount in order.
import "./tokens.css";
import "./landing.css";
import Lenis from "lenis";
import { mountHero } from "./hero";
import { mountFingerprint } from "./fingerprint";
import { mountSealChain } from "./sealchain";
import { mountTwice } from "./twice";
import { reducedMotion } from "./motion";

const root = document.getElementById("landing");
if (root) {
  const reduced = reducedMotion();
  mountHero(root, reduced);

  // Chapters land here one at a time, each after it is validated.
  mountFingerprint(root, reduced);
  mountSealChain(root, reduced);
  mountTwice(root, reduced);

  if (!reduced) {
    const lenis = new Lenis({ duration: 1.2 });
    const raf = (t: number) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }
}
