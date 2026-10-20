import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billStatus, buildBillPlan, coverage, nextPayday, occurrences } from "./bills.js";
import { leakyScenario } from "./scenario.js";
import type { Txn } from "./types.js";
import { addDays } from "./util.js";

const AS_OF = "2026-10-01";
const txns: Txn[] = leakyScenario(AS_OF).map((t, i) => ({ id: `t${i}`, accountId: "acc1", date: t.date, amount: t.amount, name: t.description }));
const plan = buildBillPlan(txns, AS_OF);
const bill = (key: string) => {
  const b = plan.bills.find((x) => x.merchantKey.includes(key));
  assert.ok(b, `no bill for ${key}`);
  return b;
};

describe("buildBillPlan", () => {
  it("tracks essential bills next to subscriptions", () => {
    assert.equal(bill("rent").kind, "bill");
    assert.equal(bill("hydro").kind, "bill");
    assert.equal(bill("insurance").kind, "bill");
    assert.equal(bill("daycare").cadence, "biweekly");
    assert.equal(bill("netflix").kind, "subscription");
    assert.ok(!plan.bills.some((b) => b.merchantKey.includes("loblaws")));
  });

  it("finds the paycheque and when the next one lands", () => {
    assert.equal(plan.paydays.length, 1);
    assert.equal(plan.paydays[0].cadence, "biweekly");
    assert.equal(plan.paydays[0].amount, 2150);
    assert.equal(plan.paydays[0].nextDate, addDays(AS_OF, 12));
  });

  it("flags a bill that came in well above its usual amount", () => {
    assert.deepEqual(bill("hydro").change, { from: 96.2, to: 142.6 });
    assert.equal(bill("insurance").change, null);
  });

  it("treats loan and card payments as bills only when Plaid says so", () => {
    const card = ["2026-07-15", "2026-08-15", "2026-09-15"].map((date, i) => ({
      id: `c${i}`,
      accountId: "a",
      date,
      amount: 250,
      name: "VISA PAYMENT",
      categoryPrimary: "LOAN_PAYMENTS",
    }));
    const p = buildBillPlan(card, AS_OF);
    assert.equal(p.bills[0]?.kind, "debt");
  });
});

describe("billStatus", () => {
  it("calls a bill late only once a scan has looked past its due date", () => {
    const daycare = bill("daycare");
    assert.equal(billStatus(daycare, plan, AS_OF).status, "late");
    assert.equal(billStatus(daycare, plan, AS_OF).lateDays, 3);
    // Same bill, but the last scan was before it was due: we can't know yet.
    const stale = { ...plan, asOf: addDays(daycare.nextDate, -1) };
    assert.notEqual(billStatus(daycare, stale, AS_OF).status, "late");
  });

  it("marks bills due within three days", () => {
    const crave = bill("crave");
    assert.equal(billStatus(crave, plan, AS_OF).inDays, 1);
    assert.equal(billStatus(crave, plan, AS_OF).status, "due_soon");
    assert.equal(billStatus(bill("netflix"), plan, AS_OF).status, "upcoming");
  });
});

describe("occurrences", () => {
  it("repeats weekly bills inside the window and keeps an unpaid one", () => {
    const daycare = bill("daycare"); // due 3 days ago
    const dates = occurrences(daycare, AS_OF, addDays(AS_OF, 30));
    assert.deepEqual(dates, [daycare.nextDate, addDays(daycare.nextDate, 14), addDays(daycare.nextDate, 28)]);
  });
});

describe("coverage", () => {
  it("counts bills due before the next payday", () => {
    const c = coverage(plan, AS_OF, 3000);
    assert.equal(c.until, addDays(nextPayday(plan, AS_OF)!.nextDate, -1));
    assert.ok(c.dueBills.some((b) => b.name.toLowerCase().includes("rent")));
    assert.ok(c.dueBills.every((b) => b.date <= c.until));
    assert.equal(c.status, c.cushion! < 0 ? "short" : c.cushion! < Math.max(100, c.due * 0.1) ? "tight" : "ok");
  });

  it("warns when the balance won't cover them", () => {
    const due = coverage(plan, AS_OF, null).due;
    assert.equal(coverage(plan, AS_OF, due - 1).status, "short");
    assert.equal(coverage(plan, AS_OF, due + 50).status, "tight");
    assert.equal(coverage(plan, AS_OF, due + 1000).status, "ok");
    assert.equal(coverage(plan, AS_OF, null).status, "unknown");
  });

  it("leaves out bills the user hid", () => {
    const rent = bill("rent");
    const all = coverage(plan, AS_OF, 5000);
    const without = coverage(plan, AS_OF, 5000, new Set([rent.id]));
    assert.equal(Math.round((all.due - without.due) * 100) / 100, rent.amount);
  });

  it("falls back to two weeks when there is no paycheque", () => {
    const noPay = { ...plan, paydays: [] };
    assert.equal(coverage(noPay, AS_OF, 1000).until, addDays(AS_OF, 14));
    assert.equal(coverage(noPay, AS_OF, 1000).payday, null);
  });
});
