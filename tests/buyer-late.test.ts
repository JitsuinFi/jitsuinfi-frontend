// "If you pay late" on the buyer's slip: the state of a financed invoice against its due date, and
// the lines the slip shows for it, run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countdown, ledgerLine, lateLines, lateState, milestonesReached, msToCutoff, reminderHandled, reminders, reminderText, slipSeen, WARN_DAYS, type LateFacts } from "../src/lib/buyer-late.ts";

const DUE = 20_754; // 2026-10-28
const financed = { due_date: DUE, assignment: { financier_seal: "s2" } };
const facts = (inHistory: boolean): LateFacts => ({ inHistory, amount: "0.0006 ZEC", due: "2026-10-28", defaultFrom: "2026-11-05" });

test("not financed, or more than a week out: nothing to warn about", () => {
  assert.deepEqual(lateState({ due_date: DUE, assignment: { letter: "l", buyer_seal: "s1" } }, DUE - 2), { kind: "none" });
  assert.deepEqual(lateState({ due_date: DUE }, DUE + 3), { kind: "none" });
  assert.deepEqual(lateState(financed, DUE - WARN_DAYS - 1), { kind: "none" });
});

test("from seven days before the due date to the due date itself: due soon, with the days left", () => {
  assert.deepEqual(lateState(financed, DUE - 7), { kind: "due-soon", days_left: 7 });
  assert.deepEqual(lateState(financed, DUE - 1), { kind: "due-soon", days_left: 1 });
  // a payment mined on the due date is still on time (settle: paid_date <= due_date)
  assert.deepEqual(lateState(financed, DUE), { kind: "due-soon", days_left: 0 });
});

test("past the due date and unpaid: overdue, a default only after the grace period", () => {
  assert.deepEqual(lateState(financed, DUE + 1), { kind: "overdue", days_over: 1, defaulted: false });
  // verify_history: Default when today > due + grace (7 by default)
  assert.deepEqual(lateState(financed, DUE + 7), { kind: "overdue", days_over: 7, defaulted: false });
  assert.deepEqual(lateState(financed, DUE + 8), { kind: "overdue", days_over: 8, defaulted: true });
  assert.deepEqual(lateState(financed, DUE + 3, null, 2), { kind: "overdue", days_over: 3, defaulted: true });
});

test("settled: the board's flag decides on time or late; without the board only 'paid'", () => {
  assert.deepEqual(lateState({ ...financed, bundle: "b" }, DUE + 20, "settled on time"), { kind: "paid-on-time" });
  assert.deepEqual(lateState({ ...financed, bundle: "b" }, DUE + 20, "settled late"), { kind: "paid-late" });
  assert.deepEqual(lateState({ ...financed, bundle: "b" }, DUE + 20, null), { kind: "paid" });
  // the board can show the settlement before the bundle reaches the inbox
  assert.deepEqual(lateState(financed, DUE + 2, "settled late"), { kind: "paid-late" });
  assert.deepEqual(lateState(financed, DUE - 2, "financed, registered on the board"), { kind: "due-soon", days_left: 2 });
});

test("the countdown runs to the end of the due date in UTC", () => {
  const start = DUE * 86_400_000;
  assert.equal(msToCutoff(DUE, start), 86_400_000);
  assert.equal(countdown(msToCutoff(DUE, start - 3 * 86_400_000 - 10 * 3_600_000)), "4 d 10 h");
  assert.equal(countdown(msToCutoff(DUE, start + 18 * 3_600_000 + 40 * 60_000)), "5 h 20 min");
  assert.equal(countdown(msToCutoff(DUE, start + 86_400_000 - 40 * 60_000)), "40 min");
  assert.equal(countdown(msToCutoff(DUE, start + 2 * 86_400_000)), "0 min");
});

test("due soon: three lines; in the history chain they speak of the history, outside it of the board", () => {
  const inChain = lateLines({ kind: "due-soon", days_left: 3 }, facts(true));
  assert.deepEqual(inChain.map((l) => l.glyph), ["歴", "証", "規"]);
  assert.match(inChain[0].text, /stays in your payment history for good/);
  assert.match(inChain[0].text, /cannot hide or skip an invoice/);
  assert.match(inChain[1].text, /you pay it 0\.0006 ZEC by 2026-10-28/);
  assert.match(inChain[2].text, /内規/);
  const outside = lateLines({ kind: "due-soon", days_left: 3 }, facts(false));
  assert.match(outside[0].text, /not in your history chain/);
  assert.doesNotMatch(outside.map((l) => l.text).join(" "), /harder to finance/);
});

test("overdue: the fact, the default date while it is ahead, the letter with the evidence file", () => {
  const before = lateLines({ kind: "overdue", days_over: 2, defaulted: false }, facts(true));
  assert.equal(before[0].text, "Due date passed: this invoice will be marked late in your history when it is paid.");
  assert.match(before[1].text, /Still unpaid on 2026-11-05/);
  assert.match(before[2].text, /evidence file/);
  const after = lateLines({ kind: "overdue", days_over: 9, defaulted: true }, facts(true));
  assert.match(after[1].text, /counts it as defaulted/);
  assert.equal(lateLines({ kind: "overdue", days_over: 2, defaulted: false }, facts(false)).length, 2);
});

