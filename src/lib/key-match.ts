// A buyer's invoice key and the mailbox it came from stay one unit (user test 2026-10-27: an
// invoice reached the buyer's inbox but was "not addressed to one of your invoice keys").
//
// Supplier side: the 御中 line of Write an invoice offers each key that arrived in a key letter
// with the mailbox that letter came from, named distinctly (the buyer's @name, or "Buyer key
// ABCD-EFGH" and the day it came), a key already used for an invoice marked and not offered, and a
// buyer contact with no key yet as "no key from them yet" (ask them for it). A key written by hand
// has no mailbox: the app cannot know whose it is, so it never borrows a contact's mailbox on the
// sheet.
//
// Buyer side: when an invoice is for a key this account does not hold, the refusal says which key
// the invoice names, which keys this device checked, and how to fix it.
//
// Pure data: tests run it under Node.
import { readablePrint } from "./print.ts";

/** A buyer's key that came in a key letter (pages/supplier/data.ts `ArrivedKey`). */
export interface KeyLetter {
  invoice_pk: string;
  mailbox_pk: string;
  at: number;
}

/** A buyer the supplier knows: a contact, or the card a key letter carried. */
export interface KnownBuyer {
  mailbox_pk: string;
  username?: string;
  fingerprint: string;
  role?: string;
}

export interface KeyChoice {
  /** The select's value: the key (hex), `contact:<mailbox>` or `hand`. */
  value: string;
  kind: "key" | "contact" | "hand";
  /** Short enough for a phone's select. */
  label: string;
  /** The full sentence under the select. */
  detail: string;
  invoice_pk?: string;
  mailbox_pk?: string;
  /** The invoice this key was used for already. */
  usedFor?: string;
  disabled: boolean;
}

export const HAND = "hand";
export const contactValue = (mailbox: string) => `contact:${mailbox}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "27 Oct", and "27 Oct 2026" with the year. */
export function day(ms: number, year = false): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;
}

const short = (hex: string) => readablePrint(hex).slice(0, 9);

/**
 * The 御中 line's options: arrived keys (unused ones newest first, then the used ones, disabled),
 * then each buyer contact that has not sent an unused key, then a key written by hand.
 * `deals` are the supplier's invoices (each names the buyer key it was written for).
 */
export function keyChoices(keys: readonly KeyLetter[], contacts: readonly KnownBuyer[], cards: readonly KnownBuyer[], deals: ReadonlyArray<{ buyer_pk: string; invoice_id: string }>): KeyChoice[] {
  const used = new Map(deals.map((d) => [d.buyer_pk, d.invoice_id]));
  const contactOf = (mb: string) => contacts.find((c) => c.mailbox_pk === mb);
  const cardOf = (mb: string) => cards.find((c) => c.mailbox_pk === mb);
  const sorted = [...keys].sort((a, b) => Number(used.has(a.invoice_pk)) - Number(used.has(b.invoice_pk)) || b.at - a.at);
  const out: KeyChoice[] = sorted.map((k) => {
    const c = contactOf(k.mailbox_pk);
    const card = c ? undefined : cardOf(k.mailbox_pk);
    const name = c ? (c.username ? `@${c.username}` : `Buyer ${c.fingerprint.slice(0, 9)}`) : card?.username ? `@${card.username}` : null;
    const usedFor = used.get(k.invoice_pk);
    const label = `${name ? `${name} · key ${short(k.invoice_pk)}` : `Buyer key ${short(k.invoice_pk)}`} · came ${day(k.at)}${usedFor ? ` · used for ${usedFor}` : ""}`;
    const who = c
      ? `${c.username ? `@${c.username}` : "a buyer in your contacts"} (fingerprint ${c.fingerprint})`
      : card
        ? `${card.username ? `@${card.username}, ` : ""}a buyer not in your contacts yet (fingerprint ${card.fingerprint})`
        : "a buyer not in your contacts yet";
    const detail = usedFor
      ? `Key ${readablePrint(k.invoice_pk)} from ${who} was used for ${usedFor} already: a key is for one invoice only. Their next key comes once ${usedFor} is financed; until then they see this same key.`
      : `Key ${readablePrint(k.invoice_pk)} came ${day(k.at, true)} in a letter from ${who}, signed by that key, from mailbox ${readablePrint(k.mailbox_pk)}. The invoice goes back to that mailbox only.`;
    return {
      value: k.invoice_pk,
      kind: "key",
      label,
      detail,
      invoice_pk: k.invoice_pk,
      mailbox_pk: k.mailbox_pk,
      ...(usedFor ? { usedFor } : {}),
      disabled: !!usedFor,
    };
  });
  const fresh = new Set(keys.filter((k) => !used.has(k.invoice_pk)).map((k) => k.mailbox_pk));
  for (const c of contacts) {
    if (c.role && c.role !== "buyer") continue;
    if (fresh.has(c.mailbox_pk)) continue;
    const name = c.username ? `@${c.username}` : `Buyer ${c.fingerprint.slice(0, 9)}`;
    out.push({
      value: contactValue(c.mailbox_pk),
      kind: "contact",
      label: `${name}: no key from them yet`,
      detail: `${name} (fingerprint ${c.fingerprint}) has not sent you a key for your next invoice, so no invoice can be written to them yet. Ask them for their next invoice key: they send it from Invoices → Your next invoice key, and it lands on this line.`,
      mailbox_pk: c.mailbox_pk,
      disabled: false,
    });
  }
  out.push({
    value: HAND,
    kind: "hand",
    label: "A key written by hand (you hand the invoice over)",
    detail:
      "A key copied from the buyer's screen. The app cannot tell whose key it is, so the invoice is not sent to a mailbox from here: give the buyer the invoice code and the PDF, or send it from the deal once you have compared the key with the buyer.",
    disabled: false,
  });
  return out;
}

/** The option chosen when the page opens: the newest unused key, else the first buyer with no key yet, else the key by hand. */
export function defaultChoice(choices: readonly KeyChoice[]): string {
  return (choices.find((c) => c.kind === "key" && !c.disabled) ?? choices.find((c) => c.kind === "contact") ?? choices.find((c) => c.kind === "hand"))?.value ?? HAND;
}

/**
 * The mailbox a typed key is known to belong to, when it is not `mailbox`: an arrived key letter
 * names its mailbox. The deal's send step refuses to pair them.
 */
export function knownMailbox(buyerPk: string, mailbox: string, keys: readonly KeyLetter[]): string | null {
  const k = keys.find((x) => x.invoice_pk === buyerPk);
  return k && k.mailbox_pk !== mailbox ? k.mailbox_pk : null;
}

// ---------- the buyer's side ----------

export interface KeyMiss {
  /** The key the invoice is addressed to (hex). */
  invoiceKey: string;
  /** This account's invoice keys checked on this device, by history index (hex). */
  mine: Array<{ k: number; pk: string }>;
  /** The session uses test data instead of a passkey. */
  demo: boolean;
}

/** The refusal when an invoice names a key this account does not hold: what is wrong and how to fix it. */
export function keyMissText(m: KeyMiss): string {
  const list = m.mine.map((x) => `#${x.k} ${readablePrint(x.pk)}`);
  const shown = list.length > 4 ? `${list.slice(0, 3).join(", ")} … ${list.at(-1)}` : list.join(", ");
  const keys = list.length ? ` Your keys on this device are ${shown} (${list.length} checked).` : "";
  const other = m.demo
    ? " This session uses test data: keys from your passkey, or from another test secret, are not checked here."
    : " Keys of another passkey, another role or test data are not checked here.";
  return `This invoice is for a buyer key this account doesn't have (key ${readablePrint(m.invoiceKey)}).${keys} Ask the supplier to use the key you send them from Invoices → Your next invoice key, or sign in with the account that sent that key.${other} The invoice stays in your inbox.`;
}

