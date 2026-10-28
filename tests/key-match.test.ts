// User test 2026-10-27: an invoice reached the buyer's inbox but was "not addressed to one of your
// invoice keys". The supplier's 御中 line keeps each buyer key with the mailbox its letter came
// from, names the options apart and marks used keys; the buyer's refusal says which key the
// invoice names, which keys were checked and how to fix it; letters waiting in the inbox show on
// the role's ledger. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contactValue, defaultChoice, HAND, keyChoices, keyMissText, knownMailbox } from "../src/lib/key-match.ts";
import { onLedger } from "../src/lib/inbox-routes.ts";
import { readablePrint } from "../src/lib/print.ts";

const hex = (c: string) => c.repeat(64);
const BOX_X = hex("1");
const BOX_Y = hex("2");
const BOX_Z = hex("3");
const KEY_X_OLD = hex("a");
const KEY_X = hex("b");
const KEY_Y = hex("c");
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 20, 12);

const keys = [
  { invoice_pk: KEY_X_OLD, mailbox_pk: BOX_X, at: T0 },
  { invoice_pk: KEY_Y, mailbox_pk: BOX_Y, at: T0 + 2 * DAY },
  { invoice_pk: KEY_X, mailbox_pk: BOX_X, at: T0 + 5 * DAY },
];
const contacts = [
  { role: "buyer", username: "yuki", mailbox_pk: BOX_Y, fingerprint: "YYYY-YYYY-YYYY-YYYY" },
  { role: "buyer", username: "zen", mailbox_pk: BOX_Z, fingerprint: "ZZZZ-ZZZZ-ZZZZ-ZZZZ" },
  { role: "supplier", username: "other", mailbox_pk: hex("4"), fingerprint: "SSSS-SSSS-SSSS-SSSS" },
];
const cards = [{ username: "xavi", mailbox_pk: BOX_X, fingerprint: "XXXX-XXXX-XXXX-XXXX" }];
const deals = [{ buyer_pk: KEY_X_OLD, invoice_id: "TES-INV-1110" }];

test("every key option carries the mailbox its own letter came from", () => {
  const c = keyChoices(keys, contacts, cards, []);
  for (const k of keys) {
    const o = c.find((x) => x.value === k.invoice_pk)!;
    assert.equal(o.kind, "key");
    assert.equal(o.mailbox_pk, k.mailbox_pk, "a key never pairs with another buyer's mailbox");
    assert.match(o.detail, new RegExp(readablePrint(k.mailbox_pk)));
  }
});

test("options are named apart: the buyer's name or the key's print, and the day it came", () => {
  const c = keyChoices(keys, contacts, cards, []);
  const labels = c.filter((x) => x.kind === "key").map((x) => x.label);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((l) => !l.includes("not in your contacts")));
  assert.equal(c.find((x) => x.value === KEY_Y)!.label, `@yuki · key ${readablePrint(KEY_Y).slice(0, 9)} · came 22 Oct`);
  // no contact, but the key letter carried a card: its @name, said to be outside the contacts
  assert.match(c.find((x) => x.value === KEY_X)!.label, /^@xavi · key /);
  assert.match(c.find((x) => x.value === KEY_X)!.detail, /not in your contacts yet/);
  // no contact and no card: the key's own print
  const bare = keyChoices([{ invoice_pk: KEY_Y, mailbox_pk: BOX_Z, at: T0 }], [], [], []);
  assert.match(bare[0].label, new RegExp(`^Buyer key ${readablePrint(KEY_Y).slice(0, 9)} · came 20 Oct$`));
});

test("a key used for an invoice is marked, not offered, and sorts last", () => {
  const c = keyChoices(keys, contacts, cards, deals);
  const used = c.find((x) => x.value === KEY_X_OLD)!;
  assert.equal(used.disabled, true);
  assert.equal(used.usedFor, "TES-INV-1110");
  assert.match(used.label, /used for TES-INV-1110$/);
  const keyRows = c.filter((x) => x.kind === "key");
  assert.equal(keyRows.at(-1)!.value, KEY_X_OLD);
});

test("the default is the newest unused key; never a used one", () => {
  assert.equal(defaultChoice(keyChoices(keys, contacts, cards, deals)), KEY_X);
  assert.equal(defaultChoice(keyChoices(keys, contacts, cards, [...deals, { buyer_pk: KEY_X, invoice_id: "TES-INV-1111" }])), KEY_Y);
  assert.equal(defaultChoice(keyChoices([], [], [], [])), HAND);
});

test("a buyer contact with no unused key says so; contacts with a key are not repeated", () => {
  const c = keyChoices(keys, contacts, cards, []);
  const zen = c.find((x) => x.value === contactValue(BOX_Z))!;
  assert.equal(zen.kind, "contact");
  assert.equal(zen.label, "@zen: no key from them yet");
  assert.match(zen.detail, /Ask them for their next invoice key/);
  assert.equal(c.find((x) => x.value === contactValue(BOX_Y)), undefined, "@yuki sent a key: the key row stands for them");
  assert.equal(c.some((x) => x.label.includes("@other")), false, "a supplier contact is no buyer");
  assert.equal(c.at(-1)!.value, HAND);
  // with only a contact and no key, the sheet opens on the contact (asking), not on a blank key
  assert.equal(defaultChoice(keyChoices([], contacts, [], [])), contactValue(BOX_Y));
});

