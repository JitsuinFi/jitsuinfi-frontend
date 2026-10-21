// Motion helpers for the 登記所 counter (MASTER.md §8): the landing's eases and durations,
// awaited one after another so a choreography reads like the steps it shows.
import { animate } from "animejs";
import { dur, ease } from "../../landing/motion";

export { dur, ease };

export const still = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

const fn = (f: (t: number) => number) => () => f;

type Params = Record<string, unknown>;

/** Runs an anime.js animation and resolves when it ends (at once under reduced motion). */
export function run(targets: Element | Element[] | object, params: Params, curve: (t: number) => number = ease.softLand): Promise<void> {
  if (still()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    animate(targets as HTMLElement, { ease: fn(curve), ...params, onComplete: () => resolve() } as never);
  });
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, still() ? 0 : ms));

/** Animates one number from `from` to `to`, calling `set` on every frame. */
export function tween(from: number, to: number, ms: number, set: (v: number) => void, curve: (t: number) => number = ease.softInOut): Promise<void> {
  if (still()) {
    set(to);
    return Promise.resolve();
  }
  const o = { v: from };
  return new Promise((resolve) => {
    animate(o, { v: to, duration: ms, ease: fn(curve), onUpdate: () => set(o.v), onComplete: () => resolve() } as never);
  });
}

/** The rectangle of `el` in the coordinates of `host`. */
export function rectIn(el: Element, host: Element): { x: number; y: number; w: number; h: number } {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}
