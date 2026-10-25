// The JitsuinFi mark (HNK-18.T1): the registered seal pressed half on paper, half on the shielded
// pool. On paper the rim is worn in three places and carries a faint ink grain (Dark Raspberry);
// where it reaches the water it ripples and turns Classic Rose. `small` is the form for 32 px and
// less: a thicker rim, no fine ring, no grain. The 印 is the page's display face (Shippori Mincho B1).
import { useId, type ReactNode } from "react";

const RIM = "M70.00 44.00L70.24 45.48L70.26 46.97L69.99 48.43L69.47 49.84L68.84 51.19L68.25 52.53L67.78 53.90L67.42 55.32L67.06 56.77L66.56 58.18L65.83 59.47L64.85 60.60L63.73 61.59L62.58 62.53L61.50 63.50L60.53 64.58L59.59 65.73L58.60 66.85L57.47 67.83L56.18 68.56L54.77 69.06L53.32 69.42L51.90 69.78L50.53 70.25L49.19 70.84L47.84 71.47L46.43 71.99L44.97 72.26L43.48 72.24L42.00 72.00L40.55 71.68L39.12 71.43L37.67 71.32L36.20 71.30L34.70 71.25L33.22 71.01L31.83 70.50L30.54 69.74L29.35 68.83L28.18 67.93L26.97 67.14L25.69 66.45L24.35 65.79L23.06 65.04L21.90 64.10L20.96 62.94L20.21 61.65L19.55 60.31L18.86 59.03L18.07 57.82L17.17 56.65L16.26 55.46L15.50 54.17L14.99 52.78L14.75 51.30L14.70 49.80L14.68 48.33L14.57 46.88L14.32 45.45L14.00 44.00L13.76 42.52L13.74 41.03L14.01 39.57L14.53 38.16L15.16 36.81L15.75 35.47L16.22 34.10L16.58 32.68L16.94 31.23L17.44 29.82L18.17 28.53L19.15 27.40L20.27 26.41L21.42 25.47L22.50 24.50L23.47 23.42L24.41 22.27L25.40 21.15L26.53 20.17L27.82 19.44L29.23 18.94L30.68 18.58L32.10 18.22L33.47 17.75L34.81 17.16L36.16 16.53L37.57 16.01L39.03 15.74L40.52 15.76L42.00 16.00L43.45 16.32L44.88 16.57L46.33 16.68L47.80 16.70L49.30 16.75L50.78 16.99L52.17 17.50L53.46 18.26L54.65 19.17L55.82 20.07L57.03 20.86L58.31 21.55L59.65 22.21L60.94 22.96L62.10 23.90L63.04 25.06L63.79 26.35L64.45 27.69L65.14 28.97L65.93 30.18L66.83 31.35L67.74 32.54L68.50 33.83L69.01 35.22L69.25 36.70L69.30 38.20L69.32 39.67L69.43 41.12L69.68 42.55Z";
const RIM_FINE = "M63.25 44.00L63.42 45.12L63.43 46.25L63.23 47.36L62.85 48.43L62.38 49.46L61.94 50.48L61.58 51.52L61.30 52.59L61.02 53.69L60.63 54.75L60.07 55.73L59.33 56.59L58.49 57.35L57.63 58.07L56.81 58.81L56.07 59.63L55.35 60.49L54.59 61.33L53.73 62.07L52.75 62.63L51.69 63.02L50.59 63.30L49.52 63.58L48.48 63.94L47.46 64.38L46.43 64.85L45.36 65.23L44.25 65.43L43.12 65.42L42.00 65.25L40.90 65.02L39.81 64.84L38.71 64.75L37.59 64.72L36.46 64.67L35.35 64.48L34.29 64.09L33.31 63.52L32.39 62.85L31.50 62.18L30.59 61.58L29.61 61.05L28.61 60.54L27.63 59.96L26.76 59.24L26.04 58.37L25.46 57.39L24.95 56.39L24.42 55.41L23.82 54.50L23.15 53.61L22.48 52.69L21.91 51.71L21.52 50.65L21.33 49.54L21.28 48.41L21.25 47.29L21.16 46.19L20.98 45.10L20.75 44.00L20.58 42.88L20.57 41.75L20.77 40.64L21.15 39.57L21.62 38.54L22.06 37.52L22.42 36.48L22.70 35.41L22.98 34.31L23.37 33.25L23.93 32.27L24.67 31.41L25.51 30.65L26.37 29.93L27.19 29.19L27.93 28.37L28.65 27.51L29.41 26.67L30.27 25.93L31.25 25.37L32.31 24.98L33.41 24.70L34.48 24.42L35.52 24.06L36.54 23.62L37.57 23.15L38.64 22.77L39.75 22.57L40.88 22.58L42.00 22.75L43.10 22.98L44.19 23.16L45.29 23.25L46.41 23.28L47.54 23.33L48.65 23.52L49.71 23.91L50.69 24.48L51.61 25.15L52.50 25.82L53.41 26.42L54.39 26.95L55.39 27.46L56.37 28.04L57.24 28.76L57.96 29.63L58.54 30.61L59.05 31.61L59.58 32.59L60.18 33.50L60.85 34.39L61.52 35.31L62.09 36.29L62.48 37.35L62.67 38.46L62.72 39.59L62.75 40.71L62.84 41.81L63.02 42.90Z";

