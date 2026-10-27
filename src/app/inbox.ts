// The inbox of the signed-in role (IA port 2026-10-26; HNK-23.T7, HNK-22.T6): one mailbox for the
// whole app instead of a part of each page. It opens on its own after sign-in, then every minute
// while the app is open and visible; the shell's bell and the phone's Inbox tab show how many
// letters carry an action, and the panel (InboxPanel.tsx) lists them. The relay only ever sees
// sealed bytes: opening and checking happen here, the actions in the role's handlers
// (pages/supplier/inbox.ts, pages/buyer/inbox.ts, pages/member/inbox.ts).
import type { Role } from "../lib/account";
import { myMailbox, relayDeps } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { discard, receive, remove, type Received } from "../lib/relay";
import type { MessageType } from "../lib/relay-message";
import { hasInbox } from "../lib/sections";
import { onStoreChange } from "../lib/store";
import type { StationKey } from "../lib/supplier-deal";
import type { Did } from "./outcome";

/** What an action did: the sentence for the letter, the outcome for the page, and the page to open. */
export interface Done {
  said: string;
  did?: Omit<Did, "at" | "inbox">;
  /** The page the action leads to; none: it completed in the panel. */
  to?: { path: string; at?: StationKey };
}

export interface Handler {
  /** Uses the letter; throwing keeps it in the mailbox. */
  run: (r: Received) => Promise<Done>;
  /** One line about the letter in plain words (which invoice, how much), read before acting. */
  about?: (r: Received) => Promise<string | null>;
  /**
   * The letter's work is already done on this device (judge run 2, finding 3): its seal or
   * signature is kept, the deal moved past it, its invoice is settled. It no longer counts.
   */
  handled?: (r: Received) => Promise<boolean>;
  /**
   * The letter is about a record this device does not hold (messy-state E2E 2026-10-27): an
   * invoice written or opened on another device with the same passkey. Not acted on here and not
   * counted: it stays in the mailbox for that device.
   */
  elsewhere?: (r: Received) => Promise<boolean>;
}
export type Handlers = Partial<Record<MessageType, Handler>>;

// each role's handlers load with that role's pages
const LOADERS: Partial<Record<Role, () => Promise<Handlers>>> = {
  supplier: () => import("../pages/supplier/inbox").then((m) => m.supplierInbox),
  buyer: () => import("../pages/buyer/inbox").then((m) => m.buyerInbox),
  member: () => import("../pages/member/inbox").then((m) => m.memberInbox),
};

export interface Letter {
  r: Received;
  state: "new" | "busy" | "done" | "failed";
  /** The action's sentence once done. */
  said?: string;
  error?: string;
  about?: string;
  /** Arrived at the last check (not at the first one after sign-in). */
  fresh: boolean;
  /** Its work is already done on this device (Handler.handled): shown, not counted. */
  handled?: boolean;
  /** About a record another device holds (Handler.elsewhere): shown, not counted, left in the mailbox. */
  away?: boolean;
}

export interface InboxState {
  role: Role | null;
  mailbox: "off" | "opening" | "ready" | "unreachable";
  why?: string;
  letters: Letter[];
  refused: number;
  checking: boolean;
  /** The last check by hand found nothing new. */
  nothingNew: boolean;
  /** The last check failed (shown only after a check by hand). */
  error?: string;
  handlers: Handlers | null;
}

const OFF: InboxState = { role: null, mailbox: "off", letters: [], refused: 0, checking: false, nothingNew: false, handlers: null };
let state: InboxState = OFF;
const listeners = new Set<() => void>();
const set = (patch: Partial<InboxState>) => {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
};
const patchLetter = (id: string, patch: Partial<Letter>) => set({ letters: state.letters.map((l) => (l.r.relayId === id ? { ...l, ...patch } : l)) });

export const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const snapshot = () => state;

// relay ids acted on in this tab: their removal may still be on its way when the next check lists them
const used = new Set<string>();
let got: Awaited<ReturnType<typeof receive>> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let owner: string | null = null; // the fingerprint the inbox was opened for
let checks = 0;

/** A letter this role can act on: its signature holds, a handler takes its kind, and its work is not done yet. */
export function actionable(l: Letter, h: Handlers | null = state.handlers): boolean {
  return l.r.signatureOk && !l.handled && !l.away && !!h?.[l.r.message.header.type];
}

/** A letter still waiting for this person: actionable and not acted on. */
export const unhandled = (l: Letter, h: Handlers | null = state.handlers) => l.state !== "done" && actionable(l, h);

/** The count on the bell: letters with an action not taken yet. */
export function unread(s: InboxState = state): number {
  return s.letters.filter((l) => unhandled(l, s.handlers)).length;
}

/** Asks each letter's handler whether its work is already done on this device, and marks it. */
async function markHandled(): Promise<void> {
  const h = state.handlers;
  const me = owner;
  if (!h) return;
  for (const l of state.letters) {
    const hd = h[l.r.message.header.type];
    if (!hd || !l.r.signatureOk || l.state === "done" || l.state === "busy") continue;
    const yes = hd.handled ? await hd.handled(l.r).catch(() => false) : false;
    const away = hd.elsewhere ? await hd.elsewhere(l.r).catch(() => false) : false;
    // finding F10: a record that came from another device changes what the letter is about too
    const about = hd.about ? await hd.about(l.r).catch(() => null) : null;
    if (owner !== me) return;
    if (!!l.handled !== yes || !!l.away !== away || (about && about !== l.about)) patchLetter(l.r.relayId, { handled: yes, away, ...(about ? { about } : {}) });
  }
}

