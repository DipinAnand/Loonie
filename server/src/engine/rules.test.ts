import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENGINE_VERSION, nextMove, quietGrade } from "./advice.js";
import { buildLeakReceipt, netRefunds } from "./receipt.js";
import type { Txn } from "./types.js";

const AS_OF = "2026-10-01";
let n = 0;
const tx = (over: Partial<Txn>): Txn => ({ id: `r${n++}`, accountId: "a", date: AS_OF, amount: 10, name: "X", ...over });
const fee = (r: ReturnType<typeof buildLeakReceipt>, type: string) => r.leaks.find((l) => l.features.feeType === type);

describe("NSF cap ($10 since March 12, 2026)", () => {
  const r = buildLeakReceipt(
    [
      tx({ date: "2026-01-15", amount: 48, name: "NSF FEE" }),
      tx({ date: "2026-02-10", amount: 48, name: "NSF FEE" }),
      tx({ date: "2026-04-02", amount: 48, name: "NSF FEE" }),
      tx({ date: "2026-05-02", amount: 10, name: "NSF FEE" }),
    ],
    { asOf: AS_OF },
  );

  it("counts only the excess of post-cap NSF fees as owed back", () => {
    const over = fee(r, "nsf_over_cap")!;
    assert.equal(over.annualImpact, 38);
    assert.equal(over.meta?.confidence, "high");
    assert.match(over.meta?.script ?? "", /refund the \$38\.00 above the cap/);
  });
  it("keeps pre-cap and at-cap NSF fees in the ordinary NSF leak", () => {
    const nsf = fee(r, "nsf")!;
    assert.equal(nsf.txnIds.length, 3);
    assert.match(nsf.detail, /before the \$10 cap/);
  });
});

describe("refunds and reversals", () => {
  it("drops a fee and its reversal, and a purchase and its refund", () => {
    const txns = [
      tx({ id: "f1", date: "2026-09-01", amount: 48, name: "NSF FEE" }),
      tx({ id: "f2", date: "2026-09-03", amount: -48, name: "NSF FEE REVERSAL" }),
      tx({ id: "p1", date: "2026-08-01", amount: 64.2, name: "AMAZON.CA" }),
      tx({ id: "p2", date: "2026-08-20", amount: -64.2, name: "AMAZON.CA REFUND" }),
      tx({ id: "pay", date: "2026-09-15", amount: -2150, name: "PAYROLL", categoryPrimary: "INCOME" }),
    ];
    assert.deepEqual(netRefunds(txns).map((t) => t.id), ["pay"]);
  });
  it("leaves the second of a refunded double charge out of the duplicate rule", () => {
    const txns = [
      tx({ date: "2026-09-10", amount: 64.2, name: "RESTAURANT LE MARCHE" }),
      tx({ date: "2026-09-10", amount: 64.2, name: "RESTAURANT LE MARCHE" }),
      tx({ date: "2026-09-12", amount: -64.2, name: "RESTAURANT LE MARCHE" }),
    ];
    assert.equal(buildLeakReceipt(txns, { asOf: AS_OF }).leaks.filter((l) => l.kind === "duplicate").length, 0);
  });
});

describe("foreign transaction spread", () => {
  it("estimates 2.5% on foreign-currency purchases when no FX fee line is shown", () => {
    const r = buildLeakReceipt(
      [
        tx({ date: "2026-07-01", amount: 1000, name: "HOTEL MIAMI USD 730.00 @ 1.3699" }),
        tx({ date: "2026-07-02", amount: 1310, name: "AIRBNB", currency: "USD" }),
        tx({ date: "2026-07-03", amount: 50, name: "LOBLAWS", currency: "CAD" }),
        tx({ date: "2026-07-04", amount: 20, name: "TIM HORTONS", currency: "CAD" }),
        tx({ date: "2026-07-05", amount: 30, name: "PETRO-CANADA", currency: "CAD" }),
      ],
      { asOf: AS_OF },
    );
    const spread = fee(r, "fx_spread")!;
    assert.match(spread.detail, /2\.5% on \$2,310\.00/);
    assert.equal(spread.meta?.confidence, "medium");
  });
  it("defers to explicit FX fee lines", () => {
    const r = buildLeakReceipt(
      [tx({ amount: 400, name: "HOTEL USD 290.00" }), tx({ amount: 10, name: "FOREIGN TRANSACTION FEE" })],
      { asOf: AS_OF },
    );
    assert.equal(fee(r, "fx_spread"), undefined);
    assert.ok(fee(r, "fx"));
  });
});

describe("advice on every finding", () => {
  it("stamps confidence, rule version and a fix on each leak", () => {
    // Twelve monthly charges, Oct 2025 through Sep 2026.
    const plan = Array.from({ length: 12 }, (_, i) =>
      tx({ date: new Date(Date.UTC(2025, 9 + i, 28)).toISOString().slice(0, 10), amount: 16.95, name: "MONTHLY PLAN FEE" }),
    );
    const r = buildLeakReceipt(plan, { asOf: AS_OF });
    const leak = fee(r, "monthly_account_fee")!;
    assert.equal(leak.meta?.ruleVersion, ENGINE_VERSION);
    assert.equal(leak.meta?.confidence, "high");
    assert.match(leak.meta?.script ?? "", /\$16\.95 a month for a year\. Can you move me to your low-cost account\? It's capped at \$4\.00/);
  });
});

describe("next move and grade", () => {
  it("ranks a plan-fee switch by what it saves after the $4 cap", () => {
    const move = nextMove([
      { id: "a", kind: "fee", merchantKey: "monthly_account_fee", title: "Monthly account fees", annualImpact: 203.4, verdict: null, meta: {} },
      { id: "b", kind: "subscription", merchantKey: "crave", title: "Crave (monthly)", annualImpact: 120, verdict: null, meta: {} },
      { id: "c", kind: "subscription", merchantKey: "gym", title: "Gym (monthly)", annualImpact: 900, verdict: "dismissed", meta: {} },
    ])!;
    assert.equal(move.leakId, "a");
    assert.equal(move.savesPerYear, 155.4);
    assert.match(move.title, /low-cost account/);
  });
  it("grades the yearly leak A to D", () => {
    assert.deepEqual([10, 120, 378.15, 900].map(quietGrade), ["A", "B", "C", "D"]);
  });
});
