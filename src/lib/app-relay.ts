// The app's relay dependencies and this session's mailbox registration (HNK-23.T7).
import { account } from "./app-session";
import { wasm } from "./core";
import { ensureMailbox, identity, type MailboxIdentity, type RelayDeps, type Registered } from "./relay";

export const relayDeps: RelayDeps = { wasm };

let registered: { fingerprint: string; me: Promise<Registered>; saved: boolean } | null = null;

/** This session's mailbox, registered at the relay once per session. */
export function myMailbox(): Promise<Registered> {
  const s = account.current;
  if (!s) return Promise.reject(new Error("sign in first"));
  if (registered?.fingerprint !== s.fingerprint) {
    const me = ensureMailbox(s.inbox, relayDeps);
    registered = { fingerprint: s.fingerprint, me, saved: false };
    me.catch(() => {
      if (registered?.me === me) registered = null; // try again next time
    });
  }
  return registered.me;
}

/**
 * Judge run 2026-10-26: whether the relay can hold a saved state for this session's mailbox.
 * Not when this session created the mailbox and saved nothing since: only the owner writes the
 * state, so reading it could only answer 404 (a failed request in the console for a new buyer).
 */
export async function relayMayHoldState(): Promise<boolean> {
  const me = await myMailbox();
  return !me.created || registered?.saved === true;
}

/** This session saved a state for its mailbox: reading it again goes to the relay. */
export function stateSaved(): void {
  if (registered && registered.fingerprint === account.current?.fingerprint) registered.saved = true;
}

/** This session's mailbox key without the network (for the contact card). */
export function myIdentity(): MailboxIdentity {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  return identity(s.inbox, relayDeps);
}
