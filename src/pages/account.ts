// Account screen (HNK-22.T1 – T3; SEQ-00): register the one passkey, sign in to a role, add or
// switch roles with the same passkey, see the key fingerprint, lock. Demo mode (test secret)
// only where passkeys cannot give keys.
import { isNonProductionHost, PRODUCTION_RP_ID, roleLabel, ROLES, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { actions, banner, button, card, field, h, kv, Out, page } from "../lib/ui";

// This tab only: the device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;

export function rolePath(role: Role): string {
  return `#/${role}`;
}

function bytesFromHex(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error("a test secret is 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

/** `want`: the role screen the user tried to open. */
export function accountPage(want?: Role): HTMLElement {
  const s = account.current;
  if (s && (!want || s.role === want)) return page("Account", "One passkey for every role.", sessionCard());
  if (s && want) return page("Account", "One passkey for every role.", switchCard(want), sessionCard());
  return page(
    "Sign in",
    "One passkey for every role: supplier, buyer, fund member. Your keys come from it in this browser; nothing secret is stored or sent.",
    signInCard(want ?? "supplier"),
  );
}

function signInCard(initial: Role): HTMLElement {
  let chosen: Role = initial;
  const out = new Out();
  const picker = h("div", { class: "actions roles", role: "radiogroup", "aria-label": "Role" });
  const drawPicker = (): void => {
    picker.replaceChildren(
      ...ROLES.map((r) => {
        const b = button(r.label, () => {
          chosen = r.role;
          drawPicker();
        }, true);
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(r.role === chosen));
        return b;
      }),
    );
  };
  drawPicker();
  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof NoPrfError) {
        prfFailed = true;
        out.show(banner("bad", "No keys from this passkey", e.message), demoBlock(chosen));
        return;
      }
      out.error(e);
    }
  };
  const known = account.knownCredentials().length;
  const viaPasskey = passkeysAvailable()
    ? h(
        "div",
        {},
        actions(
          button(known ? "Sign in" : "Sign in with your passkey", run(() => account.signIn(chosen))),
          button("Create your passkey", run(() => account.register(chosen)), true),
          ...(known ? [button("Use another passkey", run(() => account.signIn(chosen, true)), true)] : []),
        ),
        h(
          "p",
          { class: "hint" },
          known
            ? "Create a passkey only once. To act in another role later, sign in with the same passkey."
            : "New here: create your passkey. On a new device with a synced passkey: sign in.",
        ),
      )
    : banner("warn", "No passkeys here", "This browser or address cannot use passkeys (https or localhost needed). You can try the app with test data.");
  return card(
    "Account",
    "Sign in with your passkey",
    "Choose the role you want to act in. The same passkey gives each role its own keys.",
    h("span", { class: "who" }, "Act as"),
    picker,
    viaPasskey,
    isNonProductionHost(location.hostname)
      ? banner("warn", "Not the production site", `Passkeys and keys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`)
      : null,
    !passkeysAvailable() || prfFailed ? demoBlock(chosen) : null,
    out.el,
  );
}

function demoBlock(role: Role): HTMLElement {
  const secret = field("Test secret", {
    placeholder: "64 hex characters",
    help: "Test data only (TES- invoices). Anyone with this secret can act as you. It stays in this tab until you lock.",
  });
  const out = new Out();
  return h(
    "div",
    { class: "demo" },
    h("h3", {}, `Use test data as ${roleLabel(role)}`),
    secret.el,
    actions(
      button("Use test data", async () => {
        try {
          await account.signInDemo(role, bytesFromHex(secret.value()));
        } catch (e) {
          out.error(e);
        }
      }, true),
    ),
    out.el,
  );
}

function switchCard(want: Role): HTMLElement {
  const out = new Out();
  return card(
    "Role",
    `Switch to ${roleLabel(want)}`,
    "Same passkey, separate keys for this role. One touch.",
    actions(
      button(`Continue as ${roleLabel(want)}`, async () => {
        try {
          await account.switchRole(want);
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

function sessionCard(): HTMLElement {
  const s = account.current!;
  const out = new Out();
  return card(
    "Session",
    `Signed in as ${roleLabel(s.role)}`,
    s.role === "member"
      ? "A fund member never signs; this session only holds your inbox key."
      : "Each signature asks your passkey once; no key stays in this tab. The session locks after 15 minutes without input.",
    kv([
      ["Role", roleLabel(s.role)],
      ["Key fingerprint", s.fingerprint, true],
      ["Keys from", s.demo ? "test secret (test data only)" : "your passkey"],
      ...(s.store ? [["Deals", s.store.persistent ? "kept on this device, encrypted" : "this tab only (storage blocked)"] as [string, string]] : []),
    ]),
    h("p", { class: "hint" }, "The fingerprint is the same on every device with this passkey. If it looks different, you picked another passkey."),
    actions(
      h("a", { class: "button", href: rolePath(s.role) }, `Open ${roleLabel(s.role)} screen`),
      ...ROLES.filter((r) => r.role !== s.role).map((r) =>
        button(`Switch to ${r.label}`, async () => {
          try {
            await account.switchRole(r.role);
          } catch (e) {
            out.error(e);
          }
        }, true),
      ),
      button("Lock", () => account.lock(), true),
    ),
    out.el,
  );
}
