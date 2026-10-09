import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFee } from "./fees.js";
import { buildLeakReceipt } from "./receipt.js";
import { detectRecurring } from "./recurring.js";
import { leakyScenario } from "./scenario.js";
import type { Txn } from "./types.js";
import { merchantKey } from "./util.js";

const AS_OF = "2026-10-01";
const scenarioTxns: Txn[] = leakyScenario(AS_OF).map((t, i) => ({
  id: `t${i}`,
  accountId: "acc1",
  date: t.date,
  amount: t.amount,
  name: t.description,
}));

const tx = (over: Partial<Txn>): Txn => ({ id: "x", accountId: "a", date: AS_OF, amount: 10, name: "X", ...over });

describe("merchantKey", () => {
  it("collapses descriptor noise", () => {
    assert.equal(merchantKey("NETFLIX.COM 866-579-7172 ON"), "netflix");
    assert.equal(merchantKey("SQ *BEST BUY ONLINE 4421"), "best buy online");
    assert.equal(merchantKey("PAD GOODLIFE FITNESS #4471"), "goodlife fitness");
  });
  it("prefers Plaid merchant_name when present", () => {
    assert.equal(merchantKey("NETFLIX.COM 866", "Netflix"), "netflix");
  });
});

describe("classifyFee", () => {
  it("matches bilingual descriptors", () => {
    assert.equal(classifyFee(tx({ name: "FRAIS MENSUELS / MONTHLY FEE" }))?.type, "monthly_account_fee");
    assert.equal(classifyFee(tx({ name: "NSF FEE / FRAIS FONDS INSUFFISANTS" }))?.type, "nsf");
    assert.equal(classifyFee(tx({ name: "Frais de change" }))?.type, "fx");
  });
  it("falls back to Plaid categories", () => {
    assert.equal(classifyFee(tx({ name: "SVC CHG", categoryDetailed: "BANK_FEES_ATM_FEES" }))?.type, "atm");
  });
  it("ignores inflows and ordinary purchases", () => {
    assert.equal(classifyFee(tx({ name: "OVERDRAFT FEE REVERSAL", amount: -5 })), null);
    assert.equal(classifyFee(tx({ name: "LOBLAWS #1032" })), null);
  });
});

describe("detectRecurring", () => {
  const series = detectRecurring(scenarioTxns, AS_OF);
  const byKey = new Map(series.map((s) => [s.merchantKey, s]));

  it("finds monthly subscriptions", () => {
    for (const key of ["netflix", "spotify", "goodlife fitness", "apple bill icloud"]) {
      assert.equal(byKey.get(key)?.cadence, "monthly", key);
    }
    assert.equal(byKey.get("netflix")?.annualCost, 16.49 * 12);
  });
  it("does not treat irregular grocery spend or payroll as recurring", () => {
    assert.ok(!byKey.has("loblaws toronto"));
    assert.ok(![...byKey.keys()].some((k) => k.includes("payroll")));
  });
  it("marks a series inactive once charges stop", () => {
    const old: Txn[] = ["2026-01-05", "2026-02-05", "2026-03-05"].map((date, i) => tx({ id: `o${i}`, date, name: "HULU" }));
    assert.equal(detectRecurring(old, AS_OF)[0].active, false);
  });
});

describe("buildLeakReceipt", () => {
  const receipt = buildLeakReceipt(scenarioTxns, { asOf: AS_OF });
  const kinds = (k: string) => receipt.leaks.filter((l) => l.kind === k);

  it("finds every leak type in the scenario", () => {
    assert.ok(kinds("fee").some((l) => l.features.feeType === "monthly_account_fee"));
    assert.ok(kinds("fee").some((l) => l.features.feeType === "nsf"));
    assert.ok(kinds("fee").some((l) => l.features.feeType === "fx"));
    assert.ok(kinds("fee").some((l) => l.features.feeType === "transaction_fee"));
    assert.equal(kinds("price_hike").length, 1);
    assert.equal(kinds("price_hike")[0].merchantKey, "spotify");
    assert.equal(kinds("price_hike")[0].annualImpact, 24);
    assert.equal(kinds("duplicate").length, 1);
    assert.equal(kinds("duplicate")[0].annualImpact, 89.99);
  });

  it("never flags rent as a subscription leak when Plaid marks it essential", () => {
    const withCats = scenarioTxns.map((t) => (t.name.startsWith("RENT") ? { ...t, categoryPrimary: "RENT_AND_UTILITIES" } : t));
    const r = buildLeakReceipt(withCats, { asOf: AS_OF });
    assert.ok(!r.leaks.some((l) => l.kind === "subscription" && l.merchantKey.includes("rent")));
  });

  it("keeps leak ids stable across runs and drops dismissed leaks from the total", () => {
    const again = buildLeakReceipt(scenarioTxns, { asOf: AS_OF });
    assert.deepEqual(again.leaks.map((l) => l.id), receipt.leaks.map((l) => l.id));

    const netflix = receipt.leaks.find((l) => l.kind === "subscription" && l.merchantKey === "netflix")!;
    const dismissed = buildLeakReceipt(scenarioTxns, { asOf: AS_OF, verdicts: new Map([[netflix.id, "dismissed"]]) });
    assert.equal(dismissed.leaks.find((l) => l.id === netflix.id)?.verdict, "dismissed");
    assert.ok(Math.abs(receipt.totalAnnualImpact - dismissed.totalAnnualImpact - netflix.annualImpact) < 0.01);
  });

  it("does not double count a price hike inside its live subscription", () => {
    const spotifySub = kinds("subscription").find((l) => l.merchantKey === "spotify")!;
    const hike = kinds("price_hike")[0];
    const sum = receipt.leaks.reduce((s, l) => s + l.annualImpact, 0);
    assert.ok(Math.abs(sum - hike.annualImpact - receipt.totalAnnualImpact) < 0.01);
    const kept = buildLeakReceipt(scenarioTxns, { asOf: AS_OF, verdicts: new Map([[spotifySub.id, "dismissed"]]) });
    assert.ok(Math.abs(receipt.totalAnnualImpact - spotifySub.annualImpact + hike.annualImpact - kept.totalAnnualImpact) < 0.01);
  });
});

describe("classifyFee ordering", () => {
  it("prefers the specific rule over the generic one", () => {
    assert.equal(classifyFee(tx({ name: "ATM WITHDRAWAL FEE" }))?.type, "atm");
    assert.equal(classifyFee(tx({ name: "FOREIGN TRANSACTION FEE" }))?.type, "fx");
  });
});
