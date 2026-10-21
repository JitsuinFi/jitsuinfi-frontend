// Fund member screen (HNK-22.T2, BL-D21-06, HNK-30.T22–T23, D-49): a member holds no signing key,
// only an inbox key, so this screen never asks for a stamp. The fund's receipts, Merkle paths and
// payouts arrive in the inbox; the units they name are kept in this device's encrypted store,
// because each receipt's withdraw token is the only thing that opens those units.
//
// The stage (HNK-30.T17, MASTER.md §8): the fund's vault in the registry room (hairline's vault
// door; circling the pointer turns its dial), with the member's key plate beside it and the
// receipt tray: one deposit slip (受領書) per holding, stamped 認 when its path holds against the
// period's root, 偽 when it does not, 待 before the first close. A slip turns into a withdrawal
// request (払戻請求) in place.
import { vault } from "@lucasmarkes/hairline";
import { account } from "../lib/app-session";
import { myIdentity, relayDeps } from "../lib/app-relay";
import { addPath, addPayout, addReceipt, EMPTY, openPeriod, valueOf, withdrawBody, type Holding, type Wallet } from "../lib/fund";
import { draft, send } from "../lib/relay";
import { encodeMessage, type Header } from "../lib/relay-message";
import { banner, card, h, Out } from "../lib/ui";
import { deskPage } from "./desk";
import { mailboxCard } from "./mailbox";

