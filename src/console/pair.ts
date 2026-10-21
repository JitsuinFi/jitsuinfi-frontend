// Joining the console from an invite (HNK-26.T2, T20, D-43): the consumer sign-up of the app,
// in three steps (invite, passkey, ready). The code comes in the invite link (`/console/pair#…`,
// the fragment never reaches a server) or is typed. Pairing also signs in.
import { chevron, fingerIcon, head, keyIcon, link, lockIcon, Message, primary, row, sheet } from "../lib/auth-sheet";
import { h } from "../lib/ui";
import { creationOptions, NodeError, post, registrationJson } from "./node";
import { keepName } from "./name";

const STEPS = ["Invite", "Passkey", "Ready"];

function protectedNote(): HTMLElement {
  return h("div", { class: "auth-foot" }, h("p", { class: "auth-protected" }, lockIcon(), "Protected by your device passkey"), h("p", { class: "auth-host" }, `Works only on ${location.host}`));
}

export function pairView(): HTMLElement {
  const root = h("main", { class: "auth" });
  let code = decodeURIComponent(location.hash.slice(1)).trim();
  if (code) history.replaceState(null, "", location.pathname + location.search);
  const show = (el: HTMLElement) => root.replaceChildren(el);

  const inviteSheet = (problem?: string): HTMLElement => {
    const input = h("input", { class: "is-code", autocomplete: "one-time-code", autocapitalize: "characters", spellcheck: "false", maxlength: "24", placeholder: "XXXX-XXXX-XXXX-XXXX" }) as HTMLInputElement;
    input.value = code;
    const msg = new Message();
    if (problem) msg.show(problem);
    const form = h("form", { class: "auth-form", novalidate: true }, h("label", { class: "auth-field" }, h("span", {}, "Invite code"), input, h("small", {}, "It is in the invite link your node provider sent you.")), primary("Next", () => undefined, "submit"), msg.el);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (input.value.replace(/[^a-z0-9]/gi, "").length < 16) {
        input.setAttribute("aria-invalid", "true");
        msg.show("Type the 16 characters of the invite code.");
        return;
      }
      code = input.value.trim();
      show(passkeySheet());
    });
    queueMicrotask(() => input.focus());
    return sheet(head("Join your financier console", "Open the invite link, or type its code.", 1, STEPS), form, protectedNote());
  };

  const passkeySheet = (): HTMLElement => {
    const msg = new Message();
    const point = (ico: SVGElement, title: string, text: string) => h("li", {}, ico, h("span", {}, h("strong", {}, title), text));
    const create = primary("Create passkey", async () => {
      msg.clear();
      try {
        const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> }; name?: string | null }>("/node/console/pair/start", { code });
        keepName(start.name);
        let cred: PublicKeyCredential;
        try {
          cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
        } catch (e) {
          const why = e instanceof DOMException && e.name === "InvalidStateError" ? "This device already has a passkey for this console: log in instead." : e instanceof DOMException && e.name === "NotAllowedError" ? "The passkey was not created." : "This browser could not create the passkey.";
          throw new NodeError(`${why} Your invite code is used up; ask for a new invite link to try again.`);
        }
        const done = await post<{ credentials: number; name?: string | null }>("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
        keepName(done.name);
        show(readySheet(done.name ?? start.name ?? null));
      } catch (e) {
        msg.error(e);
      }
    });
    if (!window.PublicKeyCredential) {
      create.disabled = true;
      msg.show("This browser has no passkeys. Open the invite link in a current browser.");
    }
    return sheet(
      head("Set up your passkey", "It replaces a password for your financier console.", 2, STEPS),
      h(
        "ul",
        { class: "auth-points" },
        point(fingerIcon(), "Unlock it your way", "Your device asks for your fingerprint, your face, or your device PIN."),
        point(keyIcon(), "The keys stay on your node", "The passkey opens the console. The wallet and its keys never leave the node."),
        point(lockIcon(), "Every payment asks you", "An advance is paid only after you approve it with this passkey, payment by payment."),
      ),
      msg.el,
      create,
      h("p", { class: "auth-switch" }, link("Use another invite code", () => show(inviteSheet()))),
      protectedNote(),
    );
  };

  const readySheet = (name: string | null): HTMLElement => {
    const open = row(h("span", { class: "auth-badge", "aria-hidden": "true" }, "証"), "Open your console", "Your mailbox, your devices and your node.", chevron(), () => {
      location.href = "/console";
    });
    return sheet(
      head(name ? `You're set, ${name}` : "You're set", "Your passkey is paired and you are signed in.", 3, STEPS),
      h(
        "ol",
        { class: "auth-onboard" },
        h("li", {}, h("strong", {}, "Your passkey is your password"), "Each time you log in or approve a payment, your device asks for your fingerprint, face, or device PIN. Nothing to remember."),
        h("li", {}, h("strong", {}, "More devices"), "In the console, Add a device makes a one-time link for your other phone or computer."),
        h("li", {}, h("strong", {}, "Your first step"), h("div", { class: "auth-list" }, open)),
      ),
    );
  };

  show(code ? passkeySheet() : inviteSheet());
  return root;
}
