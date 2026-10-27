// In-progress input kept above a layout switch (DS-MOB L5: a change of width never loses what is
// typed or chosen). Pages draw one tree at every width where they can; where a screen truly needs
// two trees (a phone's fold against a desktop's open section), the form keeps its values here,
// under the screen and the signed-in account, so both trees read the same draft.
// In this tab's memory only: never written to storage, gone on reload. A File is kept as the
// File object itself (a file input cannot be set again from code), so the form shows the chosen
// name instead of an empty picker.

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
}

/** The scope of a screen for one signed-in account: `owner` first, so keepOnly can match it. */
export const scopeOf = (owner: string, screen: string): string => `${owner}\u0000${screen}`;

export function keptStore(): Kept {
  const drafts = new Map<string, Map<string, unknown>>();
  return {
    get: <T>(scope: string, name: string) => drafts.get(scope)?.get(name) as T | undefined,
    set(scope, name, value) {
      let d = drafts.get(scope);
      if (value === undefined) {
        d?.delete(name);
        if (d && !d.size) drafts.delete(scope);
        return;
      }
      if (!d) drafts.set(scope, (d = new Map()));
      d.set(name, value);
    },
    draft: (scope) => Object.fromEntries(drafts.get(scope) ?? []),
    clear(scope) {
      drafts.delete(scope);
    },
    keepOnly(owner) {
      for (const scope of drafts.keys()) if (!scope.startsWith(`${owner}\u0000`)) drafts.delete(scope);
    },
  };
}

/** The app's one store. */
export const kept = keptStore();
