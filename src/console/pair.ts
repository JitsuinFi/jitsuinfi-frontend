// Pairing a passkey with the console (HNK-26.T2, T20, D-43): the code comes in an invite link
// (`/console/pair#<code>`, the fragment never reaches a server) or is typed; the node checks it,
// the browser creates a passkey for this origin, and the node verifies and keeps it.
import { h } from "../lib/ui";
import { creationOptions, NodeError, post, registrationJson } from "./node";
import { sheet, verdict } from "./sheet";

export function pairView(): HTMLElement {
  const s = sheet("Pair a passkey with this console", "The console opens only with a passkey paired here. Your node provider sends you an invite link with the code; a signed-in console makes codes for more devices.");
  const input = h("input", { id: "code", class: "is-code", autocomplete: "one-time-code", autocapitalize: "characters", spellcheck: "false", maxlength: "24", placeholder: "XXXX-XXXX-XXXX-XXXX", "aria-describedby": "code-help" }) as HTMLInputElement;
  const fromLink = decodeURIComponent(location.hash.slice(1)).trim();
  if (fromLink) {
    input.value = fromLink;
    history.replaceState(null, "", location.pathname + location.search);
  }
  const msg = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  const go = h("button", { class: "auth-button is-primary", type: "submit" }, "Create passkey") as HTMLButtonElement;
  const form = h(
    "form",
    { class: "auth-form", novalidate: true },
    h("label", { class: "auth-field" }, h("span", {}, "Pairing code"), input, h("small", { id: "code-help" }, fromLink ? "Filled in from your invite link." : "Type the code from your invite link.")),
    go,
    msg,
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = input.value.trim();
    if (code.replace(/[^a-z0-9]/gi, "").length < 16) {
      input.setAttribute("aria-invalid", "true");
      msg.textContent = "Type the 16 characters of the pairing code.";
      return;
    }
    input.removeAttribute("aria-invalid");
    go.disabled = true;
    go.classList.add("is-waiting");
    go.textContent = "Waiting for the passkey";
    msg.textContent = "";
    try {
      const start = await post<{ ceremony: string; options: { publicKey: Record<string, unknown> } }>("/node/console/pair/start", { code });
      let cred: PublicKeyCredential;
      try {
        cred = (await navigator.credentials.create({ publicKey: creationOptions(start.options.publicKey) })) as PublicKeyCredential;
      } catch (e) {
        const why = e instanceof DOMException && e.name === "InvalidStateError" ? "This device already holds a passkey for this console." : e instanceof DOMException && e.name === "NotAllowedError" ? "The passkey was not created." : "This browser could not create the passkey.";
        throw new NodeError(`${why} Ask for a new invite link for another try.`);
      }
      const done = await post<{ credentials: number }>("/node/console/pair/finish", { ceremony: start.ceremony, credential: registrationJson(cred) });
      form.replaceWith(
        verdict("認", "Passkey paired", done.credentials === 1 ? "This node now keeps one console passkey." : `This node now keeps ${done.credentials} console passkeys.`),
        h("a", { class: "auth-button is-primary", href: "/console" }, "Sign in to the console"),
      );
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : String(e);
      go.disabled = false;
      go.classList.remove("is-waiting");
      go.textContent = "Create passkey";
    }
  });
  if (!window.PublicKeyCredential) {
    msg.textContent = "This browser has no passkeys. Open this page in a current browser.";
    go.disabled = true;
  }
  s.body.append(form);
  return s.root;
}
