// In-progress input kept above a layout switch (DS-MOB L5: a change of width never loses what is
// typed or chosen). Pages draw one tree at every width where they can; where a screen truly needs
// two trees (a phone's fold against a desktop's open section), the form keeps its values here,
// under the screen and the signed-in account, so both trees read the same draft.
// Here, in this tab's memory; a File is kept as the File object itself (a file input cannot be set
// again from code), so the form shows the chosen name instead of an empty picker. Finding F10:
// lib/drafts.ts also keeps each draft sealed in this tab's sessionStorage, so it survives a
// reload (`onWrite` tells it what changed, `load` puts a restored draft back).

export type Draft = Record<string, unknown>;

export interface Kept {
  /** The draft value `name` of `scope`, or undefined. */
  get<T>(scope: string, name: string): T | undefined;
  /** Sets one value; undefined drops it. */
  set(scope: string, name: string, value: unknown): void;
  /** The whole draft of `scope` (a copy). */
  draft(scope: string): Draft;
  /** Forgets one screen's draft: after its action succeeded, or on Cancel. */
  clear(scope: string): void;
  /** Forgets every draft that does not belong to `owner` (another account signed in). */
  keepOnly(owner: string): void;
  /** Puts a restored draft back (no write notice). */
  load(scope: string, draft: Draft): void;
  /** Calls `f` with the scope after every set or clear; returns the unsubscribe. */
  onWrite(f: (scope: string) => void): () => void;
}

/** The scope of a screen for one signed-in account: `owner` first, so keepOnly can match it. */
export const scopeOf = (owner: string, screen: string): string => `${owner}\u0000${screen}`;

export function keptStore(): Kept {
  const drafts = new Map<string, Map<string, unknown>>();
  const writes = new Set<(scope: string) => void>();
  const wrote = (scope: string) => writes.forEach((f) => f(scope));
  return {
    get: <T>(scope: string, name: string) => drafts.get(scope)?.get(name) as T | undefined,
    set(scope, name, value) {
      let d = drafts.get(scope);
      if (value === undefined) {
        d?.delete(name);
        if (d && !d.size) drafts.delete(scope);
        wrote(scope);
        return;
      }
      if (!d) drafts.set(scope, (d = new Map()));
      d.set(name, value);
      wrote(scope);
    },
    draft: (scope) => Object.fromEntries(drafts.get(scope) ?? []),
    clear(scope) {
      drafts.delete(scope);
      wrote(scope);
    },
    keepOnly(owner) {
      for (const scope of drafts.keys()) if (!scope.startsWith(`${owner}\u0000`)) drafts.delete(scope);
    },
    load(scope, draft) {
      const d = new Map<string, unknown>();
      for (const [k, v] of Object.entries(draft)) if (v !== undefined) d.set(k, v);
      // what was typed in this tab since wins over the restored copy
      for (const [k, v] of drafts.get(scope) ?? []) d.set(k, v);
      if (d.size) drafts.set(scope, d);
    },
    onWrite(f) {
      writes.add(f);
      return () => void writes.delete(f);
    },
  };
}

/** The app's one store. */
export const kept = keptStore();
