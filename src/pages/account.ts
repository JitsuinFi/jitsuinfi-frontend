// Account screen (HNK-22.T1 – T3; SEQ-00): sign up, log in, onboarding, role switch, log out.
// Demo mode (test secret) only where passkeys cannot give keys.
//
// Look: a consumer login sheet in JitsuinFi's palette.
// - Sign up: email, username and role, then the passkey (the password), then a short onboarding
//   (what the passkey is, the key fingerprint, the first step for the role).
// - Log in: username, then the passkey. The first role opened is the one used last.
// No account server exists yet (relay HNK-23): username and email stay in this browser's profile
// (D-34). The passkey is named after the username, so a synced passkey finds the account on a new
// device.
import "../auth.css";
import { emailProblem, isNonProductionHost, normalizeUsername, PRODUCTION_RP_ID, roleLabel, ROLES, usernameProblem, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { h } from "../lib/ui";

// ---------- screen state (this tab only) ----------
type View = "login" | "login-passkey" | "signup" | "signup-passkey";
let view: View | null = null;
let loginName = "";
let draft: { email: string; username: string; role: Role } = { email: "", username: "", role: "supplier" };
let onboarding = false;
// The device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;

const KANJI: Record<Role, string> = { supplier: "売", buyer: "買", member: "資" };
const ROLE_LINE: Record<Role, string> = {
  supplier: "Issue invoices and get them financed",
  buyer: "Sign invoices and pay when they are due",
  member: "See what the fund holds for you",
};
const FIRST_STEP: Record<Role, { label: string; line: string }> = {
  supplier: { label: "Create your first invoice", line: "Then ask your buyer to sign it." },
  buyer: { label: "Share your invoice key", line: "Your supplier needs it to address an invoice to you." },
  member: { label: "Open your inbox", line: "Receipts from the fund arrive here." },
};
const SVG_NS = "http://www.w3.org/2000/svg";

/** True right after sign-up, until the onboarding sheet is left: the router keeps showing it. */
export function onboardingPending(): boolean {
  return onboarding && account.current !== null;
}

export function rolePath(role: Role): string {
  return `#/${role}`;
}

function bytesFromHex(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error("a test secret is 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

/** `want`: the role screen the user tried to open. */
export function accountPage(want?: Role): HTMLElement {
  const root = h("section", { class: "auth" });
  const paint = (): void => {
    root.replaceChildren(sheetFor(want, paint));
  };
  paint();
  return root;
}

function sheetFor(want: Role | undefined, paint: () => void): HTMLElement {
  if (account.current) return onboarding ? onboardingSheet(paint) : rolesSheet(want);
  if (!view) view = account.knownCredentials().length ? "login" : "signup";
  if (want && view === "signup" && !draft.username) draft.role = want;
  switch (view) {
    case "login":
      return loginSheet(paint);
    case "login-passkey":
      return loginPasskeySheet(want, paint);
    case "signup":
      return signupSheet(paint);
    case "signup-passkey":
      return signupPasskeySheet(paint);
  }
}

// ---------- pieces ----------

function svg(tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

/** The JitsuinFi seal mark: heavy ring, fine ring, 印. */
function logo(): SVGElement {
  const t = svg("text", { x: 50, y: 67, "text-anchor": "middle", class: "kanji" });
  t.textContent = "印";
  return svg("svg", { viewBox: "0 0 100 100", class: "auth-logo", "aria-hidden": "true" }, svg("circle", { cx: 50, cy: 50, r: 44, class: "ring" }), svg("circle", { cx: 50, cy: 50, r: 36, class: "ring-fine" }), t);
}

function icon(...paths: SVGElement[]): SVGElement {
  return svg("svg", { viewBox: "0 0 24 24", class: "auth-ico", "aria-hidden": "true" }, ...paths);
}
const passkeyIcon = () => icon(svg("circle", { cx: 9, cy: 8, r: 3.5 }), svg("path", { d: "M3 19.5c0-3.3 2.7-5.5 6-5.5 1.2 0 2.3.3 3.2.8" }), svg("circle", { cx: 17.5, cy: 13.5, r: 2.5 }), svg("path", { d: "M17.5 16v5M17.5 18.5h2M17.5 20.5h1.5" }));
const fingerIcon = () => icon(svg("path", { d: "M8 20c1-2 1.5-4.2 1.5-7a2.5 2.5 0 0 1 5 0c0 1.6-.2 3.2-.6 4.7M12 13c0 3.2-.6 5.6-1.8 7.6M5.5 16.5c.6-1.2 1-2.6 1-4.3a5.5 5.5 0 0 1 11 0c0 .8 0 1.6-.1 2.4M16.5 19.5c.3-.8.5-1.6.7-2.5" }));
const keyIcon = () => icon(svg("circle", { cx: 8, cy: 12, r: 3.5 }), svg("path", { d: "M11.5 12H21M18 12v3M15 12v2" }));
const syncIcon = () => icon(svg("path", { d: "M19 8a7.5 7.5 0 0 0-13.4-1.6M5 16a7.5 7.5 0 0 0 13.4 1.6M5 4v3.5h3.5M19 20v-3.5h-3.5" }));
const lockIcon = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-small", "aria-hidden": "true" }, svg("rect", { x: 5, y: 10.5, width: 14, height: 9.5, rx: 2 }), svg("path", { d: "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" }));
const chevron = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-chevron", "aria-hidden": "true" }, svg("path", { d: "M9.5 6l6 6-6 6" }));
const check = () => svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-check", "aria-hidden": "true" }, svg("path", { d: "M5.5 12.5l4 4 9-9" }));

function badge(role: Role): HTMLElement {
  return h("span", { class: "auth-badge", "aria-hidden": "true" }, KANJI[role]);
}

/** A list row button: icon, label (and a line under it), trailing mark. Shows "waiting" while it runs. */
function row(lead: Node, label: string, line: string | null, trail: Node | null, run: () => void | Promise<void>): HTMLButtonElement {
  const text = h("span", { class: "auth-row-text" }, h("span", { class: "auth-row-label" }, label), line ? h("span", { class: "auth-row-line" }, line) : null);
  const b = h("button", { type: "button", class: "auth-row" }, lead, text, trail ?? h("span", {}));
  b.addEventListener("click", () => busy(b, run));
  return b;
}

/** Disables the sheet's buttons while `run` works; `b` shows the waiting mark. */
async function busy(b: HTMLButtonElement, run: () => void | Promise<void>): Promise<void> {
  const sheet = b.closest(".auth-sheet");
  sheet?.querySelectorAll("button").forEach((x) => (x.disabled = true));
  b.classList.add("is-waiting");
  try {
    await run();
  } finally {
    b.classList.remove("is-waiting");
    sheet?.querySelectorAll("button").forEach((x) => (x.disabled = false));
  }
}

function primary(label: string, run: () => void | Promise<void>, type: "button" | "submit" = "button"): HTMLButtonElement {
  const b = h("button", { type, class: "auth-button is-primary" }, label);
  if (type === "button") b.addEventListener("click", () => busy(b, run));
  return b;
}

function link(label: string, run: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "auth-link" }, label);
  b.addEventListener("click", run);
  return b;
}

class Message {
  readonly el = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  show(text: string): void {
    this.el.textContent = text;
  }
  error(e: unknown): void {
    const m = e instanceof Error ? e.message : String(e);
    this.show(m.charAt(0).toUpperCase() + m.slice(1));
  }
  clear(): void {
    this.el.textContent = "";
  }
}

function sheet(...children: Array<Node | null>): HTMLElement {
  return h("div", { class: "auth-sheet", role: "dialog", "aria-labelledby": "auth-title" }, ...children);
}

function head(title: string, sub: string | null, step?: number): HTMLElement {
  return h(
    "div",
    { class: "auth-head" },
    step ? steps(step) : logo(),
    h("h1", { class: "auth-title", id: "auth-title" }, title),
    sub ? h("p", { class: "auth-sub" }, sub) : null,
  );
}

/** Sign-up progress: account, passkey, ready. */
function steps(n: number): HTMLElement {
  const names = ["Account", "Passkey", "Ready"];
  return h(
    "ol",
    { class: "auth-steps", "aria-label": `Step ${n} of 3` },
    ...names.map((name, i) => h("li", { class: i + 1 < n ? "is-done" : i + 1 === n ? "is-now" : undefined }, h("span", { class: "auth-steps-bar" }), name)),
  );
}

function field(label: string, input: HTMLInputElement, help?: string): { el: HTMLElement; error: (m: string | null) => void } {
  const err = h("small", { class: "auth-field-error" });
  const el = h("label", { class: "auth-field" }, h("span", {}, label), input, help ? h("small", {}, help) : null, err);
  return {
    el,
    error: (m) => {
      err.textContent = m ?? "";
      input.setAttribute("aria-invalid", String(m !== null));
    },
  };
}

function footer(): HTMLElement {
  return h(
    "div",
    { class: "auth-foot" },
    h("p", { class: "auth-protected" }, lockIcon(), "Protected by your device passkey"),
    isNonProductionHost(location.hostname) ? h("p", { class: "auth-host" }, `Passkeys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`) : null,
  );
}

function demoBlock(role: Role): HTMLDetailsElement {
  const input = h("input", { type: "text", placeholder: "64 hex characters", spellcheck: "false", autocomplete: "off", "aria-label": "Test secret" });
  const msg = new Message();
  const use = h("button", { type: "button", class: "auth-button is-secondary" }, "Use test data");
  use.addEventListener("click", () =>
    busy(use, async () => {
      msg.clear();
      try {
        await account.signInDemo(role, bytesFromHex(input.value.trim()));
      } catch (e) {
        msg.error(e);
      }
    }),
  );
  const d = h("details", { class: "auth-demo" }, h("summary", {}, "Use test data instead"), h("div", { class: "auth-demo-body" }, input, h("small", {}, "For TES- invoices only. Anyone with this secret acts as you."), use, msg.el));
  d.hidden = passkeysAvailable() && !prfFailed;
  d.open = !passkeysAvailable() || prfFailed;
  return d;
}

/** Runs a passkey call; a missing PRF opens the test data block. */
async function withPasskey(msg: Message, demo: HTMLDetailsElement, fn: () => Promise<unknown>): Promise<boolean> {
  msg.clear();
  try {
    await fn();
    return true;
  } catch (e) {
    if (e instanceof NoPrfError) {
      prfFailed = true;
      demo.hidden = false;
      demo.open = true;
    }
    msg.error(e);
    return false;
  }
}

function noPasskeysNote(msg: Message): void {
  if (!passkeysAvailable()) msg.show("Passkeys are not available in this browser. Open the app over https or on localhost, or use test data.");
}

// ---------- log in ----------

function loginSheet(paint: () => void): HTMLElement {
  const input = h("input", { type: "text", name: "username", autocomplete: "username webauthn", autocapitalize: "none", spellcheck: "false", placeholder: "yourname" });
  input.value = loginName;
  const f = field("Username", input);
  const form = h(
    "form",
    { class: "auth-form", novalidate: true },
    f.el,
    primary("Next", () => undefined, "submit"),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const problem = usernameProblem(input.value);
    f.error(problem);
    if (problem) return;
    loginName = normalizeUsername(input.value);
    view = "login-passkey";
    paint();
  });
  queueMicrotask(() => input.focus());
  return sheet(
    head("Log in", "Enter your username. Your passkey comes next."),
    form,
    h("p", { class: "auth-switch" }, "New to JitsuinFi? ", link("Create an account", () => ((view = "signup"), paint()))),
    footer(),
  );
}

function loginPasskeySheet(want: Role | undefined, paint: () => void): HTMLElement {
  const msg = new Message();
  const role = want ?? "supplier";
  const demo = demoBlock(role);
  noPasskeysNote(msg);
  const known = account.usernameKnown(loginName);
  const go = row(passkeyIcon(), "Continue with passkey", null, chevron(), async () => {
    const ok = await withPasskey(msg, demo, () => account.signInAs(loginName, want));
    if (ok && !want && account.current) location.hash = rolePath(account.current.role);
  });
  go.disabled = !passkeysAvailable();
  return sheet(
    head("Welcome back", null),
    h("p", { class: "auth-who" }, h("span", { class: "auth-chip" }, `@${loginName}`), link("Not you?", () => ((view = "login"), paint()))),
    h("p", { class: "auth-sub is-left" }, known ? "Use your passkey to log in. Your device asks for your fingerprint, your face, or your device password." : "This device has not seen this username yet. Pick the passkey you made for it; your device asks for your fingerprint, face, or device password."),
    h("div", { class: "auth-list" }, go),
    msg.el,
    demo,
    footer(),
  );
}

// ---------- sign up ----------

function signupSheet(paint: () => void): HTMLElement {
  const email = h("input", { type: "email", name: "email", autocomplete: "email", inputmode: "email", spellcheck: "false", placeholder: "name@example.com" });
  const user = h("input", { type: "text", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", placeholder: "yourname" });
  email.value = draft.email;
  user.value = draft.username;
  const fe = field("Email", email, "Kept on this device for now; nothing is sent until the account service is live.");
  const fu = field("Username", user, "3 to 20 characters: letters, digits, dot or underscore. Your passkey is named after it.");
  let role = draft.role;
  const roleRows = ROLES.map((r) => {
    const b = h("button", { type: "button", class: "auth-row is-choice", role: "radio" }, badge(r.role), h("span", { class: "auth-row-text" }, h("span", { class: "auth-row-label" }, r.label), h("span", { class: "auth-row-line" }, ROLE_LINE[r.role])), check());
    b.addEventListener("click", () => {
      role = r.role;
      paintRoles();
    });
    return b;
  });
  const paintRoles = (): void => roleRows.forEach((b, i) => b.setAttribute("aria-checked", String(ROLES[i].role === role)));
  paintRoles();
  const form = h(
    "form",
    { class: "auth-form", novalidate: true },
    fe.el,
    fu.el,
    h("fieldset", { class: "auth-roles" }, h("legend", {}, "I am a"), h("div", { class: "auth-list", role: "radiogroup", "aria-label": "Role" }, ...roleRows)),
    primary("Continue", () => undefined, "submit"),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pe = emailProblem(email.value);
    let pu = usernameProblem(user.value);
    if (!pu && account.usernameKnown(user.value)) pu = "This device already has an account with this username. Log in instead.";
    fe.error(pe);
    fu.error(pu);
    if (pe || pu) return;
    draft = { email: email.value.trim(), username: normalizeUsername(user.value), role };
    view = "signup-passkey";
    paint();
  });
  return sheet(
    head("Create your account", null, 1),
    form,
    h("p", { class: "auth-switch" }, "Already have an account? ", link("Log in", () => ((view = "login"), paint()))),
  );
}

function signupPasskeySheet(paint: () => void): HTMLElement {
  const msg = new Message();
  const demo = demoBlock(draft.role);
  noPasskeysNote(msg);
  const create = primary("Create passkey", async () => {
    // Set before the call: a new session re-renders the app at once, and that render shows onboarding.
    onboarding = true;
    view = null;
    const ok = await withPasskey(msg, demo, () => account.register(draft.role, { username: draft.username, email: draft.email }));
    if (!ok) {
      onboarding = false;
      view = "signup-passkey";
    }
  });
  create.disabled = !passkeysAvailable();
  const point = (ico: SVGElement, title: string, text: string) => h("li", {}, ico, h("span", {}, h("strong", {}, title), text));
  return sheet(
    head("Set up your passkey", `For @${draft.username}. It replaces a password.`, 2),
    h(
      "ul",
      { class: "auth-points" },
      point(fingerIcon(), "Unlock it your way", "Your device asks for your fingerprint, your face, or your device password or PIN."),
      point(keyIcon(), "Your keys come from it", "Every signature in JitsuinFi uses keys made from this passkey on your device."),
      point(syncIcon(), "Works on your other devices", "It syncs through your device's password manager, so you can log in elsewhere."),
    ),
    msg.el,
    create,
    demo,
    h("p", { class: "auth-switch" }, link("Back", () => ((view = "signup"), paint()))),
    footer(),
  );
}

// ---------- onboarding (after sign-up) ----------

function onboardingSheet(paint: () => void): HTMLElement {
  const s = account.current!;
  const who = account.who();
  const first = FIRST_STEP[s.role];
  const done = (): void => {
    onboarding = false;
  };
  const start = row(badge(s.role), first.label, first.line, chevron(), () => {
    done();
    location.hash = rolePath(s.role);
  });
  return sheet(
    head(who ? `You're set, @${who.username}` : "You're set", `You signed up as ${roleLabel(s.role)}.`, 3),
    h(
      "ol",
      { class: "auth-onboard" },
      h("li", {}, h("strong", {}, "Your passkey is your password"), "Each time you log in or sign something, your device asks for your fingerprint, face, or device password. No password to remember, nothing to back up."),
      h("li", {}, h("strong", {}, "Your key fingerprint"), h("span", { class: "auth-print" }, s.fingerprint), "It is the same on every device with this passkey. If it ever looks different, you picked another passkey."),
      h("li", {}, h("strong", {}, "Your first step"), h("div", { class: "auth-list" }, start)),
    ),
    h(
      "p",
      { class: "auth-switch" },
      link("I'll do it later", () => {
        done();
        // Opened from a role screen: show that screen now; from the account page: the role list.
        if (location.hash !== "#/account") window.dispatchEvent(new HashChangeEvent("hashchange"));
        else paint();
      }),
    ),
  );
}

// ---------- signed in: pick the role ----------

function rolesSheet(want?: Role): HTMLElement {
  const s = account.current!;
  const who = account.who();
  const msg = new Message();
  const pick = (r: Role) => async () => {
    msg.clear();
    if (r === s.role) {
      location.hash = rolePath(r);
      return;
    }
    try {
      await account.switchRole(r);
      location.hash = rolePath(r);
    } catch (e) {
      msg.error(e);
    }
  };
  const order = want && want !== s.role ? [want, ...ROLES.map((x) => x.role).filter((x) => x !== want)] : ROLES.map((x) => x.role);
  const logout = link("Log out", () => {
    view = "login";
    loginName = who?.username ?? "";
    account.lock();
  });
  const facts: Array<[string, string, boolean?]> = [];
  if (who) facts.push(["Username", `@${who.username}`]);
  if (who?.email) facts.push(["Email", who.email]);
  facts.push(["Key fingerprint", s.fingerprint, true], ["Keys from", s.demo ? "Test secret (test data only)" : "Your passkey"]);
  if (s.store) facts.push(["Deals", s.store.persistent ? "On this device, encrypted" : "This tab only"]);

  return sheet(
    head(want && want !== s.role ? `Continue as ${roleLabel(want)}?` : "Choose a role", "One passkey, separate keys for each role. Another role asks your passkey once."),
    h(
      "div",
      { class: "auth-list" },
      ...order.map((r) => {
        const b = row(badge(r), roleLabel(r), ROLE_LINE[r], r === s.role ? check() : chevron(), pick(r));
        if (r === s.role) b.setAttribute("aria-current", "true");
        return b;
      }),
    ),
    msg.el,
    h("dl", { class: "auth-facts" }, ...facts.flatMap(([k, v, mono]) => [h("dt", {}, k), h("dd", { class: mono ? "is-mono" : undefined }, v)])),
    h("div", { class: "auth-foot" }, logout, h("p", { class: "auth-host" }, "Logs out by itself after 15 minutes without input.")),
  );
}
