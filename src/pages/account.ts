// Account screen (HNK-22.T1 – T3; SEQ-00): register the one passkey, sign in to a role, add or
// switch roles with the same passkey, see the key fingerprint, lock. Demo mode (test secret)
// only where passkeys cannot give keys.
//
// Look: a consumer login sheet (the familiar "log in or sign up" modal) in JitsuinFi's palette.
// Passkey first: step 1 signs in or signs up with the passkey, step 2 picks the role. The first
// sign-in opens the role this browser used last; another role is one more passkey touch.
import "../auth.css";
import { isNonProductionHost, PRODUCTION_RP_ID, roleLabel, ROLES, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { h } from "../lib/ui";

// This tab only: the device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;

const KANJI: Record<Role, string> = { supplier: "売", buyer: "買", member: "資" };
const ROLE_LINE: Record<Role, string> = {
  supplier: "Issue invoices and get them financed",
  buyer: "Sign invoices and pay when they are due",
  member: "See what the fund holds for you",
};
const SVG_NS = "http://www.w3.org/2000/svg";

export function rolePath(role: Role): string {
  return `#/${role}`;
}

function bytesFromHex(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error("a test secret is 64 hex characters");
  return Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
}

/** `want`: the role screen the user tried to open. */
export function accountPage(want?: Role): HTMLElement {
  return h("section", { class: "auth" }, account.current ? rolesSheet(want) : loginSheet(want));
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
  return svg(
    "svg",
    { viewBox: "0 0 100 100", class: "auth-logo", "aria-hidden": "true" },
    svg("circle", { cx: 50, cy: 50, r: 44, class: "ring" }),
    svg("circle", { cx: 50, cy: 50, r: 36, class: "ring-fine" }),
    t,
  );
}

/** Passkey glyph: a person with a key. */
function passkeyIcon(): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", class: "auth-ico", "aria-hidden": "true" },
    svg("circle", { cx: 9, cy: 8, r: 3.5 }),
    svg("path", { d: "M3 19.5c0-3.3 2.7-5.5 6-5.5 1.2 0 2.3.3 3.2.8" }),
    svg("circle", { cx: 17.5, cy: 13.5, r: 2.5 }),
    svg("path", { d: "M17.5 16v5M17.5 18.5h2M17.5 20.5h1.5" }),
  );
}

function plusIcon(): SVGElement {
  return svg("svg", { viewBox: "0 0 24 24", class: "auth-ico", "aria-hidden": "true" }, svg("path", { d: "M12 5v14M5 12h14" }));
}

function lockIcon(): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", class: "auth-ico is-small", "aria-hidden": "true" },
    svg("rect", { x: 5, y: 10.5, width: 14, height: 9.5, rx: 2 }),
    svg("path", { d: "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" }),
  );
}

function chevron(): SVGElement {
  return svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-chevron", "aria-hidden": "true" }, svg("path", { d: "M9.5 6l6 6-6 6" }));
}

function check(): SVGElement {
  return svg("svg", { viewBox: "0 0 24 24", class: "auth-ico is-check", "aria-hidden": "true" }, svg("path", { d: "M5.5 12.5l4 4 9-9" }));
}

function badge(role: Role): HTMLElement {
  return h("span", { class: "auth-badge", "aria-hidden": "true" }, KANJI[role]);
}

