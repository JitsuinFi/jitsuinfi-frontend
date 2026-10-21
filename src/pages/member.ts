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
import { addPath, addPayout, addReceipt, EMPTY, latestPortfolio, openPeriod, valueOf, withdrawBody, type Holding, type Wallet } from "../lib/fund";
import { decodeFundCard } from "../lib/fund-card";
import { wasm, zecToZat } from "../lib/core";
import { draft, send } from "../lib/relay";
import { encodeMessage, type Header } from "../lib/relay-message";
import { actions, banner, button, card, download, field, h, kv, Out, trustedSvg } from "../lib/ui";
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

  const holds = h("p", { class: "mb-plate-note" }, "");
  const render = async () => {
    const w = await load();
    // HNK-30.T22: what the fund holds, in aggregate, from the newest period's path
    const lp = latestPortfolio(w);
    holds.textContent = lp
      ? `Period ${lp.period}: ${lp.p.open} open receivable${lp.p.open === 1 ? "" : "s"} (${zec(lp.p.open_zat)}), ${lp.p.overdue} overdue, ${lp.p.repaid} repaid; due within 30 days ${lp.p.due_within[0]}, 31 – 90 days ${lp.p.due_within[1]}, later ${lp.p.due_within[2]}; cash ${zec(lp.p.cash_zat)}.`
      : "";
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
    // HNK-29.T2: the same path, checked against the root on chain with the fund's viewing key
    const body = x.path?.body;
    if (body) {
      const keep = h("button", { type: "button", class: "mb-doc-save" }, "Save the path for jitsuin fund");
      keep.addEventListener("click", () => download(`fund-path-period-${x.path!.period}.json`, JSON.stringify(body, null, 2)));
      el.append(keep);
    }
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
      holds,
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
        depositCard(),
        mailboxCard({
          "fund.receipt": keep(addReceipt, "Kept: the slip is on the tray. Its withdraw token stays on this device only."),
          "fund.merkle_path": keep(async (w, hd) => (await addPath(w, hd)).wallet, "Checked: the slip shows whether your units are under the root."),
          "fund.payout": keep(addPayout, "Recorded: the paid units are gone; what is left has a new token."),
        }),
        card(
          "Limits",
          "What this does not prove",
          "The path proves your units are counted in the root the fund sent you. That this root is the one the manager signed on chain (JTLR), and that the fund's assets cover it, you check with the fund's viewing key on your own device: save the path from a slip and run `jitsuin fund --path <file>`, never on a server. Units are paid from cash only: money lent out comes back when buyers repay. The receivables in that check are the manager's own notes: a bad one only shows once it is overdue.",
        ),
        // HNK-29.T3 (BL-S05-01, BL-D0-06): what the fund's records leak, and how the key travels
        card(
          "Privacy",
          "What others can see",
          "Anyone holding the fund's viewing key (other members, the auditor) sees the amount of every deposit and payout, never who made it, and the shielded address each advance went to, never the supplier's name. Your path shows the units of a neighbouring part of the tree, so at least one other member's total. Take the viewing key from the manager only over a private channel, and give it only to `jitsuin fund` on your own device, never to a website.",
        ),
      ],
    }),
  );
}

/**
 * HNK-30.T22: how a member pays in. The manager hands a fund card with a deposit address made for
 * this member; the member pays it from any shielded wallet (the QR is a plain ZIP-321 request),
 * then gives the manager the transaction id and this screen's contact card for the receipt.
 */
function depositCard(): HTMLElement {
  const code = field("Fund card from the manager", { area: true, placeholder: "jitsuin-fund-v1:…" });
  const amount = field("Amount to deposit (ZEC)", { type: "number", placeholder: "0.01" });
  const out = new Out();
  const show = (w: Wallet) => {
    if (!w.fund) return;
    code.input.value = "";
    out.show(
      kv([
        ["Deposit address (made for you)", w.fund.deposit_address, true],
        ["Fund key (signs your receipts)", w.fund.fund_pk, true],
      ]),
    );
  };
  void load().then(show, () => undefined);
  return card(
    "Deposit",
    "Pay into the fund",
    "Paste the fund card the manager gave you, then pay its address from a shielded wallet. Send the manager the transaction id and your contact card below: the receipt with your withdraw token comes back to your inbox.",
    code.el,
    amount.el,
    actions(
      button("Keep the fund card", async () => {
        try {
          const fund = decodeFundCard(code.value());
          const w = await load();
          await save({ ...w, fund });
          show({ ...w, fund });
        } catch (e) {
          out.error(e);
        }
      }, true),
      button("Show the deposit QR", async () => {
        try {
          const w = await load();
          if (!w.fund) throw new Error("keep the fund card first");
          const zat = zecToZat(amount.value());
          const r = JSON.parse(wasm.paymentRequest(w.fund.deposit_address, BigInt(zat))) as { uri: string; qr_svg: string };
          show(w);
          out.el.append(trustedSvg(r.qr_svg), h("p", { class: "hint" }, r.uri));
        } catch (e) {
          out.error(e);
        }
      }),
    ),
    out.el,
  );
}

