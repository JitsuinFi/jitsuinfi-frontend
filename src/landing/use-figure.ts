// A chapter's isometric figure, loaded lazily (HNK-33.T7). The markup (figures/*.svg, ~130-190 KB
// each) and its controller come as their own chunks once the chapter comes near, as the wasm does,
// and the hero's first load never fetches them. The figure is inserted into its host and mounted
// once both are in, and again if reduced motion changes; `ready()` hands out the mounted figure, so
// a round never runs against a figure that is not there yet.
import { useEffect, useRef, useState, type RefObject } from "react";

type Figure = { destroy(): void };

/**
 * `near`: the element whose approach starts the load. `load`: the figure's markup and controller
 * module, as two dynamic imports. `mount`: the controller's mount on the inserted <svg>.
 * `mounted`: runs right after each mount (labels, state the figure must show from the start).
 */
export function useFigure<M, F extends Figure>(
  near: RefObject<Element | null>,
  host: RefObject<HTMLElement | null>,
  reduced: boolean,
  load: () => Promise<readonly [{ default: string }, M]>,
  mount: (svg: SVGSVGElement, m: M) => F,
  mounted?: (f: F) => void,
): { fig: RefObject<F | null>; ready: () => Promise<F> } {
  const fig = useRef<F | null>(null);
  const [wanted, setWanted] = useState(false);
  const waiting = useRef<((f: F) => void)[]>([]);
  // the latest closures: a mount sees the chapter's state as it is when the chunks arrive
  const calls = useRef({ load, mount, mounted });
  calls.current = { load, mount, mounted };

  // the chunks load as the chapter comes near (the same margin as the wasm's), but never with the
  // hero's first load: chapter 2 starts right under the hero, so a page opened at the top waits for
  // the first scroll
  useEffect(() => {
    const want = () => setWanted(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (scrollY > 0) want();
        else addEventListener("scroll", want, { once: true, passive: true });
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(near.current!);
    return () => {
      io.disconnect();
      removeEventListener("scroll", want);
    };
  }, [near]);

  // the figure: inserted once loaded, moved by its controller; never into a host that has moved on
  useEffect(() => {
    if (!wanted) return;
    const el = host.current!;
    let live = true;
    let f: F | null = null;
    void calls.current.load().then(([svg, m]) => {
      if (!live) return;
      el.innerHTML = svg.default;
      f = calls.current.mount(el.querySelector("svg")!, m);
      fig.current = f;
      calls.current.mounted?.(f);
      for (const go of waiting.current.splice(0)) go(f);
    });
    return () => {
      live = false;
      if (!f) return;
      f.destroy();
      fig.current = null;
      el.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, reduced]);

  /** The mounted figure, as soon as it is there. */
  const ready = () => (fig.current ? Promise.resolve(fig.current) : new Promise<F>((go) => waiting.current.push(go)));
  return { fig, ready };
}
