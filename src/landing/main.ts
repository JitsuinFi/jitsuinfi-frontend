// Landing entry. Lenis carries the scroll (off on reduced motion); chapters mount in order.
import "./tokens.css";
import "./landing.css";
import Lenis from "lenis";
import { mountHero } from "./hero";
import { reducedMotion } from "./motion";

const root = document.getElementById("landing");
if (root) {
  const reduced = reducedMotion();
  mountHero(root, reduced);

  // Chapters 2–7 land here, one at a time after each is validated.
  const story = document.createElement("div");
  story.id = "story";
  story.className = "story-anchor";
  root.append(story);

  if (!reduced) {
    const lenis = new Lenis({ duration: 1.2 });
    const raf = (t: number) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }
}
