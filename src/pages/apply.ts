// Apply as financier (HNK-26.T25, D-46 B): a financier gets its own node from the node provider.
// The application is sealed to the provider's mailbox (the relay keeps ciphertext only); the
// signed invite comes back sealed to a mailbox key this browser keeps for the reply.
import { relayDeps } from "../lib/app-relay";
import { encodeMessage, verifyHeader, type Header } from "../lib/relay-message";
import { draft, ensureMailbox, receive, send } from "../lib/relay";
import { inviteLinkOk, PROVIDER } from "../lib/provider";
import { actions, banner, button, card, field, h, Out, page } from "../lib/ui";

const SEED = "jitsuin.apply.seed";
const SENT = "jitsuin.apply.sent";

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The reply mailbox key of this browser's application (made once, kept in this browser). */
function replySeed(): Uint8Array {
  const st = store();
  const kept = st?.getItem(SEED);
  if (kept && /^[0-9a-f]{64}$/.test(kept)) return Uint8Array.from(kept.match(/../g)!, (b) => parseInt(b, 16));
  const seed = crypto.getRandomValues(new Uint8Array(32));
  st?.setItem(SEED, Array.from(seed, (b) => b.toString(16).padStart(2, "0")).join(""));
  return seed;
}

export function applyPage(): HTMLElement {
  const name = field("Name of your company or fund", { placeholder: "e.g. Kurogane Capital" });
  const contact = field("How we reach you", { placeholder: "email or phone" });
  const note = field("Anything we should know (optional)", { area: true, placeholder: "What you finance, roughly how much, where you are" });
  const sentOut = new Out();
  const sentAt = store()?.getItem(SENT);
  if (sentAt) sentOut.show(banner("ok", "Application sent", `On ${sentAt.slice(0, 10)}. Your invite will arrive below in this browser.`));
  const submit = button("Send application", async () => {
    try {
      if (!name.value() || !contact.value()) throw new Error("give a name and a way to reach you");
      const seed = replySeed();
      const me = await ensureMailbox(seed, relayDeps);
      const body: Record<string, string> = { name: name.value(), contact: contact.value() };
      if (note.value()) body.note = note.value();
      const h = draft("financier.apply", { role: "applicant", mailbox_pk: me.mailbox_pk }, PROVIDER.mailbox_pk, relayDeps, { body }) as Header;
      await send(PROVIDER.mailbox_pk, await encodeMessage(h), relayDeps);
      const when = new Date().toISOString();
      store()?.setItem(SENT, when);
      sentOut.show(banner("ok", "Application sent", "Sealed to the node provider: the relay only stores ciphertext. Your invite will arrive below in this browser."));
    } catch (e) {
      sentOut.error(e);
    }
  });
  const inviteOut = new Out();
  const check = button(
    "Check for my invite",
    async () => {
      try {
        if (!store()?.getItem(SEED)) throw new Error("send an application from this browser first");
        const r = await receive(replySeed(), relayDeps);
        const invite = r.messages.map((m) => m.message.header).find((x) => x.type === "financier.invite");
        if (!invite) return inviteOut.show(banner("warn", "No invite yet", "The provider reviews each application. Check again later."));
        const link = (invite.body as { link?: string }).link ?? "";
        if (!(await verifyHeader(invite, PROVIDER.signer_pk)) || !inviteLinkOk(link)) {
          return inviteOut.show(banner("bad", "Not a valid invite", "A message arrived but it is not signed by the node provider. Do not open it."));
        }
        inviteOut.show(
          banner("ok", "Your node is ready", "Open the invite to create the passkey for your financier console. The link works once, so open it on the device you will use."),
          actions(h("a", { class: "button", href: link }, "Open your invite")),
        );
      } catch (e) {
        inviteOut.error(e);
      }
    },
    true,
  );
  return page(
    "Become a financier",
    "A financier runs its own JitsuinFi node: its wallet, its keys and its console. The node provider reviews your application and sets up your node; you receive a one-time invite here.",
    card("Step 1", "Apply", "Sealed to the node provider. Nothing is public and nothing is kept on a server in readable form.", name.el, contact.el, note.el, actions(submit), sentOut.el),
    card("Step 2", "Your invite", "This browser keeps the key that opens the reply. Come back here in the same browser.", actions(check), inviteOut.el),
  );
}
