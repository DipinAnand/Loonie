import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSuspicious } from "./anomaly.js";
import type { Txn } from "./types.js";
import { addDays } from "./util.js";

const AS_OF = "2026-10-09";
let n = 0;
const tx = (daysAgo: number, amount: number, name: string, over: Partial<Txn> = {}): Txn => ({
  id: `t${n++}`,
  accountId: "a",
  date: addDays(AS_OF, -daysAgo),
  amount,
  name,
  currency: "CAD",
  ...over,
});

// Six months of ordinary life: groceries, a gym, a phone bill.
const baseline: Txn[] = [];
for (let m = 1; m <= 6; m++) {
  baseline.push(tx(m * 30, 85 + m, "LOBLAWS #1032"), tx(m * 30 + 3, 64.99, "GOODLIFE FITNESS"), tx(m * 30 + 5, 75, "ROGERS WIRELESS"));
}
const run = (extra: Txn[], opts: Partial<Parameters<typeof detectSuspicious>[1]> = {}) =>
  detectSuspicious([...baseline, ...extra], { asOf: AS_OF, lookbackDays: 14, ...opts });

describe("detectSuspicious", () => {
  it("flags a $1 charge from a brand-new merchant (card testing)", () => {
    const [hit] = run([tx(2, 1.0, "QWKMART ONLINE 88123")]);
    assert.equal(hit.features.rule, "card_test");
  });

  it("flags a cluster of micro charges, even if each is a bit over $1", () => {
    const hits = run([tx(3, 1.79, "ZXP DIGITAL"), tx(2, 1.49, "KLMN STORE")]);
    assert.equal(hits.length, 2);
  });

  it("does not flag a new café or a known merchant", () => {
    assert.equal(run([tx(2, 0.99, "NEW CAFE", { categoryPrimary: "FOOD_AND_DRINK" })]).length, 0);
    assert.equal(run([tx(2, 0.5, "LOBLAWS #1032")]).length, 0);
  });

  it("flags a large first charge from a new merchant, not from a known one", () => {
    assert.equal(run([tx(1, 899, "ELECTRO WORLD ONLINE")])[0].features.rule, "large_new_merchant");
    assert.equal(run([tx(1, 250, "ROGERS WIRELESS")]).length, 0);
    assert.equal(run([tx(1, 60, "NEW BOOKSHOP")]).length, 0);
  });

  it("flags foreign-currency charges from new merchants only", () => {
    assert.equal(run([tx(1, 40, "SHOP LONDON", { currency: "GBP" })])[0].features.rule, "foreign_new_merchant");
    assert.equal(run([tx(1, 40, "LOBLAWS #1032", { currency: "USD" })]).length, 0);
  });

  it("flags a subscription still charging after the user said they don't need it", () => {
    const cancelled = new Map([["goodlife fitness", addDays(AS_OF, -12)]]);
    const hits = run([tx(1, 64.99, "GOODLIFE FITNESS")], { cancelledMerchants: cancelled });
    assert.equal(hits[0].features.rule, "zombie_subscription");
    // Within the grace period: fine.
    assert.equal(run([tx(10, 64.99, "GOODLIFE FITNESS")], { cancelledMerchants: cancelled }).length, 0);
  });

  it("ignores anything older than the lookback window and keeps ids stable", () => {
    const old = tx(20, 1.0, "OLD WEIRD MERCHANT");
    assert.equal(run([old]).length, 0);
    const t = tx(1, 1.0, "STABLE ID MERCHANT");
    assert.equal(run([t])[0].id, run([t])[0].id);
  });
});
