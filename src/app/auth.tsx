// The line icons of the sign-in sheets as React components (HNK-31.T7, styled by console.css), used by
// the financier console's sign-in and pairing screens (HNK-26.T21).
import type { ReactNode } from "react";

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="auth-ico" aria-hidden="true">
    {children}
  </svg>
);
export const PasskeyIcon = () => (
  <Icon>
    <circle cx={9} cy={8} r={3.5} />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5 1.2 0 2.3.3 3.2.8" />
    <circle cx={17.5} cy={13.5} r={2.5} />
    <path d="M17.5 16v5M17.5 18.5h2M17.5 20.5h1.5" />
  </Icon>
);
export const FingerIcon = () => (
  <Icon>
    <path d="M8 20c1-2 1.5-4.2 1.5-7a2.5 2.5 0 0 1 5 0c0 1.6-.2 3.2-.6 4.7M12 13c0 3.2-.6 5.6-1.8 7.6M5.5 16.5c.6-1.2 1-2.6 1-4.3a5.5 5.5 0 0 1 11 0c0 .8 0 1.6-.1 2.4M16.5 19.5c.3-.8.5-1.6.7-2.5" />
  </Icon>
);
export const KeyIcon = () => (
  <Icon>
    <circle cx={8} cy={12} r={3.5} />
    <path d="M11.5 12H21M18 12v3M15 12v2" />
  </Icon>
);
export const SyncIcon = () => (
  <Icon>
    <path d="M19 8a7.5 7.5 0 0 0-13.4-1.6M5 16a7.5 7.5 0 0 0 13.4 1.6M5 4v3.5h3.5M19 20v-3.5h-3.5" />
  </Icon>
);
export const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="auth-ico is-small" aria-hidden="true">
    <rect x={5} y={10.5} width={14} height={9.5} rx={2} />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
export const Chevron = () => (
  <svg viewBox="0 0 24 24" className="auth-ico is-chevron" aria-hidden="true">
    <path d="M9.5 6l6 6-6 6" />
  </svg>
);
export const Check = () => (
  <svg viewBox="0 0 24 24" className="auth-ico is-check" aria-hidden="true">
    <path d="M5.5 12.5l4 4 9-9" />
  </svg>
);
