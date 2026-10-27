// The pages' side of lib/kept.ts (DS-MOB L5): a screen's draft, kept above its layout switch, for
// the account signed in now. Another account signing in (or the session locking) drops the drafts
// that are not its own.
import { useState, type FormEvent } from "react";
import { account } from "../lib/app-session";
import { kept, scopeOf } from "../lib/kept";

const owner = (): string => {
  const s = account.current;
  return s ? `${s.role}:${s.fingerprint}` : "";
};
account.onChange(() => kept.keepOnly(owner()));

/** One screen's draft: `field` for an uncontrolled text field, `get`/`set` for anything else (a File). */
export function useKept(screen: string) {
  const scope = scopeOf(owner(), screen);
  return {
    /** Starts from the draft and writes every keystroke to it. */
    field: (name: string, init = "") => ({
      defaultValue: kept.get<string>(scope, name) ?? init,
      onInput: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => kept.set(scope, name, e.currentTarget.value),
    }),
    get: <T>(name: string) => kept.get<T>(scope, name),
    set: (name: string, value: unknown) => kept.set(scope, name, value),
    clear: () => kept.clear(scope),
  };
}

/** useState whose value lives in the screen's draft, so the other layout's tree starts from it. */
export function useKeptState<T>(screen: string, name: string, init: T): [T, (v: T) => void] {
  const scope = scopeOf(owner(), screen);
  const [v, setV] = useState<T>(() => kept.get<T>(scope, name) ?? init);
  return [
    v,
    (x: T) => {
      kept.set(scope, name, x === init ? undefined : x);
      setV(x);
    },
  ];
}
