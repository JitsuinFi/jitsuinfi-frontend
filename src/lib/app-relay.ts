// The app's relay dependencies and this session's mailbox registration (HNK-23.T7).
import { account } from "./app-session";
import { wasm } from "./core";
import { ensureMailbox, identity, type MailboxIdentity, type RelayDeps } from "./relay";

export const relayDeps: RelayDeps = { wasm };

let registered: { fingerprint: string; me: Promise<MailboxIdentity> } | null = null;

/** This session's mailbox, registered at the relay once per session. */
export function myMailbox(): Promise<MailboxIdentity> {
  const s = account.current;
  if (!s) return Promise.reject(new Error("sign in first"));
  if (registered?.fingerprint !== s.fingerprint) {
    const me = ensureMailbox(s.inbox, relayDeps);
    registered = { fingerprint: s.fingerprint, me };
    me.catch(() => {
      if (registered?.me === me) registered = null; // try again next time
    });
  }
  return registered.me;
}

/** This session's mailbox key without the network (for the contact card). */
export function myIdentity(): MailboxIdentity {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  return identity(s.inbox, relayDeps);
}