export async function checkInbox(auto = false): Promise<void> {
  const s = account.current;
  if (!s || !hasInbox(s.role) || state.checking) return;
  const me = owner;
  set({ checking: true, nothingNew: false, error: undefined });
  try {
    await myMailbox();
    const g = await receive(s.inbox, relayDeps, used);
    if (owner !== me) return;
    got = g;
    const first = checks++ === 0;
    const old = new Map(state.letters.map((l) => [l.r.relayId, l]));
    const isNew = g.messages.some((r) => !old.has(r.relayId));
    // a letter that arrived now is marked fresh; the ones before it lose the mark
    const letters: Letter[] = g.messages.map((r) => {
      const was = old.get(r.relayId);
      return was ? (isNew && was.fresh ? { ...was, fresh: false } : was) : { r, state: "new", fresh: !first };
    });
    // a letter acted on stays until the panel lets it go, even when the relay already removed it
    for (const l of state.letters) if (l.state === "done" && !letters.some((x) => x.r.relayId === l.r.relayId)) letters.push(l);
    const added = letters.filter((l) => !old.has(l.r.relayId));
    set({ letters, refused: g.refused, mailbox: "ready", why: undefined, nothingNew: !auto && !added.length });
    for (const l of added) {
      const about = state.handlers?.[l.r.message.header.type]?.about;
      if (about && l.r.signatureOk) void about(l.r).then((x) => x && patchLetter(l.r.relayId, { about: x }), () => undefined);
    }
    void markHandled();
  } catch (e) {
    if (owner === me) set(auto ? {} : { error: e instanceof Error ? e.message : String(e) });
  } finally {
    if (owner === me) set({ checking: false });
  }
}

/** Runs the letter's action. Resolves with what it did, or null when it failed (the letter says why). */
export async function act(l: Letter): Promise<Done | null> {
  const h = state.handlers?.[l.r.message.header.type];
  if (!h || l.state === "busy" || l.state === "done") return null;
  used.add(l.r.relayId);
  patchLetter(l.r.relayId, { state: "busy", error: undefined });
  try {
    const done = await h.run(l.r);
    patchLetter(l.r.relayId, { state: "done", said: done.said });
    if (got) void remove(got.me, l.r.relayId, got.token, relayDeps).catch(() => undefined); // it expires anyway
    return done;
  } catch (e) {
    used.delete(l.r.relayId); // still in the mailbox: it shows again
    patchLetter(l.r.relayId, { state: "failed", error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * A letter that cannot be used here (its action refused it: an invoice for another account's key,
 * a letter from another app) is removed from the mailbox for good, so it no longer counts
 * (messy-state E2E 2026-10-27: it counted on the bell after every reload).
 */
export async function putAside(l: Letter): Promise<void> {
  const s = account.current;
  if (!s || l.state === "busy" || l.state === "done") return;
  used.add(l.r.relayId);
  await discard(s.inbox, l.r.relayId, relayDeps).catch((e) => {
    used.delete(l.r.relayId);
    throw e;
  });
  letGo(l);
}

/** A letter acted on leaves the list. */
export function letGo(l: Letter): void {
  set({ letters: state.letters.filter((x) => x.r.relayId !== l.r.relayId) });
}

/** The letters of one kind not acted on yet (History's requests hang off the chain). */
export function lettersOf(s: InboxState, type: MessageType): Letter[] {
  return s.letters.filter((l) => l.r.message.header.type === type && unhandled(l, s.handlers));
}

/**
 * The letters about one deal (N) still waiting for this person, for the page that shows it: a
 * letter this role has nothing to do with (another party's seal sent for the record), or whose
 * work is already done, does not count (judge run 2, finding 3).
 */
export function lettersFor(s: InboxState, n: string, type?: MessageType): Letter[] {
  return s.letters.filter((l) => l.r.message.header.n === n && (!type || l.r.message.header.type === type) && unhandled(l, s.handlers));
}

let offStore: (() => void) | undefined;

function stop(): void {
  offStore?.();
  offStore = undefined;
  if (timer) clearInterval(timer);
  timer = undefined;
  owner = null;
  got = null;
  checks = 0;
  used.clear();
  state = OFF;
  listeners.forEach((f) => f());
}

/** Follows the session: the inbox opens for a role that has one and closes on log-out. */
function follow(): void {
  const s = account.current;
  const want = s && hasInbox(s.role) ? `${s.role}:${s.fingerprint}` : null;
  if (want === owner) return;
  stop();
  if (!s || !want) return;
  owner = want;
  const role = s.role;
  set({ role, mailbox: "opening" });
  const handlers = (LOADERS[role]?.() ?? Promise.resolve({})).then((h) => {
    if (owner === want) set({ handlers: h });
  });
  // a write to this role's store (an action here or on a page) may finish a letter's work
  offStore?.();
  offStore = onStoreChange((c) => {
    if (owner === want && c.role === role) void markHandled();
  });
  // messy-state E2E 2026-10-27: a relay that was down at sign-in is tried again every minute (it
  // stayed "not reachable" until the next sign-in); Check inbox tries it at once
  const open = () =>
    Promise.all([handlers, myMailbox()]).then(
      () => {
        if (owner !== want) return;
        set({ mailbox: "ready", why: undefined });
        void checkInbox(true);
      },
      (e) => owner === want && set({ mailbox: "unreachable", why: e instanceof Error ? e.message : String(e) }),
    );
  void open();
  timer = setInterval(() => {
    if (document.visibilityState !== "visible" || owner !== want) return;
    if (state.mailbox === "ready") void checkInbox(true);
    else if (state.mailbox === "unreachable") void open();
  }, 60_000);
}

let started = false;
/** Called once by the shell. */
export function startInbox(): void {
  if (started) return;
  started = true;
  account.onChange(follow);
  follow();
}
