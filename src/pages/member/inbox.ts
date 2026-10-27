// The fund member's letters in the inbox panel (HNK-30.T22–T23; IA port part 2, 2026-10-26): the
// fund's deposit receipt, the path for a period's close and a payout, each kept in the wallet on
// this device, as the mailbox on the member's page kept them. Each leads to Units, where the slip
// it added or checked lies (lib/inbox-routes.ts), with the outcome on top.
import type { Handlers } from "../../app/inbox";
import { addPath, addPayout, addReceipt } from "../../lib/fund";
import { leadPath, letterAction } from "../../lib/inbox-routes";
import type { MessageType } from "../../lib/relay-message";
import { load, save, units, zec } from "./data";

const to = (type: MessageType) => {
  const a = letterAction("member", type);
  const l = a ? leadPath(a.lead) : null;
  return l ? { path: l.to } : undefined;
};
const num = (x: unknown) => (typeof x === "number" ? x : Number(x));

export const memberInbox: Handlers = {
  "fund.receipt": {
    about: async (r) => {
      const b = r.message.header.body;
      return `The fund received your deposit of ${zec(num(b.amount_zat))}: ${units(num(b.units))} units, signed by the fund.`;
    },
    run: async (r) => {
      await save(await addReceipt(await load(), r.message.header));
      const said = "Kept: the slip is on the tray. Its withdraw token stays in your encrypted records, on your devices only.";
      return { said, did: { glyph: "受", title: "Deposit receipt kept", text: said }, to: to("fund.receipt") };
    },
  },
  "fund.merkle_path": {
    about: async (r) => {
      const b = r.message.header.body;
      return `The fund closed period ${num(b.period)}: the path for ${units(num(b.units))} of your units, to check against the root the manager signed.`;
    },
    run: async (r) => {
      const { wallet, ok } = await addPath(await load(), r.message.header);
      await save(wallet);
      const p = num(r.message.header.body.period);
      const said = ok ? `Checked: the path holds against the period ${p} root. Your units are under it.` : `The period ${p} path does not hold against its root: tell the auditor.`;
      return { said, did: { glyph: ok ? "認" : "偽", title: ok ? `Your units are in the period ${p} root` : `The period ${p} path does not hold`, text: said, warn: !ok }, to: to("fund.merkle_path") };
    },
  },
  "fund.payout": {
    about: async (r) => {
      const b = r.message.header.body;
      return `Period ${num(b.period)}: ${zec(num(b.amount_zat))} paid for ${units(num(b.units))} units.`;
    },
    run: async (r) => {
      await save(await addPayout(await load(), r.message.header));
      const said = "Recorded: the paid units are gone; what is left has a new token.";
      return { said, did: { glyph: "払", title: "Payout recorded", text: said }, to: to("fund.payout") };
    },
  },
};
