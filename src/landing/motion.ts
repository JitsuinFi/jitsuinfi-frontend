// Motion tokens from MASTER.md: motionmaxxing's exact ease functions and the duration scale.

const guard = (f: (t: number) => number) => (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : f(t));
const expoOut = (k: number) => {
  const d = 1 - Math.exp(-k);
  return (t: number) => (1 - Math.exp(-k * t)) / d;
};
const snapRamp = (w: number, tau: number) => {
  const n = w * (1 - Math.exp(-1 / tau)) + (1 - w);
  return (t: number) => (w * (1 - Math.exp(-t / tau)) + (1 - w) * t) / n;
};
const spring = (c: number, om: number) => {
  const f = (t: number) => 1 - Math.exp(-c * t) * (Math.cos(om * t) + (c / om) * Math.sin(om * t));
  const n = f(1);
  return (t: number) => f(t) / n;
};
const smoothP = (p: number) => (t: number) => {
  const a = Math.pow(t, p);
  const b = Math.pow(1 - t, p);
  return a / (a + b);
};

export const ease = {
  softLand: guard(expoOut(3.41)),
  snapSettle: guard(snapRamp(0.942, 0.118)),
  glide: guard((t) => 1 - Math.pow(1 - t, 1.7)),
  softInOut: guard(smoothP(1.42)),
  accelExit: guard((t) => Math.pow(t, 2.6)),
  popOver: guard(spring(2.67, 4.36)),
  linear: (t: number) => t,
};

export const dur = {
  press: 67,
  micro: 133,
  fade: 200,
  seal: 367,
  enter: 400,
  exit: 433,
  proof: 500,
  sink: 1100,
  bleed: 1200,
  ripple: 1600,
  proofRipple: 2400,
};

/// Uneven sibling stagger (MASTER: 100, 67, 67, 67ms).
export function sibling(i: number): number {
  return i === 0 ? 0 : 100 + (i - 1) * 67;
}

/// Headline word delays: 133–200ms apart with ±40% jitter, deterministic per index.
export function wordDelays(n: number, seed = 7): number[] {
  const out: number[] = [];
  let t = 0;
  let s = seed;
  for (let i = 0; i < n; i++) {
    out.push(t);
    s = (s * 9301 + 49297) % 233280;
    const base = 133 + (s / 233280) * 67;
    const jitter = 1 + ((s % 80) / 100 - 0.4);
    t += base * jitter;
  }
  return out;
}

export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
