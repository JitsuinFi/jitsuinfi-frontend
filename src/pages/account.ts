// Account screen (HNK-22.T1 – T3; SEQ-00): register the one passkey, sign in to a role, add or
// switch roles with the same passkey, see the key fingerprint, lock. Demo mode (test secret)
// only where passkeys cannot give keys.
//
// Look: the landing's day paper and jitsuin seal (MASTER.md), laid out like an iOS sheet: large
// title, segmented role control, one primary call in the thumb zone, plain rows instead of cards.
// The passkey is the person's registered seal: created once, pressed for every sign-in. Each role
// carves its own kanji (売 supplier, 買 buyer as on the landing; 資 fund member).
import "../auth.css";
import { isNonProductionHost, PRODUCTION_RP_ID, roleLabel, ROLES, type Role } from "../lib/account";
import { account } from "../lib/app-session";
import { NoPrfError, passkeysAvailable } from "../lib/passkey";
import { h } from "../lib/ui";

// This tab only: the device's authenticator turned out to have no PRF, so offer test data.
let prfFailed = false;
// Set just before a sign-in, so the session screen presses the seal once when it first appears.
let pressOnArrival = false;

const KANJI: Record<Role, string> = { supplier: "売", buyer: "買", member: "資" };
const SVG_NS = "http://www.w3.org/2000/svg";
const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  if (s && want && s.role !== want) return screen(switchView(want));
  if (s) return screen(sessionView());
  return screen(signInView(want ?? "supplier"));
}

function screen(...children: Node[]): HTMLElement {
  return h("section", { class: "auth" }, h("div", { class: "auth-col" }, ...children));
}

// ---------- pieces ----------

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** The round seal: heavy ring, fine ring, the role's kanji. Same drawing as the landing's seal chain. */
class Seal {
  readonly stage = h("div", { class: "auth-stage" });
  private readonly mark = svg("svg", { viewBox: "0 0 100 100", class: "auth-seal", "aria-hidden": "true" });
  private readonly kanji = svg("text", { x: 50, y: 66, "text-anchor": "middle", class: "kanji" });

  constructor(role: Role, impression = false) {
    this.mark.append(svg("circle", { cx: 50, cy: 50, r: 44, class: "ring" }), svg("circle", { cx: 50, cy: 50, r: 36, class: "ring-fine" }), this.kanji);
    this.kanji.textContent = KANJI[role];
    this.mark.classList.toggle("is-impression", impression);
    this.stage.append(h("div", { class: "auth-shadow" }), this.mark);
  }

  /** Turns the seal to another role's kanji. */
  carve(role: Role): void {
    if (this.kanji.textContent === KANJI[role]) return;
    // The text changes at once (never waits on an animation event); the turn only shows it.
    this.kanji.textContent = KANJI[role];
    if (reduced()) return;
    this.mark.animate([{ transform: "rotate(28deg)", opacity: 0.25 }, { transform: "rotate(0deg)", opacity: 1 }], { duration: 300, easing: "cubic-bezier(.13,1.06,.31,.94)" });
  }

  /** Lifted while the passkey prompt is open. */
  lift(on: boolean): void {
    this.mark.classList.toggle("is-lifted", on);
    this.stage.classList.toggle("is-lifted", on);
  }

  /** The press: the seal comes down, squashes once, and leaves its impression on the paper. */
  press(): void {
    this.mark.classList.add("is-impression");
    if (reduced()) return;
    this.mark.animate(
      [
        { transform: "translateY(-46px) scale(1.22)", opacity: 0, filter: "blur(6px)" },
        { transform: "translateY(0) scale(1)", opacity: 1, filter: "blur(0px)", offset: 0.82 },
        { transform: "translateY(0) scale(1.04, .93)", opacity: 1, filter: "blur(0px)", offset: 0.91 },
        { transform: "translateY(0) scale(1)", opacity: 1, filter: "blur(0px)" },
      ],
      { duration: 367 + 134, easing: "cubic-bezier(.13,1.06,.31,.94)" },
    );
  }
}

