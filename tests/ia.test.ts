// IA port, part 1 (2026-10-26): the nav and sections per role, the deal's opaque address, the
// long-list helper, the inbox panel's action routing and the readable key print. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeItem, firstSection, hasInbox, navItems, phoneTabs, PUBLIC_NAV, SECTIONS } from "../src/lib/sections.ts";
import { byRef, dealPath, isRef, newRef, withRefs } from "../src/lib/deal-ref.ts";
import { arrange, matches, type Stage } from "../src/lib/long-list.ts";
import { leadPath, letterAction, letterGlyph, letterLabel, LETTER_LABEL } from "../src/lib/inbox-routes.ts";
import { readablePrint } from "../src/lib/print.ts";
import { dealStage, type SupplierDeal } from "../src/lib/supplier-deal.ts";
import { legacyTarget } from "../src/lib/legacy-url.ts";

const tos = (xs: ReadonlyArray<{ to: string }>) => xs.map((x) => x.to);

test("signed out, the nav is Home · Try it · Verify · Sign in; outsiders and rates stay in the lobby", () => {
  assert.deepEqual(tos(navItems(null)), ["/app", "/try", "/verify", "/account"]);
  assert.deepEqual(navItems(null).map((x) => x.label), ["Home", "Try it", "Verify", "Sign in"]);
  assert.deepEqual(tos(phoneTabs(null)), tos(PUBLIC_NAV));
  assert.ok(!tos(navItems(null)).includes("/outsider") && !tos(navItems(null)).includes("/rates"));
});

test("signed in, the nav is Home and the role's sections; the supplier has four, the first one is where sign-in lands", () => {
  assert.deepEqual(tos(SECTIONS.supplier), ["/supplier/invoices", "/supplier/invoices/new", "/supplier/deal", "/supplier/contacts"]);
  assert.deepEqual(SECTIONS.supplier.map((s) => s.label), ["Invoices", "Write an invoice", "Deal", "Contacts"]);
  assert.deepEqual(tos(navItems("supplier")), ["/app", ...tos(SECTIONS.supplier)]);
  assert.equal(firstSection("supplier"), "/supplier/invoices");
  assert.equal(firstSection("buyer"), "/buyer/invoices");
  assert.equal(firstSection("member"), "/member/fund");
  for (const role of ["supplier", "buyer", "member"] as const) {
    assert.ok(SECTIONS[role].length >= 1);
    for (const s of SECTIONS[role]) assert.ok(s.to.startsWith(`/${role}`), s.to);
  }
});

test("the phone tab bar: the role's sections and the Inbox, at most five; Account and Home sit in the top bar", () => {
  const sup = phoneTabs("supplier");
  assert.equal(sup.length, 5);
  assert.deepEqual(sup.map((t) => t.short), ["Invoices", "Write", "Deal", "Contacts", "Inbox"]);
  assert.ok("inbox" in sup[4]);
  assert.ok(hasInbox("supplier") && hasInbox("buyer") && hasInbox("member"));
  assert.ok(!hasInbox(null));
  for (const role of [null, "supplier", "buyer", "member"] as const) {
    assert.ok(phoneTabs(role).length <= 5);
    assert.ok(!phoneTabs(role).some((t) => "to" in t && t.to === "/account" && role !== null));
  }
});

test("the active item is the most specific section the path is in", () => {
  const items = navItems("supplier");
  assert.equal(activeItem(items, "/supplier/invoices"), "/supplier/invoices");
  assert.equal(activeItem(items, "/supplier/invoices/new"), "/supplier/invoices/new");
  assert.equal(activeItem(items, "/supplier/deal/k3m9q2x7ab"), "/supplier/deal");
  assert.equal(activeItem(items, "/supplier/contacts/"), "/supplier/contacts");
  assert.equal(activeItem(items, "/app"), "/app");
  assert.equal(activeItem(items, "/verify"), null);
  assert.equal(activeItem(navItems(null), "/try/play"), "/try");
});

test("old addresses still lead to the supplier, whose /supplier opens its first section", () => {
  assert.equal(legacyTarget("/app.html", "", "#/supplier"), "/supplier");
  assert.equal(legacyTarget("/supplier", "", ""), null);
});

