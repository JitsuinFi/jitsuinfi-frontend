// The pages' side of lib/kept.ts (DS-MOB L5): a screen's draft, kept above its layout switch, for
// the account signed in now. Another account signing in (or the session locking) drops the drafts
// that are not its own. Finding F10: every draft is also sealed into this tab's sessionStorage
// (lib/drafts.ts), so after a reload and a new sign-in the form fills again.
import { createElement, useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { account } from "../lib/app-session";
import { dropDrafts, draftKey, fileMeta, loadDrafts, ownerTag, saveDraft, type DraftStorage, type FileMeta } from "../lib/drafts";
import { kept, scopeOf } from "../lib/kept";

const owner = (): string => {
  const s = account.current;
  return s ? `${s.role}:${s.fingerprint}` : "";
};

function tabStorage(): DraftStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked site data: drafts stay in memory only
  }
}

// ---------- sealed copies in sessionStorage ----------
let sealing: { owner: string; key: Promise<CryptoKey>; tag: Promise<string> } | null = null;
let restored = 0;
const restoredListeners = new Set<() => void>();
const pendingScopes = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

account.onChange(() => {
  const o = owner();
  kept.keepOnly(o);
  const s = account.current;
  const storage = tabStorage();
  if (!s || !storage) {
    sealing = null;
    return;
  }
  if (sealing?.owner === o) return;
  const mine = { owner: o, key: draftKey(s.inbox, s.role), tag: ownerTag(o) };
  sealing = mine;
  void (async () => {
    const all = await loadDrafts(storage, await mine.key, await mine.tag);
    if (sealing !== mine) return;
    for (const [screen, d] of all) kept.load(scopeOf(o, screen), d);
    restored++;
    restoredListeners.forEach((f) => f());
  })().catch(() => undefined);
});

kept.onWrite((scope) => {
  pendingScopes.add(scope);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 250);
});

async function flush(): Promise<void> {
  flushTimer = null;
  const mine = sealing;
  const storage = tabStorage();
  const scopes = [...pendingScopes];
  pendingScopes.clear();
  if (!mine || !storage) return;
  const head = `${mine.owner}\u0000`;
  const [key, tag] = await Promise.all([mine.key, mine.tag]);
  for (const scope of scopes) {
    if (!scope.startsWith(head)) continue;
    await saveDraft(storage, key, tag, scope.slice(head.length), kept.draft(scope)).catch(() => undefined);
  }
}

/** Sign out: this account's drafts go from the tab as well. */
export async function dropMyDrafts(): Promise<void> {
  const storage = tabStorage();
  const o = owner();
  if (storage && o) dropDrafts(storage, await ownerTag(o));
}

/** Grows when the drafts sealed before a reload are back (a form fills again then). */
function useRestored(): number {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    restoredListeners.add(bump);
    return () => void restoredListeners.delete(bump);
  }, []);
  return restored;
}

