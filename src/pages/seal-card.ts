// The seal registration card 印鑑登録証 beside the sign-in sheet (HNK-30.T15, MASTER.md §8): a
// passkey is the user's jitsuin, the registered seal of JitsuinFi's name. The card follows the
// sheet as the user types: the username on the name line, the chosen role carved into the seal
// (売 supplier, 買 buyer, 資 fund member). Signed in, the seal is pressed and the card shows the
// passkey's real fingerprint. Nothing here is sent anywhere; it only reads the sheet and session.
import { account } from "../lib/app-session";
import { h } from "../lib/ui";
import { dur, ease, run, still } from "./try/anim";
import "./seal-card.css";

const KANJI: Record<string, string> = { supplier: "売", buyer: "買", member: "資" };
const WORD: Record<string, string> = { supplier: "Supplier", buyer: "Buyer", member: "Fund member" };

export function sealCard(sheetHost: HTMLElement): HTMLElement {
  const name = h("dd", {}, "");
  const role = h("dd", {}, "");
  const print = h("dd", { class: "is-mono" }, "");
  const glyph = h("b", { lang: "ja" }, "");
  const impression = h("span", { class: "sc-impression", "aria-hidden": "true" }, glyph);
  const hanko = h("span", { class: "sc-hanko", "aria-hidden": "true" }, h("span", { class: "sc-hanko-knob" }), h("span", { class: "sc-hanko-body" }), h("span", { class: "sc-hanko-face" }));
  const status = h("p", { class: "sc-status" }, "");
  const el = h(
    "aside",
    { class: "sc", "aria-label": "Your seal registration card" },
    h(
      "article",
      { class: "sc-card" },
      h("header", {}, h("p", { class: "sc-t", lang: "ja" }, "印鑑登録証"), h("p", { class: "sc-sub" }, "Seal registration card · JitsuinFi")),
      h(
        "dl",
        {},
        h("dt", {}, h("span", { lang: "ja" }, "氏名"), "Name"),
        name,
        h("dt", {}, h("span", { lang: "ja" }, "資格"), "Role"),
        role,
        h("dt", {}, h("span", { lang: "ja" }, "印影"), "Fingerprint"),
        print,
      ),
      h("div", { class: "sc-seat" }, impression, h("small", { lang: "ja" }, "登録印")),
      status,
    ),
    hanko,
  );

  let pressed = false;
  const paint = () => {
    const s = account.current;
    const typed = sheetHost.querySelector<HTMLInputElement>('input[name="username"]')?.value.trim() ?? "";
    const chosen = sheetHost.querySelector<HTMLElement>('[role="radio"][aria-checked="true"] .auth-row-label')?.textContent ?? "";
    const r = s?.role ?? Object.keys(WORD).find((k) => WORD[k] === chosen) ?? "";
    name.textContent = typed || (s ? "your passkey" : "not yet registered");
    role.textContent = r ? WORD[r] : "choose a role";
    glyph.textContent = r ? KANJI[r] : "";
    print.textContent = s ? s.fingerprint : "made by your device, never leaves it";
    el.dataset.state = s ? "registered" : r ? "carved" : "blank";
    status.textContent = s
      ? "Registered. Your passkey signs for you; JitsuinFi never sees it."
      : sheetHost.querySelector(".auth-sheet h1, .auth-sheet h2")?.textContent?.includes("passkey")
        ? "Your device is about to carve this seal into a passkey."
        : "Your passkey is your jitsuin: a seal only your device can press.";
    if (s && !pressed) {
      pressed = true;
      if (!still()) {
        void (async () => {
          await run(hanko, { y: [-40, 18], duration: dur.seal }, ease.snapSettle);
          void run(impression, { scale: [1.4, 1], opacity: [0, 1], duration: dur.seal }, ease.snapSettle);
          await run(hanko, { y: [18, -40], duration: dur.exit }, ease.accelExit);
        })();
      }
    }
    if (!s) pressed = false;
  };
  new MutationObserver(paint).observe(sheetHost, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-checked"] });
  sheetHost.addEventListener("input", paint);
  // the page re-renders on every session change; stop listening once this card is gone
  let seen = false;
  const off = account.onChange(() => {
    if (el.isConnected) seen = true;
    else if (seen) return off();
    paint();
  });
  queueMicrotask(paint);
  return el;
}