test("a typed key known from another buyer's letter is refused for this mailbox", () => {
  assert.equal(knownMailbox(KEY_X, BOX_Y, keys), BOX_X);
  assert.equal(knownMailbox(KEY_X, BOX_X, keys), null);
  assert.equal(knownMailbox(hex("d"), BOX_Y, keys), null, "a key never seen in a letter: nothing known");
});

test("the buyer's refusal names the invoice's key, the keys checked, and the way out", () => {
  const mine = Array.from({ length: 9 }, (_, k) => ({ k, pk: (k + 5).toString(16).repeat(64) }));
  const t = keyMissText({ invoiceKey: KEY_X, mine, demo: false });
  assert.match(t, new RegExp(`key this account doesn't have \\(key ${readablePrint(KEY_X)}\\)`));
  assert.match(t, new RegExp(`#0 ${readablePrint(mine[0].pk)}`));
  assert.match(t, new RegExp(`#8 ${readablePrint(mine[8].pk)}`));
  assert.match(t, /\(9 checked\)/);
  assert.match(t, /Invoices → Your next invoice key/);
  assert.match(t, /sign in with the account that sent that key/);
  assert.match(t, /another passkey, another role or test data are not checked/);
  assert.doesNotMatch(t, /[0-9a-f]{64}/, "no raw key text");
  const demo = keyMissText({ invoiceKey: KEY_X, mine: mine.slice(0, 2), demo: true });
  assert.match(demo, /test data: keys from your passkey/);
  assert.match(demo, /are #0 .+, #1 [A-Z2-7-]+ \(2 checked\)/);
});

test("ledger rows: a letter shows on the ledger its action leads into", () => {
  assert.equal(onLedger("buyer", "invoice.sign_request"), true);
  assert.equal(onLedger("buyer", "deal.letter"), true);
  assert.equal(onLedger("buyer", "deal.bundle"), false, "completes in the panel");
  assert.equal(onLedger("buyer", "history.request"), false, "History's, not the ledger's");
  assert.equal(onLedger("supplier", "invoice.signature"), true);
  assert.equal(onLedger("supplier", "key.invoice_pk"), true);
  // mobile E2E 2, finding 7: Keep it opens the deal at 済, so the bundle shows on the ledger too
  assert.equal(onLedger("supplier", "deal.bundle"), true);
  assert.equal(onLedger("member", "fund.receipt"), true);
  assert.equal(onLedger("member", "invoice.sign_request"), false);
});

// production run 5: a repeat buyer and supplier, two invoices in a row on the same key (no
// financier asked for the history, so the buyer's place in it stays at #0)
test("two invoices in a row: the key is held until the first invoice is financed, then free", async () => {
  const { keyHeldBy, keyTakenNote } = await import("../src/lib/key-match.ts");
  const first = { buyer_pk: KEY_X, invoice_id: "TES-INV-0001" };
  assert.equal(keyHeldBy([first], KEY_X), "TES-INV-0001");
  assert.equal(keyHeldBy([{ ...first, advance_notice: { txid: "t" } }], KEY_X), null);
  assert.equal(keyHeldBy([{ ...first, advance: { txid: "t" } }], KEY_X), null);
  assert.equal(keyHeldBy([{ ...first, bundle: "JTSB" }], KEY_X), null);
  // the supplier's 御中 line offers the key again, not as used
  const keys = [{ invoice_pk: KEY_X, mailbox_pk: BOX_X, at: T0 }];
  assert.equal(keyChoices(keys, [], [], [first])[0].usedFor, "TES-INV-0001");
  assert.equal(keyChoices(keys, [], [], [{ ...first, bundle: "JTSB" }])[0].usedFor, undefined);
  assert.equal(defaultChoice(keyChoices(keys, [], [], [{ ...first, bundle: "JTSB" }])), KEY_X);
  // the second invoice holds it again until it is financed too
  const second = { buyer_pk: KEY_X, invoice_id: "TES-INV-0002" };
  assert.equal(keyHeldBy([{ ...first, bundle: "JTSB" }, second], KEY_X), "TES-INV-0002");
  // the buyer is told the key is free, not that it is taken
  assert.equal(keyTakenNote(0, [{ invoice_id: "TES-INV-0001", signed: true, financed: true }])?.kind, "ok");
  assert.equal(keyTakenNote(0, [{ invoice_id: "TES-INV-0001", signed: true, financed: false }])?.kind, "warn");
  assert.equal(keyTakenNote(0, [{ invoice_id: "TES-INV-0001", signed: true, financed: true }, { invoice_id: "TES-INV-0002", signed: false }])?.kind, "warn");
});