/**
 * What the buyer is told about its next key when invoices on this device already name it
 * (messy-state E2E 2026-10-27): the key only moves on once a financier finances an invoice, so the
 * same key was handed to a second supplier, or sent again to the first, who then saw it as used.
 * `on`: the invoices addressed to key #k, with whether each is signed. Null when none.
 */
export function keyTakenNote(k: number, on: ReadonlyArray<{ invoice_id: string; signed: boolean }>): { kind: "warn" | "bad"; title: string; text: string } | null {
  if (!on.length) return null;
  const ids = on.map((x) => x.invoice_id).join(", ");
  if (on.length > 1)
    return {
      kind: "bad",
      title: `Key #${k} is on ${on.length} invoices: ${ids}.`,
      text: "A key is for one invoice: only the first of them a financier registers can be financed. Do not give this key to anyone else. Your next key comes once one of them is financed.",
    };
  return {
    kind: "warn",
    title: `Key #${k} is on ${ids} already.`,
    text: `A key is for one invoice, and your next key comes only once ${ids} is financed. A supplier who used this key sees it as used; another supplier who writes to it gets an invoice that cannot be financed as well. Give it to no one else until then.`,
  };
}

// ---------- the keys handed out, from every device (finding F10) ----------
/** The buyer's invoice keys handed out (the synced "keys:given" record): k, to whom, when. */
export interface GivenKeys {
  /** `to`: the supplier's mailbox key, or "copied" for a key copied whole by hand. */
  given: Array<{ k: number; to: string; at: number }>;
}

/** One past the newest key index any device used: on an invoice, or handed out (widens the key search). */
export function keysFloor(invoices: ReadonlyArray<{ key_index: number }>, g: GivenKeys): number {
  return Math.max(0, ...invoices.map((x) => x.key_index + 1), ...g.given.map((x) => x.k + 1));
}

/**
 * What the buyer is told when key #k was already handed out (on this device or another one) and
 * no invoice names it yet: to whom and when, and that it goes to no one else. Null when it was not.
 * `nameOf` names a supplier's mailbox ("@name", or "a supplier" when there is no card).
 */
export function keyGivenNote(k: number, g: GivenKeys, nameOf: (to: string) => string): { kind: "warn"; title: string; text: string } | null {
  const to = g.given.filter((x) => x.k === k);
  if (!to.length) return null;
  const who = [...new Set(to.map((x) => (x.to === "copied" ? "copied by hand" : nameOf(x.to))))];
  const when = new Date(Math.min(...to.map((x) => x.at))).toISOString().slice(0, 10);
  return {
    kind: "warn",
    title: `Key #${k} was handed out on ${when}: ${who.join(", ")}.`,
    text: `No invoice names it on your devices yet. A key is for one invoice: send it again to the same supplier if they lost it, but give it to no one else. Your next key comes once that invoice is financed.`,
  };
}

/**
 * The key to offer once the other devices' certificates are known (finding F10). `k` is what this
 * device worked out; `here` the certificates on this device; `other` the certificates in the
 * synced copy (sealed with this account's key, so they are this account's even when the board
 * cannot be read to check them). A key below `other` is used: the offer moves past it.
 */
export function keyAfterOtherDevices(k: number, here: number, other: number): { k: number; moved: boolean } {
  return k < other && here < other ? { k: other, moved: true } : { k, moved: false };
}
