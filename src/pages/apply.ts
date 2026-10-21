// Apply as financier (HNK-26.T25, D-46 B): a financier gets its own node from the node provider.
// The application is sealed to the provider's mailbox (the relay keeps ciphertext only); the
// signed invite comes back sealed to a mailbox key this browser keeps for the reply.
//
// The stage (HNK-30.T15, MASTER.md §8): the 登記所's application window. The applicant fills in a
// 申請書 on the counter; sending folds it into an envelope sealed 〆 and drops it into the relay's
// post box behind the glass. The invite comes back as a letter in the reply tray, with the
// provider's signature checked before the link is shown.
import { relayDeps } from "../lib/app-relay";
import { encodeMessage, verifyHeader, type Header } from "../lib/relay-message";
import { draft, ensureMailbox, receive, send } from "../lib/relay";
import { inviteLinkOk, PROVIDER } from "../lib/provider";
import { relay as hairlineRelay } from "@lucasmarkes/hairline";
import { h } from "../lib/ui";
import { dur, ease, run, still } from "./try/anim";
import "./try.css";
import "./apply.css";

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
  // ---------- the counter: the application form ----------
  const name = h("input", { type: "text", maxlength: "80", autocomplete: "organization", placeholder: "e.g. Kurogane Capital" }) as HTMLInputElement;
  const contact = h("input", { type: "text", maxlength: "120", autocomplete: "email", placeholder: "email or phone" }) as HTMLInputElement;
  const note = h("textarea", { rows: "3", maxlength: "1000", placeholder: "What you finance, roughly how much, where you are" }) as HTMLTextAreaElement;
  const line = (jp: string, en: string, field: HTMLElement) => h("label", { class: "ap-line" }, h("span", {}, h("b", { lang: "ja" }, jp), en), field);
  const form = h(
    "article",
    { class: "ap-form" },
    h("header", {}, h("p", { class: "ap-t", lang: "ja" }, "申 請 書"), h("p", { class: "ap-sub" }, "Application for a financier node")),
    line("名称", "Company or fund", name),
    line("連絡先", "How we reach you", contact),
    line("備考", "Anything we should know (optional)", note),
    h("p", { class: "ap-small" }, "Sealed to the node provider before it leaves this page. The relay stores ciphertext only."),
  );
  const post = h("button", { type: "button", class: "seal-btn" }, h("span", {}, "Seal it and post it")) as HTMLButtonElement;
  const check = h("button", { type: "button", class: "ink-link" }, "Check for my invite") as HTMLButtonElement;
  const desk = h("div", { class: "ct-desk ap-desk" }, form, h("div", { class: "ct-act" }, post, check));

  // ---------- behind the glass: the relay's post box and the reply tray ----------
  const say = h("p", { class: "ct-say", "aria-live": "polite" });
  const speak = (glyph: string, text: string) => say.replaceChildren(h("span", { class: "hanko", lang: "ja" }, glyph), h("span", {}, text));
  const sentAt = store()?.getItem(SENT);
  speak(sentAt ? "待" : "申", sentAt ? `Your application went in on ${sentAt.slice(0, 10)}. The provider reviews it and sets up your node; the invite comes back to this tray, in this browser.` : "A financier runs its own node: its wallet, its keys, its console. Apply here; the provider sets up your node and sends you a one-time invite.");
  const box = h(
    "div",
    { class: "ap-box", "aria-hidden": "true" },
    h("span", { class: "ap-box-mouth" }),
    h("span", { class: "ap-box-label", lang: "ja" }, "中継"),
    h("span", { class: "ap-box-sub" }, "relay"),
    h("span", { class: "ap-box-count" }, sentAt ? "1 sealed" : "empty"),
  );
  const tray = h("div", { class: "ap-tray" }, h("p", { class: "ap-tray-k" }, h("b", { lang: "ja" }, "返信"), "Reply tray"));
  // the relay drawn as hairline's hub of branches: a message hops tile by tile to one mailbox
  const route = h("div", { class: "ap-route" });
  requestAnimationFrame(() => hairlineRelay(route, { intensity: 0.6, play: true, label: "The relay: a sealed message hops to one mailbox" }));
  const room = h("div", { class: "ct-room ap-room" }, h("div", { class: "ct-light", "aria-hidden": "true" }, h("span", { class: "ct-cone" })), h("span", { class: "ct-lamp", "aria-hidden": "true" }, h("i")), box, tray, route, say);
  const windowEl = h(
    "div",
    { class: "ct-window" },
    h("p", { class: "ct-plaque" }, h("span", { lang: "ja" }, "申請窓口"), h("small", {}, "Applications")),
    room,
    h("span", { class: "ct-grille", "aria-hidden": "true" }),
    h("span", { class: "ct-slot", "aria-hidden": "true" }),
  );
  const scene = h("section", { class: "ct ap", "aria-label": "The application window" }, desk, windowEl);

  const delta = (from: Element, to: Element) => {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
  };

  post.addEventListener("click", async () => {
    post.disabled = true;
    try {
      if (!name.value.trim() || !contact.value.trim()) throw new Error("Give a name and a way to reach you first.");
      const seed = replySeed();
      const me = await ensureMailbox(seed, relayDeps);
      const body: Record<string, string> = { name: name.value.trim(), contact: contact.value.trim() };
      if (note.value.trim()) body.note = note.value.trim();
      const hd = draft("financier.apply", { role: "applicant", mailbox_pk: me.mailbox_pk }, PROVIDER.mailbox_pk, relayDeps, { body }) as Header;
      await send(PROVIDER.mailbox_pk, await encodeMessage(hd), relayDeps);
      store()?.setItem(SENT, new Date().toISOString());
      // fold the form into an envelope and drop it into the post box
      const env = h("span", { class: "ap-env", "aria-hidden": "true" }, h("b", { lang: "ja" }, "〆"));
      scene.append(env);
      const f = form.getBoundingClientRect();
      const s = scene.getBoundingClientRect();
      env.style.left = `${f.left - s.left + f.width / 2 - 70}px`;
      env.style.top = `${f.top - s.top + f.height / 2 - 46}px`;
      if (!still()) {
        await run(form, { scaleY: [1, 0.3], opacity: [1, 0.2], duration: dur.enter }, ease.softInOut);
        const d = delta(env, box.querySelector(".ap-box-mouth")!);
        await run(env, { x: [0, d.x * 0.6, d.x], y: [0, d.y - 120, d.y - 10], rotate: [-4, 8, 0], duration: 900 }, ease.softInOut);
        await run(env, { y: d.y + 30, scale: 0.6, opacity: [1, 0], duration: dur.exit }, ease.accelExit);
        void run(form, { scaleY: [0.3, 1], opacity: [0.2, 1], duration: dur.enter });
      }
      env.remove();
      box.querySelector(".ap-box-count")!.textContent = "1 sealed";
      speak("済", "Posted. Sealed to the node provider: the relay only holds ciphertext. Your invite will come back to this tray, in this browser.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      post.disabled = false;
    }
  });

  check.addEventListener("click", async () => {
    check.disabled = true;
    try {
      if (!store()?.getItem(SEED)) throw new Error("Send an application from this browser first.");
      speak("待", "Opening the reply tray with this browser's key…");
      const r = await receive(replySeed(), relayDeps);
      const invite = r.messages.map((m) => m.message.header).find((x) => x.type === "financier.invite");
      if (!invite) {
        speak("待", "No invite yet. The provider reviews each application; check again later.");
        return;
      }
      const link = (invite.body as { link?: string }).link ?? "";
      if (!(await verifyHeader(invite, PROVIDER.signer_pk)) || !inviteLinkOk(link)) {
        speak("偽", "A letter arrived, but it is not signed by the node provider. Do not open it.");
        return;
      }
      const letter = h(
        "article",
        { class: "ap-letter" },
        h("p", { class: "ap-t", lang: "ja" }, "招 待 状"),
        h("p", {}, "Your node is ready. Open the invite to create the passkey for your financier console. It works once: open it on the device you will use."),
        h("a", { class: "seal-btn", href: link }, h("span", {}, "Open your invite")),
        h("span", { class: "ap-letter-seal", lang: "ja", "aria-hidden": "true" }, "提供者"),
      );
      tray.querySelector(".ap-letter")?.remove();
      tray.append(letter);
      if (!still()) await run(letter, { y: [-60, 0], rotate: [-6, -1], opacity: [0, 1], duration: dur.enter + 100 }, ease.snapSettle);
      speak("認", "Signed by the node provider. The invite is in the tray.");
    } catch (e) {
      speak("拒", e instanceof Error ? e.message : String(e));
    } finally {
      check.disabled = false;
    }
  });

  return h(
    "div",
    { class: "try ap-page", "data-wide": "true" },
    h(
      "header",
      { class: "try-head" },
      h("p", { class: "try-case" }, h("span", { lang: "ja" }, "申"), "Financier application"),
      h("h1", {}, "Become a financier"),
      h("p", {}, "Run your own JitsuinFi node, managed for you: its wallet, its keys and a passkey console. No terminal."),
    ),
    scene,
  );
}