test("a deal's address is an opaque ref made on this device, never the invoice number or N", () => {
  let seed = 0;
  const rnd = (n: number) => Uint8Array.from({ length: n }, () => (seed = (seed * 31 + 17) & 255));
  const r = newRef(rnd);
  assert.ok(isRef(r), r);
  assert.equal(r.length, 10);
  assert.ok(!isRef("TES-INV-1") && !isRef("ab".repeat(32)) && !isRef(undefined));
  for (let i = 0; i < 200; i++) assert.ok(isRef(newRef()));
  const n = "ab".repeat(32);
  const deals: Array<{ n: string; invoice_id: string; ref?: string }> = [
    { n, invoice_id: "TES-INV-1" },
    { n: "cd".repeat(32), invoice_id: "TES-INV-2", ref: "k3m9q2x7ab" },
  ];
  const { deals: all, changed } = withRefs(deals);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].n, n);
  assert.equal(all[1].ref, "k3m9q2x7ab", "a ref, once made, stays");
  assert.notEqual(all[0].ref, all[1].ref);
  assert.equal(byRef(all, all[0].ref)?.invoice_id, "TES-INV-1");
  assert.equal(byRef(all, "zzzzzzzzzz"), undefined);
  const path = dealPath(all[0].ref);
  assert.ok(!path.includes("TES-INV") && !path.includes(n.slice(0, 8)), path);
  assert.throws(() => dealPath("TES-INV-1"));
  assert.deepEqual(withRefs(all).changed, [], "nothing to save the second time");
});

test("long lists: your move first, then waiting, then done folded; search narrows and unfolds; Show more", () => {
  type L = { id: string; buyer: string; s: Stage };
  const items: L[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `TES-INV-D${i}`, buyer: "@osaka", s: "done" as Stage })),
    { id: "TES-INV-W1", buyer: "@kanda", s: "wait" },
    { id: "TES-INV-M1", buyer: "@kanda", s: "move" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `TES-INV-M${i + 2}`, buyer: "@osaka", s: "move" as Stage })),
  ];
  const o = { stage: (t: L) => t.s, words: (t: L) => `${t.id} ${t.buyer}` };
  const a = arrange(items, o);
  assert.deepEqual(a.groups.map((g) => g.stage), ["move", "wait", "done"]);
  assert.equal(a.groups[0].items.length, 8);
  assert.equal(a.groups[0].more, 3);
  assert.equal(a.groups[0].items[0].id, "TES-INV-M1", "order within a group is kept");
  assert.deepEqual([a.groups[2].folded, a.groups[2].total, a.groups[2].items.length], [true, 12, 0]);
  assert.equal(a.total, 24);
  const open = arrange(items, { ...o, opened: new Set<Stage>(["done"]), expanded: new Set<Stage>(["move"]) });
  assert.equal(open.groups[0].items.length, 11);
  assert.equal(open.groups[0].more, 0);
  assert.equal(open.groups[2].folded, false);
  assert.equal(open.groups[2].items.length, 8);
  const s = arrange(items, { ...o, query: "kanda" });
  assert.deepEqual(s.groups.map((g) => [g.stage, g.total]), [["move", 1], ["wait", 1]]);
  assert.equal(s.matched, 2);
  const d = arrange(items, { ...o, query: "inv-d1" });
  assert.equal(d.groups[0].stage, "done");
  assert.equal(d.groups[0].folded, false, "a search opens the done lines it found");
  assert.deepEqual(d.groups[0].items.map((x) => x.id), ["TES-INV-D1", "TES-INV-D10", "TES-INV-D11"]);
  assert.ok(matches("TES-INV-7 @kanda 0.0004 ZEC", "  Kanda   inv-7 "));
  assert.ok(!matches("TES-INV-7 @kanda", "osaka"));
  assert.equal(arrange(items, { ...o, query: "nothing like it" }).groups.length, 0);
  const onlyDone = arrange(items.filter((t) => t.s === "done"), o);
  assert.equal(onlyDone.groups[0].folded, false, "a ledger of only settled deals is not hidden");
});

test("a deal's stage in the ledger", () => {
  const base: SupplierDeal = { n: "ab".repeat(32), invoice_id: "TES-INV-1", buyer_pk: "11".repeat(32), supplier_pk: "22".repeat(32), amount_zat: 40_000, due_date: 20_500, invoice: "x", created_at: 1 };
  assert.equal(dealStage(base, false), "move");
  assert.equal(dealStage({ ...base, sign_request: { to: "aa", at: 1 } }, false), "wait");
  assert.equal(dealStage({ ...base, buyer_signature: "00" }, false), "move");
  assert.equal(dealStage(base, true), "done");
});

