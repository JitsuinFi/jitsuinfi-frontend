// The Back control of every screen below the top level (judge run 2, finding 9; DS-MOB N3, N4):
// in an installed app (standalone) there is no address bar and on iOS no back button, so each
// such screen carries its own. It goes back to the previous screen of this visit when there is
// one (the same as the system Back), else up to the screen it belongs under (lib/up.ts). The
// visit's screens are remembered by their history position, in memory only.
import { useEffect, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Role } from "../lib/account";
import { backTarget, upFor } from "../lib/up";

// history position -> the in-app address there, for this document only
const trail = new Map<number, string>();
let watching = false;

function useTrail(): void {
  const router = useRouter();
  useEffect(() => {
    if (watching) return;
    watching = true;
    const note = (loc: { pathname: string; search: string; state: { __TSR_index?: number } }, push: boolean) => {
      const i = loc.state.__TSR_index ?? 0;
      if (push) for (const k of [...trail.keys()]) if (k > i) trail.delete(k);
      trail.set(i, loc.pathname + loc.search);
    };
    note(router.history.location, false);
    router.history.subscribe(({ location, action }) => note(location, action.type === "PUSH"));
  }, [router]);
}

export function UpBar({ role, phone, wide }: { role: Role | null; phone: boolean; wide: boolean }): ReactNode {
  useTrail();
  const router = useRouter();
  const loc = useRouterState({ select: (r) => ({ pathname: r.location.pathname, search: r.location.searchStr, index: (r.location.state as { __TSR_index?: number }).__TSR_index ?? 0 }) });
  const up = upFor(loc.pathname, loc.search, role, phone);
  if (!up) return null;
  const prev = trail.get(loc.index - 1) ?? null;
  const t = backTarget(up, prev, loc.pathname, loc.search, role);
  return (
    <nav className={wide ? "ia-up" : "ia-up is-narrow"} aria-label="Back">
      <button
        type="button"
        className="ia-up-b"
        onClick={() => {
          if (t.kind === "history") router.history.back();
          else void router.navigate({ href: t.to, replace: true });
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3L5 8l5 5" />
        </svg>
        <span>
          <b>Back</b>
          <small>{`to ${t.title}`}</small>
        </span>
      </button>
    </nav>
  );
}