export function Mark({ className, small = false, dark = false }: { className?: string; small?: boolean; dark?: boolean }): ReactNode {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pool = dark ? "#032C7D" : "#020D2F";
  const ink = dark ? "#BA71A2" : "#7E2A53";
  const rim = small ? 9 : 6;
  const kanji = (fill: string) => (
    <text x={42} y={small ? 55.6 : 55.4} textAnchor="middle" fontFamily="'Shippori Mincho B1', serif" fontWeight={800} fontSize={small ? 32 : 31} fill={fill} stroke={fill} strokeWidth={0.9} paintOrder="stroke" strokeLinejoin="round">
      印
    </text>
  );
  return (
    <svg viewBox="0 0 112 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`p${id}`}>
          <circle cx={72} cy={58} r={36} />
        </clipPath>
        <mask id={`d${id}`}>
          <rect x={-20} y={-20} width={160} height={140} fill="#fff" />
          <circle cx={72} cy={58} r={36} fill="#000" />
        </mask>
        {small ? null : (
          <filter id={`g${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves={2} seed={7} />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.55 1.18" />
            <feComposite in="SourceGraphic" operator="in" />
          </filter>
        )}
      </defs>
      <circle cx={72} cy={58} r={36} fill={pool} />
      <g clipPath={`url(#p${id})`} fill="none" strokeLinecap="round">
        <path d={small ? "M36 76C48 70 60 70 72 76S96 82 112 76" : "M36 72C48 66 60 66 72 72S96 78 112 72"} stroke={dark ? "#1D97F1" : "#0841C9"} strokeWidth={small ? 4 : 2.4} />
        {small ? null : <path d="M36 81C48 75 60 75 72 81S96 87 112 81" stroke={dark ? "#C4C7F2" : "#1D97F1"} strokeWidth={1.8} />}
      </g>
      <g mask={`url(#d${id})`} filter={small ? undefined : `url(#g${id})`}>
        <circle cx={42} cy={44} r={28} fill="none" stroke={ink} strokeWidth={rim} strokeDasharray={small ? undefined : "44 1.2 61 0.8 49 1.5 21"} />
        {small ? null : <circle cx={42} cy={44} r={21.25} fill="none" stroke={ink} strokeWidth={1.6} />}
        {kanji(ink)}
      </g>
      <g clipPath={`url(#p${id})`}>
        <path d={RIM} fill="none" stroke="#ECD0EC" strokeWidth={rim} />
        {small ? null : <path d={RIM_FINE} fill="none" stroke="#ECD0EC" strokeWidth={1.6} />}
        {kanji("#ECD0EC")}
      </g>
    </svg>
  );
}

/** The name with a small seal as the dot of each i of "Jitsuin", and "Fi" in the seal's red. */
export function Wordmark({ className }: { className?: string }): ReactNode {
  return (
    <span className={className} aria-label="JitsuinFi">
      <span aria-hidden="true">
        J<span className="wm-i">i</span>tsu<span className="wm-i">i</span>n<b className="wm-fi">Fi</b>
      </span>
    </span>
  );
}