test("the inbox panel routes each supplier letter to the page its action needs, or keeps it in the panel", () => {
  assert.deepEqual(letterAction("supplier", "invoice.signature"), { label: "Check and keep", lead: { kind: "deal", station: "offer" }, goes: "opens the deal" });
  assert.deepEqual(letterAction("supplier", "key.invoice_pk")!.lead, { kind: "new-invoice" });
  assert.deepEqual(letterAction("supplier", "deal.commitment_opening")!.lead, { kind: "deal", station: "entry" });
  assert.deepEqual(letterAction("supplier", "deal.letter")!.lead, { kind: "deal", station: "seal" });
  assert.deepEqual(letterAction("supplier", "deal.advance")!.lead, { kind: "deal", station: "advance" });
  assert.deepEqual(letterAction("supplier", "deal.decline")!.lead, { kind: "deal", station: "offer" });
  assert.deepEqual(letterAction("supplier", "deal.bundle"), { label: "Keep it", lead: { kind: "deal", station: "settled" }, goes: "opens the deal at 済" });
  assert.deepEqual(leadPath({ kind: "deal", station: "settled" }, "d1"), { to: "/supplier/deal/d1", at: "settled" });
  assert.equal(letterAction("supplier", "invoice.sign_request"), null, "a buyer's letter: shown, nothing to do here");
  assert.equal(letterAction("supplier", "made.up"), null);
  assert.deepEqual(leadPath({ kind: "deal", station: "entry" }, "k3m9q2x7ab"), { to: "/supplier/deal/k3m9q2x7ab", at: "entry" });
  assert.deepEqual(leadPath({ kind: "new-invoice" }), { to: "/supplier/invoices/new" });
  assert.equal(leadPath({ kind: "panel" }), null);
  // readable labels: plain words, no type ids and no crypto words
  for (const [type, label] of Object.entries(LETTER_LABEL)) {
    assert.ok(!label.includes(type) && !/\b(hex|pk|ed25519|nullifier)\b/i.test(label), label);
  }
  assert.equal(letterLabel("made.up"), "A letter");
  assert.equal(letterGlyph("made.up"), "信");
  assert.equal(letterGlyph("deal.bundle"), "済");
});

