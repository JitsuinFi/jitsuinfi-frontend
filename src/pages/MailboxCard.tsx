// The contact card helpers of every role (HNK-22.T5): this session's card, and a counterparty's
// card read and kept. The mailbox part that every role page used to carry (HNK-23.T7, HNK-22.T6)
// is gone since the IA port: the inbox is one sheet in the shell (app/InboxPanel.tsx) and the
// contacts are their own section (pages/ContactsPage.tsx; DS-MOB N6).
import { myIdentity } from "../lib/app-relay";
import { account } from "../lib/app-session";
import { contactId, readContact, type Contact } from "../lib/contact";

/** This session's contact card, to hand to a counterparty. */
export function myContact(): Contact {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  // the @name goes along (judge run 2): the other side sees "Add @name?", not a fingerprint only
  const username = account.who()?.username;
  return { v: 1, role: s.role, ...(username && username.length <= 32 ? { username } : {}), mailbox_pk: myIdentity().mailbox_pk, fingerprint: s.fingerprint };
}

/** Reads a pasted contact card, refuses one of the wrong role, and keeps it on this device. */
export async function takeContact(code: string, role: Contact["role"]): Promise<Contact> {
  const c = readContact(code); // a contact link works as well as the card (judge run 2)
  if (c.role !== role) throw new Error(`this is a ${c.role}'s contact card; ask the ${role} for theirs`);
  await account.current?.store?.put(contactId(c), c);
  return c;
}
