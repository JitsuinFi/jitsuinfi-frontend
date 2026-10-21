// "Mailbox" part of a role screen (HNK-23.T7, HNK-22.T5 core, HNK-22.T6 core): this role's
// contact card, and the inbox of relay messages, each offered as an action of the screen that
// owns it. The relay only ever sees sealed bytes; opening and checking happen here.
import { account } from "../lib/app-session";
import { myIdentity, myMailbox, relayDeps } from "../lib/app-relay";
import { contactId, decodeContact, encodeContact, type Contact } from "../lib/contact";
import { receive, remove, type Received } from "../lib/relay";
import type { MessageType } from "../lib/relay-message";
import { actions, banner, button, card, codeBlock, h, Out } from "../lib/ui";

export interface InboxAction {
  label: string;
  /** Uses the message; returns what happened. Throwing keeps the message in the mailbox. */
  run: (r: Received) => Promise<string>;
  /** Leave the message in the mailbox after `run` (the screen removes it when it is done). */
  keep?: boolean;
}

const TYPE_LABEL: Partial<Record<MessageType, string>> = {
  "invoice.sign_request": "Invoice to sign",
  "invoice.signature": "Buyer's signature",
  "deal.decline": "Offer declined",
  "deal.commitment_opening": "Entry request",
  "deal.letter": "Assignment letter",
  "deal.seal": "Seal on the letter",
  "deal.advance": "Advance paid",
};

/** This session's contact card, to hand to a counterparty. */
export function myContact(): Contact {
  const s = account.current;
  if (!s) throw new Error("sign in first");
  return { v: 1, role: s.role, mailbox_pk: myIdentity().mailbox_pk, fingerprint: s.fingerprint };
}

/** Reads a pasted contact card, refuses one of the wrong role, and keeps it on this device. */
export async function useContact(code: string, role: Contact["role"]): Promise<Contact> {
  const c = decodeContact(code);
  if (c.role !== role) throw new Error(`this is a ${c.role}'s contact card; ask the ${role} for theirs`);
  await account.current?.store?.put(contactId(c), c);
  return c;
}

export function mailboxCard(handlers: Partial<Record<MessageType, InboxAction>>): HTMLElement {
  const status = new Out();
  const inbox = new Out();
  let contact = "";
  try {
    contact = encodeContact(myContact());
  } catch (e) {
    status.error(e);
  }
  myMailbox().then(
    () => status.show(banner("ok", "Mailbox ready", "Counterparties with your contact card can send you documents. Only you can open them.")),
    (e) => status.show(banner("warn", "Mailbox not reachable", `${e instanceof Error ? e.message : String(e)}. Your documents stay on this device; try again later.`)),
  );

  const check = async () => {
    try {
      await myMailbox();
      const s = account.current;
      if (!s) throw new Error("sign in first");
      const got = await receive(s.inbox, relayDeps);
      const rows = got.messages.map((r) => {
        const t = r.message.header.type;
        const action = handlers[t];
        const out = new Out();
        const head = h(
          "div",
          { class: "deal-head" },
          h("strong", {}, TYPE_LABEL[t] ?? t),
          h("span", {}, `from a ${r.message.header.from.role} · ${new Date(r.receivedAt).toLocaleString()}`),
          action && r.signatureOk
            ? button(action.label, async () => {
                try {
                  const done = await action.run(r);
                  if (!action.keep) await remove(got.me, r.relayId, got.token, relayDeps);
                  out.show(banner("ok", "Done", done));
                } catch (e) {
                  out.error(e);
                }
              })
            : null,
        );
        const note = !r.signatureOk
          ? banner("bad", "Signature does not hold", "This message was changed or forged. It is ignored.")
          : !action
            ? h("small", {}, "This screen has nothing to do with this message.")
            : null;
        return h("div", { class: "deal" }, head, note, out.el);
      });
      inbox.show(
        ...(got.refused ? [banner("warn", `${got.refused} message${got.refused > 1 ? "s" : ""} could not be opened`, "Not sealed to your mailbox or not a JitsuinFi message; ignored.")] : []),
        rows.length ? h("div", { class: "deals" }, ...rows) : h("p", { class: "hint" }, "Nothing new."),
      );
    } catch (e) {
      inbox.error(e);
    }
  };

  return card(
    "Mailbox",
    "Contact card and inbox",
    "Give your contact card to the people you deal with; compare the key fingerprint with them by phone or in person. Documents they send arrive sealed to you.",
    status.el,
    contact ? codeBlock("Your contact card", contact, "contact-card.txt") : null,
    actions(button("Check inbox", check, true)),
    inbox.el,
  );
}
