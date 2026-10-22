// The consumer sign-in sheet's pieces (src/auth.css) as React components (HNK-31.T7), shared by
// the app's account screen and the financier console (HNK-26.T21): the 印 seal, line icons, list
// rows, the primary button, links, a status message, the sheet, its head and the 3-step progress.
// Same markup and class names as src/lib/auth-sheet.ts.
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";

/** The JitsuinFi seal mark: heavy ring, fine ring, 印. */
export function Logo(): ReactNode {
  return (
    <svg viewBox="0 0 100 100" className="auth-logo" aria-hidden="true">
      <circle cx={50} cy={50} r={44} className="ring" />
      <circle cx={50} cy={50} r={36} className="ring-fine" />
      <text x={50} y={67} textAnchor="middle" className="kanji">
        印
      </text>
    </svg>
  );
}

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

// While one button of a sheet runs, every button of the sheet is disabled and the running one
// shows the waiting mark.
const Busy = createContext<{ waiting: number | null; run: (id: number, fn: () => void | Promise<void>) => Promise<void> }>({ waiting: null, run: async (_, fn) => void (await fn()) });
let nextId = 1;
const useId = () => useState(() => nextId++)[0];

export function Sheet({ children, label = "auth-title" }: { children: ReactNode; label?: string }): ReactNode {
  const [waiting, setWaiting] = useState<number | null>(null);
  const run = async (id: number, fn: () => void | Promise<void>) => {
    setWaiting(id);
    try {
      await fn();
    } finally {
      setWaiting(null);
    }
  };
  return (
    <Busy.Provider value={{ waiting, run }}>
      <div className="auth-sheet" role="dialog" aria-labelledby={label}>
        {children}
      </div>
    </Busy.Provider>
  );
}

/** The sheet's busy state for buttons it does not draw itself (a submit button, a plain input). */
export function useSheetBusy(): boolean {
  return useContext(Busy).waiting !== null;
}

/** A list row button: icon, label (and a line under it), trailing mark. Shows "waiting" while it runs. */
export function Row({ lead, label, line, trail, run, disabled, current, className = "auth-row", role, checked }: { lead: ReactNode; label: string; line?: string | null; trail?: ReactNode; run: () => void | Promise<void>; disabled?: boolean; current?: boolean; className?: string; role?: string; checked?: boolean }): ReactNode {
  const id = useId();
  const busy = useContext(Busy);
  return (
    <button
      type="button"
      className={`${className}${busy.waiting === id ? " is-waiting" : ""}`}
      role={role}
      aria-checked={checked === undefined ? undefined : checked}
      aria-current={current ? "true" : undefined}
      disabled={disabled || busy.waiting !== null}
      onClick={() => void busy.run(id, run)}
    >
      {lead}
      <span className="auth-row-text">
        <span className="auth-row-label">{label}</span>
        {line ? <span className="auth-row-line">{line}</span> : null}
      </span>
      {trail ?? <span />}
    </button>
  );
}

export function Primary({ label, run, submit, disabled }: { label: string; run?: () => void | Promise<void>; submit?: boolean; disabled?: boolean }): ReactNode {
  const id = useId();
  const busy = useContext(Busy);
  return (
    <button
      type={submit ? "submit" : "button"}
      className={`auth-button is-primary${busy.waiting === id ? " is-waiting" : ""}`}
      disabled={disabled || busy.waiting !== null}
      onClick={submit || !run ? undefined : () => void busy.run(id, run)}
    >
      {label}
    </button>
  );
}

export function AuthLink({ label, run }: { label: string; run: () => void }): ReactNode {
  const busy = useContext(Busy);
  return (
    <button type="button" className="auth-link" disabled={busy.waiting !== null} onClick={run}>
      {label}
    </button>
  );
}

/** A status line under a sheet's action: a sentence, or an error with its first letter raised. */
export function useMessage(): { el: ReactNode; show(text: string): void; error(e: unknown): void; clear(): void } {
  const [text, setText] = useState("");
  return {
    el: (
      <p className="auth-msg" role="status" aria-live="polite">
        {text}
      </p>
    ),
    show: setText,
    error(e) {
      const m = e instanceof Error ? e.message : String(e);
      setText(m.charAt(0).toUpperCase() + m.slice(1));
    },
    clear: () => setText(""),
  };
}

export function Head({ title, sub, step, names }: { title: string; sub?: string | null; step?: number; names?: string[] }): ReactNode {
  return (
    <div className="auth-head">
      {step ? <Steps n={step} names={names} /> : <Logo />}
      <h1 className="auth-title" id="auth-title">
        {title}
      </h1>
      {sub ? <p className="auth-sub">{sub}</p> : null}
    </div>
  );
}

/** Sign-up progress, three steps: by default account, passkey, ready. */
export function Steps({ n, names = ["Account", "Passkey", "Ready"] }: { n: number; names?: string[] }): ReactNode {
  return (
    <ol className="auth-steps" aria-label={`Step ${n} of 3`}>
      {names.map((name, i) => (
        <li key={name} className={i + 1 < n ? "is-done" : i + 1 === n ? "is-now" : undefined}>
          <span className="auth-steps-bar" />
          {name}
        </li>
      ))}
    </ol>
  );
}

/** A sheet form: submits without leaving the page, its buttons follow the sheet's busy state. */
export function AuthForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }): ReactNode {
  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Any other button of a sheet (a secondary action): busy like the rows. */
export function SheetButton({ className, label, run }: { className: string; label: string; run: () => void | Promise<void> }): ReactNode {
  const id = useId();
  const busy = useContext(Busy);
  return (
    <button type="button" className={`${className}${busy.waiting === id ? " is-waiting" : ""}`} disabled={busy.waiting !== null} onClick={() => void busy.run(id, run)}>
      {label}
    </button>
  );
}
