// The financier's side: the node console drawn on a phone at a true 19.5:9 (390 × 844 points),
// with the console's own screens: an offer arriving, its three seals, the advance waiting for the
// passkey. It plays once when it scrolls in.
import { inView } from "motion";
import { h } from "../../lib/ui";
import { dur, ease, run, still, wait } from "./anim";

export function phone(): HTMLElement {
  const offer = h(
    "div",
    { class: "ph-offer" },
    h("span", { class: "ph-badge", lang: "ja" }, "売"),
    h("div", {}, h("b", {}, "Financing offer"), h("small", {}, "from a supplier · just now")),
    h("span", { class: "ph-ok", lang: "ja" }, "認"),
  );
  const step = (glyph: string, word: string, done: boolean) => h("span", { class: done ? "is-done" : undefined }, h("i", { lang: "ja" }, glyph), word);
  const seals = h("div", { class: "ph-seals" }, step("売", "supplier", true), step("買", "buyer", true), step("証", "you", false));
  const advance = h("div", { class: "ph-adv" }, h("small", {}, "Advance, waiting for your passkey"), h("strong", {}, "0.00036"), h("span", {}, "ZEC"));
  const pass = h("span", { class: "ph-pass" }, h("i", { "aria-hidden": "true" }), "Approve with passkey");
  const screen = h(
    "div",
    { class: "ph-screen" },
    h("div", { class: "ph-status", "aria-hidden": "true" }, h("span", {}, "9:41"), h("span", { class: "ph-island" }), h("span", { class: "ph-bat" })),
    h("p", { class: "ph-app" }, h("span", { class: "ph-mark", lang: "ja" }, "印"), "Financier console"),
    h("p", { class: "ph-h" }, "Mailbox"),
    offer,
    h("p", { class: "ph-h" }, "Seals on the letter"),
    seals,
    advance,
    pass,
    h("span", { class: "ph-home", "aria-hidden": "true" }),
  );
  const el = h("div", { class: "ph", role: "img", "aria-label": "The financier console on a phone: an offer, its three seals, the advance waiting for the passkey" }, screen);
  if (!still()) {
    for (const x of [offer, seals, advance, pass]) x.style.opacity = "0";
    inView(el, () => {
      void (async () => {
        await run(offer, { opacity: [0, 1], x: [60, 0], duration: dur.enter });
        await run(seals, { opacity: [0, 1], duration: dur.enter });
        await wait(200);
        await run(advance, { opacity: [0, 1], y: [10, 0], duration: dur.enter });
        await run(pass, { opacity: [0, 1], scale: [0.94, 1], duration: dur.seal }, ease.snapSettle);
      })();
    }, { amount: 0.5 });
  }
  return el;
}