test("a key reads as a fingerprint: four groups of four, the same for the same key", () => {
  const k = "e70b1584c6741ba17ec55597e5a279e589c0c27591f0aa0a8ff7b0f0b1c2d3e4";
  const p = readablePrint(k);
  assert.match(p, /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.equal(readablePrint(k.toUpperCase()), p);
  assert.notEqual(readablePrint("00" + k.slice(2)), p);
  assert.equal(readablePrint("not a key"), "");
});

// ---------- part 2 (2026-10-26): the buyer's and the fund member's sections ----------
import { buyerStage, hasSlip, invoiceRecord, slipOrder, type BuyerInvoice } from "../src/lib/buyer-invoices.ts";
import { payBadge } from "../src/lib/buyer-late.ts";
import { invoicePath, slipPath } from "../src/lib/deal-ref.ts";

test("the buyer's sections are Invoices · Pay · History · Contacts; the member's Fund · Units · Contacts", () => {
  assert.deepEqual(tos(SECTIONS.buyer), ["/buyer/invoices", "/buyer/pay", "/buyer/history", "/buyer/contacts"]);
  assert.deepEqual(SECTIONS.buyer.map((s) => s.label), ["Invoices", "Pay", "History", "Contacts"]);
  assert.deepEqual(tos(SECTIONS.member), ["/member/fund", "/member/units", "/member/contacts"]);
  assert.deepEqual(SECTIONS.member.map((s) => s.label), ["Fund", "Units", "Contacts"]);
  assert.deepEqual(tos(navItems("buyer")), ["/app", ...tos(SECTIONS.buyer)]);
  // only Pay carries the due count
  assert.deepEqual(SECTIONS.buyer.map((s) => s.badge ?? null), [null, "due", null, null]);
  assert.ok(!SECTIONS.member.some((s) => s.badge) && !SECTIONS.supplier.some((s) => s.badge));
});

test("phone tabs: buyer Invoices · Pay · History · Contacts · Inbox; member Fund · Units · Contacts · Inbox", () => {
  assert.deepEqual(phoneTabs("buyer").map((t) => t.short), ["Invoices", "Pay", "History", "Contacts", "Inbox"]);
  assert.deepEqual(phoneTabs("member").map((t) => t.short), ["Fund", "Units", "Contacts", "Inbox"]);
  assert.ok("inbox" in phoneTabs("member")[3]);
  // a short label fits a 66 px tab
  for (const r of ["supplier", "buyer", "member"] as const) for (const t of phoneTabs(r)) assert.ok(t.short.length <= 8, t.short);
});

test("the active section: an open invoice lights Invoices, a slip lights Pay", () => {
  const items = navItems("buyer");
  assert.equal(activeItem(items, "/buyer/invoices/k3m9q2x7ab"), "/buyer/invoices");
  assert.equal(activeItem(items, "/buyer/invoices/key"), "/buyer/invoices");
  assert.equal(activeItem(items, "/buyer/pay/k3m9q2x7ab"), "/buyer/pay");
  assert.equal(activeItem(navItems("member"), "/member/units"), "/member/units");
});

test("old addresses lead to the new sections: /buyer and /member, and their old hash links", () => {
  assert.equal(legacyTarget("/app.html", "", "#/buyer"), "/buyer"); // which redirects to /buyer/invoices
  assert.equal(legacyTarget("/app.html", "", "#/member"), "/member"); // which redirects to /member/fund
});

test("the inbox panel routes each buyer letter to the invoice, its slip, History, or keeps it in the panel", () => {
  assert.deepEqual(letterAction("buyer", "invoice.sign_request"), { label: "Open the invoice", lead: { kind: "invoice" }, goes: "lays it on Invoices" });
  assert.deepEqual(letterAction("buyer", "deal.letter")!.lead, { kind: "invoice" });
  assert.deepEqual(letterAction("buyer", "deal.seal")!.lead, { kind: "invoice" });
  assert.deepEqual(letterAction("buyer", "deal.reminder")!.lead, { kind: "slip" });
  assert.deepEqual(letterAction("buyer", "history.request"), { label: "Send my history", lead: { kind: "history" }, goes: "updates History" });
  assert.deepEqual(letterAction("buyer", "deal.bundle")!.lead, { kind: "panel" });
  assert.equal(letterAction("buyer", "invoice.signature"), null, "a supplier's letter: shown, nothing to do here");
  assert.deepEqual(leadPath({ kind: "invoice" }, "k3m9q2x7ab"), { to: "/buyer/invoices/k3m9q2x7ab" });
  assert.deepEqual(leadPath({ kind: "slip" }, "k3m9q2x7ab"), { to: "/buyer/pay/k3m9q2x7ab" });
  assert.deepEqual(leadPath({ kind: "slip" }), { to: "/buyer/pay" });
  assert.deepEqual(leadPath({ kind: "history" }), { to: "/buyer/history" });
  assert.equal(letterLabel("invoice.sign_request", "buyer"), "Invoice to sign");
  assert.equal(letterLabel("deal.letter", "buyer"), "Letter to seal");
  assert.equal(letterLabel("deal.reminder", "buyer"), "Due-date reminder");
  assert.equal(letterLabel("history.request", "buyer"), "History request");
  assert.equal(letterLabel("deal.letter", "supplier"), "Financing letter to read and seal", "the supplier's words stay (plain words, mobile E2E 3)");
});

test("the inbox panel routes the fund member's letters to Units, with readable names", () => {
  for (const t of ["fund.receipt", "fund.merkle_path", "fund.payout"]) {
    assert.deepEqual(letterAction("member", t)!.lead, { kind: "units" }, t);
    assert.equal(letterAction("member", t)!.label, "Keep it");
  }
  assert.deepEqual(leadPath({ kind: "units" }), { to: "/member/units" });
  assert.equal(letterLabel("fund.receipt", "member"), "Deposit receipt");
  assert.equal(letterLabel("fund.merkle_path", "member", { period: 3 }), "Path for period 3");
  assert.equal(letterLabel("fund.merkle_path", "member"), "Path for your units");
  assert.equal(letterLabel("fund.payout", "member"), "Payout");
  assert.equal(letterAction("member", "invoice.sign_request"), null);
  for (const role of ["buyer", "member"] as const)
    for (const t of ["invoice.sign_request", "deal.letter", "deal.seal", "deal.reminder", "history.request", "deal.bundle", "fund.receipt", "fund.merkle_path", "fund.payout"]) {
      const l = letterLabel(t, role, { period: 1 });
      assert.ok(!/\b(hex|pk|ed25519|nullifier|merkle)\b/i.test(l), l);
    }
});

const inv = (n: string, extra: Partial<BuyerInvoice> = {}): BuyerInvoice => ({ ...invoiceRecord({ nullifier: n, invoice_id: `TES-INV-${n}`, amount_zat: 40_000, due_date: 100 }, "x", 0, true, 1), ...extra });

test("the buyer's ledger groups: your move (sign, send, seal, pay), waiting, settled", () => {
  assert.equal(buyerStage(inv("a")), "move"); // sign
  assert.equal(buyerStage(inv("b", { signature: "s", reply_to: "m" })), "move"); // send
  assert.equal(buyerStage(inv("c", { signature: "s", signature_sent_at: 1 })), "wait"); // wait for a letter
  assert.equal(buyerStage(inv("d", { signature: "s", signature_sent_at: 1, assignment: { letter: "l", supplier_seal: "s0" } })), "move"); // seal
  assert.equal(buyerStage(inv("e", { signature: "s", assignment: { letter: "l", supplier_seal: "s0", buyer_seal: "s1" } })), "wait");
  assert.equal(buyerStage(inv("f", { signature: "s", assignment: { letter: "l", supplier_seal: "s0", buyer_seal: "s1", financier_seal: "s2" } })), "move"); // pay
  assert.equal(buyerStage(inv("g", { bundle: "b" })), "done");
});

test("Pay lists the slips: to pay soonest first, then the paid ones; no slip before the financier's seal", () => {
  const sealed = { letter: "l", supplier_seal: "s0", buyer_seal: "s1", financier_seal: "s2" };
  const list = [inv("late", { due_date: 120, assignment: sealed }), inv("soon", { due_date: 101, assignment: sealed }), inv("paid", { due_date: 90, assignment: sealed, bundle: "b" }), inv("wait", { assignment: { letter: "l", supplier_seal: "s0", buyer_seal: "s1" } })];
  assert.deepEqual(slipOrder(list).map((r) => r.n), ["soon", "late", "paid"]);
  assert.ok(!hasSlip(list[3]) && hasSlip(list[2]));
  assert.equal(invoicePath("k3m9q2x7ab"), "/buyer/invoices/k3m9q2x7ab");
  assert.equal(slipPath("k3m9q2x7ab"), "/buyer/pay/k3m9q2x7ab");
  assert.throws(() => slipPath("TES-INV-1"));
});

test("a record keeps its ref and the PDF that came with it when it is checked again", () => {
  const first = inv("a", { ref: "k3m9q2x7ab", terms_pdf: { name: "a.pdf", b64: "AA==" } });
  const again = invoiceRecord({ nullifier: "a", invoice_id: "TES-INV-a", amount_zat: 40_000, due_date: 100 }, "x", 0, true, 5, first);
  assert.equal(again.ref, "k3m9q2x7ab");
  assert.deepEqual(again.terms_pdf, { name: "a.pdf", b64: "AA==" });
});

test("the Pay tab's count: financed invoices due within a week or past due, not settled", () => {
  const sealed = { financier_seal: "s2" };
  const today = 100;
  assert.equal(payBadge([], today), 0);
  assert.equal(payBadge([inv("far", { due_date: 108, assignment: sealed })], today), 0, "8 days out: no count");
  assert.equal(payBadge([inv("wk", { due_date: 107, assignment: sealed })], today), 1, "7 days out counts");
  assert.equal(payBadge([inv("today", { due_date: 100, assignment: sealed })], today), 1);
  assert.equal(payBadge([inv("over", { due_date: 95, assignment: sealed })], today), 1, "overdue counts");
  assert.equal(payBadge([inv("paid", { due_date: 95, assignment: sealed, bundle: "b" })], today), 0, "settled: no count");
  assert.equal(payBadge([inv("unfinanced", { due_date: 99 })], today), 0, "nothing to pay a financier yet");
  assert.equal(payBadge([inv("a", { due_date: 101, assignment: sealed }), inv("b", { due_date: 90, assignment: sealed }), inv("c", { due_date: 130, assignment: sealed })], today), 2);
});

test("the deal route labels the next station as the move, and only a done one in the past tense", async () => {
  const { stationLabel, STEPS } = await import("../src/lib/supplier-deal.ts");
  assert.equal(stationLabel("offer", "next"), "Offer next");
  assert.equal(stationLabel("offer", "done"), "Offered");
  assert.equal(stationLabel("offer", "later"), "Offer");
  for (const s of STEPS) assert.equal(stationLabel(s.key, "done"), s.label, "done stations keep the steps' own words");
  for (const k of ["signature", "offer", "entry", "seal", "advance", "settled"] as const)
    for (const st of ["next", "wait", "later"] as const) assert.ok(!/(ed|sealed|signed|received|Settled)$/.test(stationLabel(k, st)), `${k} ${st}: ${stationLabel(k, st)}`);
});
