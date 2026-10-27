// The app's device sync (finding F10; format and merge rules in lib/sync.ts): after a write to the
// signed-in role's store (debounced), on sign-in, when the tab comes back into view, when the
// device comes back online and every minute while the tab is in view, this device reads the
// role's state at the relay, merges it with its own records, writes what the other devices added,
// and sends the merge back when the relay's copy lacks something. One run at a time.
//
// The inner key is derived from the session's inbox PRF output at sign-in and kept as a
// non-extractable WebCrypto key for the session; it is forgotten on lock.
import { useEffect, useReducer } from "react";
import { account } from "./app-session";
import { myMailbox, relayDeps, relayMayHoldState, stateSaved } from "./app-relay";
import { loadState, RelayError, saveState } from "./relay";
import { onStoreChange, type Entry } from "./store";
import { decodeState, encodeState, mergeAll, sameRecords, syncKey, type SyncState } from "./sync";

export type SyncStatus =
  | { kind: "off" }
  | { kind: "syncing"; last: number | null }
  /** `held`: records left out for room; `older`: the relay handed back an older copy than one seen here. */
  | { kind: "synced"; at: number; held: number; slimmed: number; older: boolean }
  | { kind: "offline"; last: number | null }
  | { kind: "failed"; last: number | null; text: string };

let status: SyncStatus = { kind: "off" };
const listeners = new Set<() => void>();
function set(s: SyncStatus): void {
  status = s;
  listeners.forEach((f) => f());
}
const lastAt = (): number | null => (status.kind === "synced" ? status.at : "last" in status ? status.last : null);

/** The sync's state for this session, redrawn when it changes. */
export function useSyncStatus(): SyncStatus {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  return status;
}

let key: { fp: string; key: Promise<CryptoKey> } | null = null;
/** The newest state this session saw at the relay (ms), to notice one handed back older. */
let seen = 0;
let running: Promise<SyncState | null> | null = null;
let queued: Promise<SyncState | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function session() {
  const s = account.current;
  return s?.store ? s : null;
}

/**
 * One run: reads the relay's state, merges, writes what is new here, sends what is new there.
 * Returns the relay's state as read (null when there is none), or throws when the relay cannot be
 * reached or the state cannot be opened.
 */
async function run(): Promise<SyncState | null> {
  const s = session();
  if (!s || !key || key.fp !== s.fingerprint) return null;
  const k = await key.key;
  const store = s.store!;
  await myMailbox();
  let remote: SyncState | null = null;
  if (await relayMayHoldState()) {
    const b = await loadState(s.inbox, relayDeps);
    if (b) remote = await decodeState(s.role, b, k);
  }
  if (account.current !== s) return remote; // signed out or switched meanwhile
  const local = await store.entries();
  const m = mergeAll(local, remote?.records ?? []);
  for (const e of m.toLocal) await store.putSynced(e.id, e.doc, e.at);
  const older = !!remote && remote.written_at > 0 && remote.written_at < seen;
  if (remote) seen = Math.max(seen, remote.written_at);
  let held = remote?.held_back ?? 0;
  let slimmed = remote?.slimmed ?? 0;
  if (m.records.length) {
    const out = await encodeState(s.role, m.records, k, Math.max(Date.now(), seen + 1));
    if (!remote || !sameRecords(out.state.records, remote.records)) {
      await saveState(s.inbox, out.bytes, relayDeps);
      stateSaved();
      seen = Math.max(seen, out.state.written_at);
      held = out.state.held_back;
      slimmed = out.state.slimmed;
    }
  }
  if (account.current === s) set({ kind: "synced", at: Date.now(), held, slimmed, older });
  return remote;
}

/**
 * Syncs now (or right after the run under way) and returns the relay's state as read. Throws
 * when it could not; the status says why.
 */
export function syncNow(): Promise<SyncState | null> {
  if (timer) clearTimeout(timer);
  timer = null;
  // a run under way may have read the store before the caller's write: one more run after it
  if (running) {
    queued ??= running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return syncNow();
      });
    return queued;
  }
  if (!session()) return Promise.resolve(null);
  const last = lastAt();
  set({ kind: "syncing", last });
  running = run()
    .catch((e) => {
      if (session()) {
        const off = typeof navigator !== "undefined" && navigator.onLine === false;
        if (off || (e instanceof RelayError && e.status === undefined)) set({ kind: "offline", last });
        else set({ kind: "failed", last, text: e instanceof Error ? e.message : String(e) });
      }
      throw e;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** A sync soon: writes come in bursts (an inbox action writes a few records). */
function soon(ms = 1200): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow().catch(() => undefined), ms);
}

/** The relay's copy of one record as it is now (a fresh read), or null. Throws when it cannot be read. */
export async function remoteRecord(id: string): Promise<Entry | null> {
  const st = await syncNow();
  return st?.records.find((r) => r.id === id) ?? null;
}

// ---------- when to sync ----------
let started = false;
/** Starts the sync for every session of this tab (once, from the app shell). */
export function startDeviceSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const begin = () => {
    const s = session();
    if (!s) {
      key = null;
      seen = 0;
      set({ kind: "off" });
      return;
    }
    if (key?.fp === s.fingerprint) return;
    key = { fp: s.fingerprint, key: syncKey(s.inbox, s.role) };
    seen = 0;
    soon(0);
  };
  account.onChange(begin);
  begin();
  onStoreChange((c) => {
    const s = session();
    if (s && c.role === s.role && !c.synced) soon();
  });
  const back = () => {
    if (!session() || document.visibilityState !== "visible") return;
    const last = lastAt();
    if (status.kind !== "syncing" && (last === null || Date.now() - last > 5000)) soon(0);
  };
  document.addEventListener("visibilitychange", back);
  window.addEventListener("focus", back);
  window.addEventListener("online", () => session() && soon(0));
  window.addEventListener("offline", () => session() && set({ kind: "offline", last: lastAt() }));
  setInterval(() => {
    if (session() && document.visibilityState === "visible") soon(0);
  }, 60_000);
}