const KEY = "fund:wallet";
const zec = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;
const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-4)}`;

async function load(): Promise<Wallet> {
  return (await account.current?.store?.get<Wallet>(KEY)) ?? EMPTY;
}

async function save(w: Wallet): Promise<void> {
  const store = account.current?.store;
  if (!store) throw new Error("this device cannot keep your units: sign in again");
  await store.put(KEY, w);
}

export function memberPage(): HTMLElement {
  const s = account.current!;
  const door = h("div", { class: "mb-vault" });
  requestAnimationFrame(() => vault(door, { intensity: 0.6, play: true, label: "The fund's vault: what it holds for its members" }));
  const slips = h("div", { class: "mb-slips", "aria-live": "polite" });
  const total = h("p", { class: "mb-plate-sum" }, "");

  const render = async () => {
    const w = await load();
    const held = w.holdings.reduce((n, x) => n + valueOf(x.units, x.nav), 0);
    total.textContent = w.holdings.length ? `${zec(held)} at the last price the fund showed you` : "No units yet";
    if (!w.holdings.length) {
      slips.replaceChildren(
        h("span", { class: "mb-slip is-empty" }, "Give the fund manager your contact card (below), then deposit. Their receipt lands in your inbox and becomes a slip here."),
      );
      return;
    }
    slips.replaceChildren(...w.holdings.map((x) => slip(x)), ...w.payouts.slice(-3).reverse().map((p) => h("p", { class: "mb-paid" }, h("b", { lang: "ja" }, "済"), `Period ${p.period}: ${zec(p.amount_zat)} paid · ${short(p.txid)}`)));
  };

  const slip = (x: Holding): HTMLElement => {
    const stamp = !x.path ? ["待", "wait", "Waiting for the first close of the period"] : x.path.ok ? ["認", "ok", `Your units are in the period ${x.path.period} root`] : ["偽", "bad", `The period ${x.path.period} path does not hold: tell the auditor`];
    const out = new Out();
    const el = h(
      "article",
      { class: "mb-doc", "data-stamp": stamp[1] },
      h("header", {}, h("b", { lang: "ja" }, "受領書"), h("small", {}, x.deposit_txid ? `Deposit ${short(x.deposit_txid)}` : "Units left after a payout")),
      h("p", { class: "mb-doc-units" }, x.units.toLocaleString("en"), h("small", {}, " units")),
      h("p", { class: "mb-doc-value" }, `≈ ${zec(valueOf(x.units, x.nav))}`),
      h("span", { class: "mb-doc-stamp", lang: "ja", title: stamp[2], "aria-label": stamp[2] }, stamp[0]),
      x.pending ? h("p", { class: "mb-doc-note" }, `Withdrawal of ${x.pending.units === "all" ? "all units" : `${x.pending.units} units`} asked for period ${x.pending.period}: paid at the end of that period.`) : null,
      out.el,
    );
    if (!x.pending) {
      const ask = h("button", { type: "button", class: "mb-doc-ask" }, "Ask to withdraw");
      ask.addEventListener("click", () => {
        ask.replaceWith(request(x, out));
      });
      el.append(ask);
    }
    return el;
  };

  const request = (x: Holding, out: Out): HTMLElement => {
    const units = h("input", { type: "text", inputmode: "numeric", value: "all", "aria-label": "Units to withdraw, or all" }) as HTMLInputElement;
    const address = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "utest1…", "aria-label": "A new shielded address to be paid at" }) as HTMLInputElement;
    const go = h("button", { type: "submit" }, "Send the request");
    const form = h(
      "form",
      { class: "mb-req" },
      h("p", { lang: "ja", class: "mb-req-k" }, "払戻請求"),
      h("label", {}, h("span", {}, "Units"), units),
      h("label", {}, h("span", {}, "Pay to"), address),
      h("small", {}, "Paid from the fund's cash at the end of the period, at that period's price. A fresh address keeps your payments apart."),
      go,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      go.setAttribute("disabled", "");
      try {
        const period = openPeriod(x);
        const u = units.value.trim().toLowerCase() === "all" ? "all" : Number(units.value.trim());
        const body = withdrawBody(x, u, address.value, period);
        const hd = draft("fund.withdraw", { role: "member", mailbox_pk: myIdentity().mailbox_pk }, x.fund_mailbox, relayDeps, { body }) as Header;
        await send(x.fund_mailbox, await encodeMessage(hd), relayDeps);
        const w = await load();
        await save({ ...w, holdings: w.holdings.map((y) => (y.leaf_id === x.leaf_id ? { ...y, pending: { units: u, period, sent_at: Date.now() } } : y)) });
        await render();
      } catch (err) {
        go.removeAttribute("disabled");
        out.error(err);
      }
    });
    return form;
  };

  const keep = (step: (w: Wallet, hd: Header) => Promise<Wallet>, done: string) => ({
    label: "Keep it",
    run: async (r: { message: { header: Header } }) => {
      await save(await step(await load(), r.message.header));
      await render();
      return done;
    },
  });

  const stage = h(
    "section",
    { class: "ds mb", "aria-label": "The fund's vault" },
    h(
      "div",
      { class: "mb-plate" },
      h("p", { class: "mb-plate-k", lang: "ja" }, "会員証"),
      h("p", { class: "mb-plate-sub" }, "Fund member · key fingerprint"),
      h("p", { class: "mb-plate-v" }, s.fingerprint),
      total,
      h("p", { class: "mb-plate-note" }, s.store?.persistent === false ? "This browser keeps nothing after you close it: your withdraw tokens would be lost. Use a normal window." : "An inbox key only. You never sign anything here."),
    ),
    h(
      "div",
      { class: "mb-room" },
      door,
      h("div", { class: "mb-tray", role: "status" }, h("p", {}, h("b", { lang: "ja" }, "受領書"), "Your units"), slips),
    ),
  );
  void render().catch((e) => slips.replaceChildren(banner("bad", "Your units could not be read", e instanceof Error ? e.message : String(e))));

  return h(
    "div",
    { "data-wide": "true" },
    deskPage({
      glyph: "資",
      eyebrow: "Fund member",
      title: "What the fund holds for you",
      lede: "Your units, checked against the root the manager signs each period; withdraw at the period's price.",
      stage,
      docs: [
        mailboxCard({
          "fund.receipt": keep(addReceipt, "Kept: the slip is on the tray. Its withdraw token stays on this device only."),
          "fund.merkle_path": keep(async (w, hd) => (await addPath(w, hd)).wallet, "Checked: the slip shows whether your units are under the root."),
          "fund.payout": keep(addPayout, "Recorded: the paid units are gone; what is left has a new token."),
        }),
        card(
          "Limits",
          "What this does not prove",
          "The path proves your units are counted in the root the fund sent you. That this root is the one the manager signed on chain (JTLR), and that the fund's assets cover it, you check with the fund's viewing key on your own device (`jitsuin fund`), never on a server. Units are paid from cash only: money lent out comes back when buyers repay.",
        ),
      ],
    }),
  );
}
