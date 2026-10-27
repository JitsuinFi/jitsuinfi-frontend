// A long value shown cut (8…6) that opens to the whole value on a tap, and folds back on the next:
// the tooltip is no longer the only place it lives (audit 2026-10-27, finding 14; DS-MOB T3).
import "./hash.css";
import { useState, type ReactNode } from "react";

export function Hash({ value, cut, label = "value" }: { value: string; cut: string; label?: string }): ReactNode {
  const [open, setOpen] = useState(false);
  if (!value || cut === value) return <code>{value}</code>;
  return (
    <button type="button" className={`hash-x${open ? " is-open" : ""}`} aria-expanded={open} aria-label={open ? `Fold the ${label}` : `Show the whole ${label}`} onClick={() => setOpen((o) => !o)}>
      <code>{open ? value : cut}</code>
    </button>
  );
}