/** One screen's draft: `field` for an uncontrolled text field, `get`/`set` for anything else (a File). */
export function useKept(screen: string) {
  useRestored();
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
  const back = useRestored();
  const [v, setV] = useState<T>(() => kept.get<T>(scope, name) ?? init);
  useEffect(() => {
    const k = kept.get<T>(scope, name);
    if (k !== undefined) setV(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back]);
  return [
    v,
    (x: T) => {
      kept.set(scope, name, x === init ? undefined : x);
      setV(x);
    },
  ];
}

// ---------- a whole form, kept field by field ----------
type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const SKIP = new Set(["file", "password", "hidden", "checkbox", "radio", "submit", "button"]);

/** A field's name in the draft: its name, its aria-label, or its label's caption. */
function nameOf(el: Element): string {
  const label = el.closest("label");
  const cap = label?.querySelector(":scope > span")?.textContent?.trim();
  return el.getAttribute("name") || el.getAttribute("aria-label") || cap || el.id || "";
}

function setValue(el: FieldEl, v: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

/**
 * Keeps every text field, text area and select inside `ref` in the screen's draft as it is
 * typed, and fills them again after a reload (once per field element, so typing is never
 * overwritten). A chosen file is kept as its name, size and SHA-256: `note` asks for it again.
 * `clear` forgets the draft: call it once the form's action succeeded.
 */
export function useFormDraft<E extends HTMLElement = HTMLElement>(screen: string): { ref: RefObject<E | null>; note: ReactNode; clear: () => void; restoredAny: boolean } {
  const ref = useRef<E>(null);
  const back = useRestored();
  const scope = scopeOf(owner(), screen);
  const filled = useRef(new WeakSet<Element>());
  const [missing, setMissing] = useState<FileMeta[]>([]);
  const [restoredAny, setRestoredAny] = useState(false);
  const [, redraw] = useReducer((x: number) => x + 1, 0);

  // fill: after every render, each field element once (a field may appear after another's choice)
  useEffect(() => {
    const root = ref.current;
    if (!root || !owner()) return;
    let any = false;
    const lost: FileMeta[] = [];
    for (const el of root.querySelectorAll<FieldEl>("input, textarea, select")) {
      const type = el instanceof HTMLInputElement ? el.type : "";
      const name = nameOf(el);
      if (!name) continue;
      if (type === "file") {
        const meta = kept.get<FileMeta>(scope, `file:${name}`);
        if (meta && !(el as HTMLInputElement).files?.length) lost.push(meta);
        continue;
      }
      if (SKIP.has(type) || filled.current.has(el)) continue;
      filled.current.add(el);
      const v = kept.get<string>(scope, name);
      if (typeof v === "string" && v !== el.value && !("readOnly" in el && el.readOnly)) {
        setValue(el, v);
        any = true;
      }
    }
    if (any) setRestoredAny(true);
    setMissing((m) => (m.map((x) => x.sha256).join() === lost.map((x) => x.sha256).join() ? m : lost));
  });

  // a restore that lands after the form was drawn fills it again
  useEffect(() => {
    filled.current = new WeakSet();
    redraw();
  }, [back]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onInput = (e: Event) => {
      const el = e.target as FieldEl;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      const type = el instanceof HTMLInputElement ? el.type : "";
      const name = nameOf(el);
      if (!name || SKIP.has(type)) return;
      kept.set(scope, name, el.value === "" ? undefined : el.value);
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el instanceof HTMLInputElement && el.type === "file") {
        const name = nameOf(el);
        const f = el.files?.[0];
        if (!name) return;
        if (!f) kept.set(scope, `file:${name}`, undefined);
        else void fileMeta(f).then((m) => kept.set(scope, `file:${name}`, m), () => undefined);
        redraw();
        return;
      }
      onInput(e);
    };
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    return () => {
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
    };
  }, [scope]);

  const clear = () => {
    kept.clear(scope);
    setMissing([]);
    setRestoredAny(false);
  };
  const note =
    missing.length || restoredAny
      ? createElement(
          "p",
          { className: "ia-draft-note", role: "status" },
          createElement("b", { lang: "ja", "aria-hidden": "true" }, "控"),
          createElement(
            "span",
            null,
            missing.length
              ? `What you wrote here is back. Choose ${missing.map((m) => `“${m.name}”`).join(" and ")} again: a browser cannot keep a chosen file across a reload.`
              : "What you wrote here before the page reloaded is back.",
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "ia-draft-go",
              onClick: () => {
                clear();
                const root = ref.current;
                root?.querySelectorAll<FieldEl>("input, textarea, select").forEach((el) => {
                  const type = el instanceof HTMLInputElement ? el.type : "";
                  if (!SKIP.has(type) && !(el instanceof HTMLSelectElement) && !("readOnly" in el && el.readOnly)) setValue(el, (el as HTMLInputElement).defaultValue ?? "");
                });
                kept.clear(scope);
              },
            },
            "Start over",
          ),
        )
      : null;
  return { ref, note, clear, restoredAny };
}
