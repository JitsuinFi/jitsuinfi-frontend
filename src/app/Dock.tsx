// The phone's bottom action bar (mobile E2E 2026-10-27, finding 4; DS-MOB P2, T2): a single-job
// screen's one primary rides above the tab bar on compact widths, so it is on screen 1 however
// long the document above it is. Wider, the children stay where they are written. One bar a
// screen: the last Dock mounted shows, the others wait (a screen promotes its next action by
// rendering it in the Dock and demoting the one done). Styles: shell.css (.ia-bar).
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePhone } from "./phone";

let seq = 0;
const stack: number[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const top = () => stack.at(-1) ?? 0;

/** Whether a dock is showing (the shell gives the page room under its last line). */
function syncBody(): void {
  document.body.classList.toggle("has-dock", stack.length > 0);
}

export function Dock({ children, label = "Next step" }: { children: ReactNode; label?: string }): ReactNode {
  const phone = usePhone();
  const [id] = useState(() => ++seq);
  const showing = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => top() === id,
  );
  useEffect(() => {
    if (!phone) return;
    stack.push(id);
    syncBody();
    emit();
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      syncBody();
      emit();
    };
  }, [phone, id]);
  if (!phone) return <>{children}</>;
  if (!showing) return null;
  return createPortal(
    <div className="ia-bar" role="region" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
