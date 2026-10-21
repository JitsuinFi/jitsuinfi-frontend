// The lens (M-04, HNK-30.T6): hold the hanko for 1.5s and the invoice burns from its edges into
// what anyone holding the published board key reads of financier A's registration. Honest by
// addition: what the key also shows is printed under the memo. Release and the paper returns.
import { h } from "../../lib/ui";
import { still, tween } from "./anim";

const short = (x: string) => `${x.slice(0, 12)}…${x.slice(-6)}`;

export interface LensData {
  invoice: { id: string; amount: string; buyer: string; due: string };
  memo: { kind: string; n: string; commitment: string; classes: string; signature: string; where: string };
}

export function lens(load: () => Promise<LensData>): HTMLElement {
  const paper = h("div", { class: "ln-paper", "aria-label": "What the parties hold" });
  const chain = h("div", { class: "ln-chain", "aria-label": "What anyone with the board key sees" });
  const ring = h("span", { class: "ln-ring", "aria-hidden": "true" });
  const hold = h(
    "button",
    { type: "button", class: "ln-hold", "aria-pressed": "false" },
    h("span", { class: "ln-hanko", "aria-hidden": "true" }, ring, h("b", { lang: "ja" }, "視")),
    h("span", {}, "Hold to see it as the world does"),
  ) as HTMLButtonElement;
  const stage = h("div", { class: "ln-stage" }, chain, paper);
  let burn = 0;
  let target = 0;
  let running: Promise<void> | null = null;
  const set = (v: number) => {
    burn = v;
    stage.style.setProperty("--burn", v.toFixed(3));
    ring.style.setProperty("--p", v.toFixed(3));
    hold.setAttribute("aria-pressed", String(v > 0.5));
  };
  const go = async (to: number) => {
    target = to;
    if (running) return;
    while (Math.abs(burn - target) > 0.001) {
      const t = target;
      running = tween(burn, t, Math.abs(t - burn) * (t > burn ? 1500 : 600), set, (x) => x);
      await running;
      running = null;
    }
  };
  hold.addEventListener("pointerdown", (e) => {
    hold.setPointerCapture(e.pointerId);
    void go(1);
  });
  for (const ev of ["pointerup", "pointercancel"]) hold.addEventListener(ev, () => void go(0));
  hold.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      void go(target > 0.5 ? 0 : 1);
    }
  });
  if (still()) hold.addEventListener("click", () => void go(target > 0.5 ? 0 : 1));

  void load().then(
    (d) => {
      paper.replaceChildren(
        h("p", { class: "ln-title", lang: "ja" }, "請 求 書"),
        h("dl", {}, ...([
          ["No.", d.invoice.id],
          ["ご請求金額", d.invoice.amount],
          ["御中", short(d.invoice.buyer)],
          ["支払期日", d.invoice.due],
          ["Financier", "A, by name in the letter"],
        ] as const).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
        h("span", { class: "ln-seal", "aria-hidden": "true", lang: "ja" }, "買"),
      );
      chain.replaceChildren(
        h("p", { class: "ln-k" }, `Board memo · ${d.memo.where}`),
        h("dl", {}, ...([
          ["Entry", d.memo.kind],
          ["N", short(d.memo.n)],
          ["Financier", `commitment ${short(d.memo.commitment)}`],
          ["Classes", d.memo.classes],
          ["Supplier signature", short(d.memo.signature)],
        ] as const).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
        h("p", { class: "ln-also" }, "The key also shows the small amount each post sends to the board address, the memo's length and layout, and the block's time. No name, no amount, no buyer."),
      );
    },
    (e) => paper.replaceChildren(h("p", {}, e instanceof Error ? e.message : String(e))),
  );
  set(0);
  return h("div", { class: "ln" }, stage, hold);
}