/** A list row button: icon, label (and a line under it), trailing mark. Shows "waiting" while it runs. */
function row(icon: Node, label: string, line: string | null, trail: Node | null, run: () => Promise<void>): HTMLButtonElement {
  const text = h("span", { class: "auth-row-text" }, h("span", { class: "auth-row-label" }, label), line ? h("span", { class: "auth-row-line" }, line) : null);
  const b = h("button", { type: "button", class: "auth-row" }, icon, text, trail ?? h("span", {}));
  b.addEventListener("click", async () => {
    const sheet = b.closest(".auth-sheet");
    sheet?.querySelectorAll("button").forEach((x) => (x.disabled = true));
    b.classList.add("is-waiting");
    try {
      await run();
    } finally {
      b.classList.remove("is-waiting");
      sheet?.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  });
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

function footer(): HTMLElement {
  return h(
    "div",
    { class: "auth-foot" },
    h("p", { class: "auth-protected" }, lockIcon(), "Protected by your device passkey"),
    isNonProductionHost(location.hostname)
      ? h("p", { class: "auth-host" }, `Passkeys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`)
      : null,
  );
}

// ---------- step 1: log in or sign up (passkey first) ----------

function loginSheet(want?: Role): HTMLElement {
  const role: Role = want ?? account.lastRole() ?? "supplier";
  const msg = new Message();
  const demo = demoBlock(role);
  const can = passkeysAvailable();

  const go = (fn: () => Promise<unknown>) => async () => {
    msg.clear();
    try {
      await fn();
    } catch (e) {
      if (e instanceof NoPrfError) {
        prfFailed = true;
        msg.show(e.message.charAt(0).toUpperCase() + e.message.slice(1));
        demo.hidden = false;
        demo.open = true;
        return;
      }
      msg.error(e);
    }
  };

  if (!can) msg.show("Passkeys are not available in this browser. Open the app over https or on localhost, or use test data.");
  demo.hidden = can && !prfFailed;
  demo.open = !can || prfFailed;

  return sheet(
    h("div", { class: "auth-head" }, logo(), h("h1", { class: "auth-title", id: "auth-title" }, "Log in or sign up"), h("p", { class: "auth-sub" }, "JitsuinFi uses your passkey. No password, no email.")),
    can
      ? h(
          "div",
          { class: "auth-list" },
          row(passkeyIcon(), "Continue with passkey", null, chevron(), go(() => account.signIn(role, true))),
          row(plusIcon(), "Create a new passkey", null, chevron(), go(() => account.register(role))),
        )
      : null,
    msg.el,
    demo,
    footer(),
  );
}

function demoBlock(role: Role): HTMLDetailsElement {
  const input = h("input", { type: "text", placeholder: "64 hex characters", spellcheck: "false", autocomplete: "off", "aria-label": "Test secret" });
  const msg = new Message();
  const use = h("button", { type: "button", class: "auth-button is-secondary" }, "Use test data");
  use.addEventListener("click", async () => {
    msg.clear();
    use.disabled = true;
    try {
      await account.signInDemo(role, bytesFromHex(input.value.trim()));
    } catch (e) {
      msg.error(e);
    } finally {
      use.disabled = false;
    }
  });
  return h(
    "details",
    { class: "auth-demo" },
    h("summary", {}, "Use test data instead"),
    h("div", { class: "auth-demo-body" }, input, h("small", {}, "For TES- invoices only. Anyone with this secret acts as you."), use, msg.el),
  );
}

// ---------- step 2: pick the role ----------

function rolesSheet(want?: Role): HTMLElement {
  const s = account.current!;
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
  const logout = h("button", { type: "button", class: "auth-link" }, "Log out");
  logout.addEventListener("click", () => account.lock());

  return sheet(
    h(
      "div",
      { class: "auth-head" },
      logo(),
      h("h1", { class: "auth-title", id: "auth-title" }, want && want !== s.role ? `Continue as ${roleLabel(want)}?` : "Choose a role"),
      h("p", { class: "auth-sub" }, "One passkey, separate keys for each role. Another role asks your passkey once."),
    ),
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
    h(
      "dl",
      { class: "auth-facts" },
      h("dt", {}, "Key fingerprint"),
      h("dd", { class: "is-mono" }, s.fingerprint),
      h("dt", {}, "Keys from"),
      h("dd", {}, s.demo ? "Test secret (test data only)" : "Your passkey"),
      ...(s.store ? [h("dt", {}, "Deals"), h("dd", {}, s.store.persistent ? "On this device, encrypted" : "This tab only")] : []),
    ),
    h("div", { class: "auth-foot" }, logout, h("p", { class: "auth-host" }, "Logs out by itself after 15 minutes without input.")),
  );
}
