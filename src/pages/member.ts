// Fund member screen (HNK-22.T2, BL-D21-06): a member holds no signing key, only an inbox key,
// so this screen never asks for a stamp. Receipts and Merkle paths arrive in the inbox once the
// relay exists (HNK-22.T6, HNK-23).
//
// The stage (HNK-30.T17, MASTER.md §8): the fund's vault in the registry room (hairline's vault
// door; circling the pointer turns its dial), with the member's key plate beside it and the
// receipt tray where the fund's receipts will land.
import { vault } from "@lucasmarkes/hairline";
import { account } from "../lib/app-session";
import { card, h, kv } from "../lib/ui";
import { deskPage } from "./desk";

export function memberPage(): HTMLElement {
  const s = account.current!;
  const door = h("div", { class: "mb-vault" });
  requestAnimationFrame(() => vault(door, { intensity: 0.6, play: true, label: "The fund's vault: what it holds for its members" }));
  const stage = h(
    "section",
    { class: "ds mb", "aria-label": "The fund's vault" },
    h(
      "div",
      { class: "mb-plate" },
      h("p", { class: "mb-plate-k", lang: "ja" }, "会員証"),
      h("p", { class: "mb-plate-sub" }, "Fund member · key fingerprint"),
      h("p", { class: "mb-plate-v" }, s.fingerprint),
      h("p", { class: "mb-plate-note" }, "An inbox key only. You never sign anything here."),
    ),
    h(
      "div",
      { class: "mb-room" },
      door,
      h(
        "div",
        { class: "mb-tray", role: "status" },
        h("p", {}, h("b", { lang: "ja" }, "受領書"), "Receipts"),
        h("span", { class: "mb-slip is-empty" }, "Your receipts and the Merkle path of your share land here once the document relay delivers them."),
      ),
    ),
  );
  return h(
    "div",
    { "data-wide": "true" },
    deskPage({
      glyph: "資",
      eyebrow: "Fund member",
      title: "What the fund holds for you",
      lede: "See your share of the fund's receivables, without signing anything.",
      stage,
      docs: [
        card(
          "Inbox",
          "Your receipts",
          "The fund sends your receipts and the Merkle path of your share to your inbox. Nothing here needs a signature.",
          kv([
            ["Key fingerprint", s.fingerprint, true],
            ["Inbox", "not connected yet: receipts arrive once the document relay is live"],
          ]),
        ),
      ],
    }),
  );
}