/** iOS segmented control, one segment per role. Arrow keys move the choice. */
function roleControl(chosen: Role, onPick: (r: Role) => void): { el: HTMLElement; set: (r: Role) => void } {
  const thumb = h("span", { class: "auth-seg-thumb", "aria-hidden": "true" });
  const el = h("div", { class: "auth-seg", role: "radiogroup", "aria-label": "Role" }, thumb);
  const buttons = ROLES.map((r) =>
    h("button", { type: "button", role: "radio" }, h("span", { class: "seg-kanji", "aria-hidden": "true" }, KANJI[r.role]), r.label),
  );
  const set = (role: Role): void => {
    const i = ROLES.findIndex((r) => r.role === role);
    thumb.style.setProperty("--i", String(i));
    buttons.forEach((b, j) => {
      b.setAttribute("aria-checked", String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => onPick(ROLES[i].role));
    b.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + ROLES.length) % ROLES.length;
      buttons[next].focus();
      onPick(ROLES[next].role);
    });
  });
  el.append(...buttons);
  set(chosen);
  return { el, set };
}

/** A button that stays disabled while its action runs. */
function act(label: string, cls: string, run: () => void | Promise<void>): HTMLButtonElement {
  const b = h("button", { type: "button", class: cls }, label);
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await run();
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

class Message {
  readonly el = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  show(title: string, text: string): void {
    this.el.replaceChildren(h("strong", {}, title), text);
  }
  error(e: unknown): void {
    this.show("Not signed in", e instanceof Error ? e.message : String(e));
  }
  clear(): void {
    this.el.replaceChildren();
  }
}

function hostNote(): HTMLElement | null {
  return isNonProductionHost(location.hostname)
    ? h("p", { class: "auth-note" }, `Passkeys made on ${location.hostname} are separate from ${PRODUCTION_RP_ID}.`)
    : null;
}

// ---------- signed out ----------

function signInView(initial: Role): DocumentFragment {
  let chosen: Role = initial;
  const seal = new Seal(chosen);
  const msg = new Message();
  const demo = demoBlock(() => chosen);
  const control = roleControl(chosen, (r) => {
    chosen = r;
    control.set(r);
    seal.carve(r);
  });

  const press = (fn: () => Promise<unknown>) => async () => {
    msg.clear();
    seal.lift(true);
    pressOnArrival = true;
    try {
      await fn();
    } catch (e) {
      pressOnArrival = false;
      seal.lift(false);
      if (e instanceof NoPrfError) {
        prfFailed = true;
        msg.show("This passkey cannot make keys", e.message);
        demo.open = true;
        demo.hidden = false;
        return;
      }
      msg.error(e);
    }
  };

  const known = account.knownCredentials().length > 0;
  const can = passkeysAvailable();
  const calls = can
    ? known
      ? [
          act("Sign in with passkey", "auth-primary", press(() => account.signIn(chosen))),
          act("Use another passkey", "auth-plain", press(() => account.signIn(chosen, true))),
        ]
      : [
          act("Create your passkey", "auth-primary", press(() => account.register(chosen))),
          act("I already have one", "auth-plain", press(() => account.signIn(chosen, true))),
        ]
    : [];
  if (!can) msg.show("Passkeys are not available here", "Open the app over https or on localhost, or try it with test data.");
  demo.hidden = can && !prfFailed;
  demo.open = !can || prfFailed;

  const f = document.createDocumentFragment();
  f.append(
    h("h1", { class: "auth-title" }, known ? "Sign in" : "Your seal"),
    h(
      "p",
      { class: "auth-lede" },
      known
        ? "Press your passkey to open the role you pick. Every role has its own keys."
        : "One passkey, registered once, signs for every role. Your keys are made from it on this device; nothing secret leaves it.",
    ),
    seal.stage,
    control.el,
    msg.el,
    h("div", { class: "auth-actions is-sticky" }, ...calls),
    demo,
  );
  const note = hostNote();
  if (note) f.append(note);
  return f;
}

function demoBlock(role: () => Role): HTMLDetailsElement {
  const input = h("input", { type: "text", placeholder: "64 hex characters", spellcheck: "false", autocomplete: "off" });
  const msg = new Message();
  return h(
    "details",
    { class: "auth-demo" },
    h("summary", {}, "Try it with test data"),
    h(
      "label",
      { class: "auth-field" },
      h("span", {}, "Test secret"),
      input,
      h("small", {}, "For TES- invoices only. Anyone with this secret acts as you. It stays in this tab until you lock."),
    ),
    msg.el,
    h(
      "div",
      { class: "auth-actions" },
      act("Use test data", "auth-plain", async () => {
        msg.clear();
        pressOnArrival = true;
        try {
          await account.signInDemo(role(), bytesFromHex(input.value.trim()));
        } catch (e) {
          pressOnArrival = false;
          msg.error(e);
        }
      }),
    ),
  );
}

// ---------- signed in, another role was asked for ----------

function switchView(want: Role): DocumentFragment {
  const s = account.current!;
  const seal = new Seal(want);
  const msg = new Message();
  const f = document.createDocumentFragment();
  f.append(
    h("h1", { class: "auth-title" }, `Switch to ${roleLabel(want)}`),
    h("p", { class: "auth-lede" }, "Same passkey, separate keys for this role. One touch."),
    seal.stage,
    msg.el,
    h(
      "div",
      { class: "auth-actions is-sticky" },
      act(`Continue as ${roleLabel(want)}`, "auth-primary", async () => {
        msg.clear();
        seal.lift(true);
        pressOnArrival = true;
        try {
          await account.switchRole(want);
        } catch (e) {
          pressOnArrival = false;
          seal.lift(false);
          msg.error(e);
        }
      }),
      h("a", { class: "auth-plain is-quiet auth-link", href: rolePath(s.role) }, `Stay as ${roleLabel(s.role)}`),
    ),
  );
  return f;
}

// ---------- signed in ----------

function sessionView(): DocumentFragment {
  const s = account.current!;
  const seal = new Seal(s.role, true);
  const msg = new Message();
  if (pressOnArrival) {
    pressOnArrival = false;
    requestAnimationFrame(() => seal.press());
  }
  const control = roleControl(s.role, async (r) => {
    if (r === s.role) return;
    control.set(r);
    seal.carve(r);
    seal.lift(true);
    pressOnArrival = true;
    try {
      await account.switchRole(r);
    } catch (e) {
      pressOnArrival = false;
      seal.lift(false);
      control.set(s.role);
      seal.carve(s.role);
      msg.error(e);
    }
  });

  const rows: Array<[string, string]> = [
    ["Keys from", s.demo ? "Test secret (test data only)" : "Your passkey"],
    ["Signing", s.role === "member" ? "A fund member signs nothing" : "One touch per signature"],
    ["Locks", "After 15 minutes without input"],
  ];
  if (s.store) rows.push(["Deals", s.store.persistent ? "On this device, encrypted" : "This tab only (storage blocked)"]);

  const f = document.createDocumentFragment();
  f.append(
    h("h1", { class: "auth-title" }, roleLabel(s.role)),
    seal.stage,
    h("p", { class: "auth-print", "aria-label": `Key fingerprint ${s.fingerprint}` }, s.fingerprint, h("small", {}, "Your key fingerprint. It is the same on every device with this passkey.")),
    control.el,
    msg.el,
    h("div", { class: "auth-actions" }, h("a", { class: "auth-primary auth-link", href: rolePath(s.role) }, `Open ${roleLabel(s.role)}`)),
    h("ul", { class: "auth-rows" }, ...rows.map(([k, v]) => h("li", {}, h("span", { class: "k" }, k), h("span", { class: "v" }, v)))),
    h("div", { class: "auth-actions" }, act("Lock", "auth-plain is-danger", () => account.lock())),
  );
  return f;
}