test("paid: one mark; nothing for 'none'", () => {
  assert.deepEqual(lateLines({ kind: "paid-on-time" }, facts(true)).map((l) => l.glyph), ["済"]);
  assert.deepEqual(lateLines({ kind: "paid-late" }, facts(false)).map((l) => l.glyph), ["遅"]);
  assert.deepEqual(lateLines({ kind: "none" }, facts(true)), []);
});

test("the ledger's short line", () => {
  assert.equal(ledgerLine({ kind: "due-soon", days_left: 1 })?.text, "1 day left · a late mark stays");
  assert.equal(ledgerLine({ kind: "due-soon", days_left: 0 })?.text, "due today · a late mark stays");
  assert.equal(ledgerLine({ kind: "overdue", days_over: 2, defaulted: false })?.tone, "over");
  assert.equal(ledgerLine({ kind: "paid-on-time" })?.text, "paid on time");
  assert.equal(ledgerLine({ kind: "paid" }), null);
});

test("reminders: due within a week or overdue, not settled on this device, soonest first", () => {
  const rec = (n: string, due: number, extra: object = {}) => ({ n, invoice_id: `INV-${n}`, amount_zat: 60_000, due_date: due, assignment: { financier_seal: "s2" }, ...extra });
  const list = [rec("a", DUE + 5), rec("b", DUE - 2), rec("c", DUE + 30), rec("d", DUE - 9, { bundle: "x" }), rec("e", DUE, { assignment: {} })];
  const r = reminders(list, DUE);
  assert.deepEqual(r.map((x) => x.n), ["b", "a"]);
  assert.equal(reminderText(r[0], "0.0006 ZEC"), "INV-b: 0.0006 ZEC, 2 days past its due date. It will be marked late when paid.");
  assert.equal(reminderText(r[1], "0.0006 ZEC"), "INV-a: 0.0006 ZEC due in 5 days.");
});

// judge run 3, finding 1: the D-7 reminder sent right after financing kept the bell at 1 until
// the bundle came; it is handled once the slip was seen at its milestone, and D-1, D+1 are news
test("the node's milestones reached on a day: D-7, D-1 and D+1 from the due date", () => {
  assert.deepEqual(milestonesReached(DUE, DUE - 8), []);
  assert.deepEqual(milestonesReached(DUE, DUE - 3), ["d-7"]);
  assert.deepEqual(milestonesReached(DUE, DUE - 1), ["d-7", "d-1"]);
  assert.deepEqual(milestonesReached(DUE, DUE), ["d-7", "d-1"]);
  assert.deepEqual(milestonesReached(DUE, DUE + 1), ["d-7", "d-1", "d+1"]);
});

test("a reminder counts until its slip is seen at its milestone, or the invoice settles", () => {
  // financed three days before the due date: the node sends D-7 at once
  const fresh = { reminders_seen: undefined as string[] | undefined };
  assert.equal(reminderHandled(fresh, "d-7"), false);
  // the buyer opens the slip (from the financier's seal, not from the reminder)
  const seen = slipSeen(fresh.reminders_seen, DUE, DUE - 3);
  assert.deepEqual(seen, ["d-7"]);
  const rec = { reminders_seen: seen! };
  assert.equal(reminderHandled(rec, "d-7"), true);
  // opening it again the same day writes nothing
  assert.equal(slipSeen(rec.reminders_seen, DUE, DUE - 3), null);
  // D-1 is a new letter: it counts until the slip is seen again on or after D-1
  assert.equal(reminderHandled(rec, "d-1"), false);
  const later = slipSeen(rec.reminders_seen, DUE, DUE - 1)!;
  assert.deepEqual(later, ["d-7", "d-1"]);
  assert.equal(reminderHandled({ reminders_seen: later }, "d-1"), true);
  assert.equal(reminderHandled({ reminders_seen: later }, "d+1"), false);
  // settled on this device: every reminder is done, seen or not
  assert.equal(reminderHandled({ bundle: "b" }, "d+1"), true);
});

test("a reminder in the inbox is seen with the slip even if the buyer's day lags the node's", () => {
  // the node's UTC day reached D-7, the buyer's clock still says D-8
  assert.deepEqual(slipSeen(undefined, DUE, DUE - 8, ["d-7"]), ["d-7"]);
  // opening the reminder itself records its milestone; unknown words are ignored
  assert.deepEqual(slipSeen(["d-7"], DUE, DUE - 8, ["d-1", "soon", 3]), ["d-7", "d-1"]);
  assert.equal(slipSeen(undefined, DUE, DUE - 8, ["soon"]), null);
  // a reminder without a milestone: seeing the slip once is enough
  assert.equal(reminderHandled({ reminders_seen: [] }, undefined), false);
  assert.equal(reminderHandled({ reminders_seen: ["d-7"] }, undefined), true);
});

test("mobile E2E 4: the paid slip's bar says on time or late only when the board says so", async () => {
  const { paidWords } = await import("../src/lib/buyer-late.ts");
  assert.equal(paidWords({ kind: "paid-on-time" }), "Paid on time");
  assert.equal(paidWords({ kind: "paid-late" }), "Paid late");
  assert.equal(paidWords({ kind: "paid" }), "Paid");
});
