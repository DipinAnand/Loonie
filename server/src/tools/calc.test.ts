import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renewalCountdown, dueMilestone, validRenewal } from "../engine/renewal.js";
import { detectSwitchItems } from "../engine/switchkit.js";
import type { Txn } from "../engine/types.js";
import { TRACKS, trackView } from "../engagement/tracks.js";
import { acceleratedBiweekly, breakMortgage, budget503020, carCost, creditTrap, rateBlockShare, renewalCost, rentVsBuy, tfsaGrowth } from "./calc.js";

describe("calculators reproduce the site's figures", () => {
  it("renewal letter vs best quote: $8,599 over five years on $450k (4.89% vs 4.29%)", () => {
    assert.equal(Math.round(renewalCost({ balance: 450_000, letterRate: 4.89, quoteRate: 4.29 }).termCost), 8599);
  });
  it("accelerated biweekly: ~$45,000 saved and 3.3 years sooner on $450k at 4.5%", () => {
    const r = acceleratedBiweekly({ balance: 450_000, rate: 4.5 });
    assert.ok(r.interestSaved > 44_500 && r.interestSaved < 45_500, String(r.interestSaved));
    assert.equal(r.yearsSooner, 3.3);
  });
  it("Rate Block: about $2,250 back on $450k at a 1% commission", () => {
    assert.equal(rateBlockShare({ balance: 450_000 }).yourHalf, 2250);
  });
  it("break mortgage: Big-5 IRD versus a fair 3-month penalty", () => {
    const big = breakMortgage({ balance: 420_000, currentRate: 5.49, newRate: 4.19, monthsLeft: 32, lender: "big5" });
    const fair = breakMortgage({ balance: 420_000, currentRate: 5.49, newRate: 4.19, monthsLeft: 32, lender: "fair" });
    // Saves $14,560 in interest; the Big-5 IRD (95% of that) eats almost all of it.
    assert.equal(big.interestSaved, 14560);
    assert.equal(big.penalty, 13832);
    assert.equal(fair.penalty, 5764.5);
    assert.equal(fair.net, 8795.5);
    assert.equal(breakMortgage({ balance: 300_000, currentRate: 5, newRate: 4.8, monthsLeft: 12, lender: "big5" }).verdict, "stay");
  });
  it("credit trap: minimum payments take years; cheaper debt saves interest", () => {
    const r = creditTrap({ balance: 6000, apr: 19.99, mode: "minimum" });
    assert.ok(r.months! > 120);
    assert.ok(r.options.find((o) => o.id === "balance_transfer")!.saves! > 0);
    assert.equal(creditTrap({ balance: 6000, apr: 19.99, mode: "fixed", payment: 50 }).months, null); // never clears
  });
  it("50/30/20 on Ontario take-home", () => {
    const b = budget503020({ monthlyGross: 5000, province: "ON" });
    assert.equal(b.takeHome, 3925);
    assert.equal(b.needs + b.wants + b.savings, 3925);
    assert.equal(b.tfsa + b.rrsp + b.emergency, b.savings);
  });
  it("TFSA growth, rent vs buy and car cost run on the site's defaults", () => {
    const t = tfsaGrowth({ monthly: 541, existing: 15_000, rate: 6, years: 25 });
    assert.ok(t.futureValue > t.contributed);
    const rb = rentVsBuy({ price: 650_000, downPct: 10, rate: 5.5, rent: 2200, years: 5 });
    assert.ok(rb.cmhcPremium > 0 && rb.ownMonthly > rb.mortgagePayment);
    const c = carCost({ price: 35_000, down: 5000, rate: 7.9, termMonths: 60, annualIncome: 70_000 });
    assert.equal(c.ceiling, 875);
    assert.equal(c.fits, false);
  });
});

describe("renewal countdown", () => {
  it("at 112 days: quotes milestone, 180 and 120 passed, next is the retention call", () => {
    const r = renewalCountdown({ maturityDate: "2027-02-09" }, "2026-10-20");
    assert.equal(r.daysLeft, 112);
    assert.equal(r.currentMilestone, "quotes");
    assert.equal(r.action, "Get two written quotes and a rate hold now.");
    assert.deepEqual(r.milestones.map((m) => m.status), ["passed", "passed", "upcoming", "upcoming"]);
    assert.equal(r.band, "calm");
  });
  it("turns red inside 21 days and stays quiet before 180", () => {
    assert.equal(renewalCountdown({ maturityDate: "2026-11-01" }, "2026-10-20").band, "red");
    assert.equal(dueMilestone("2027-12-01", "2026-10-20"), null);
    assert.equal(dueMilestone("2027-02-09", "2026-10-20")?.id, "quotes");
  });
  it("adds the cost of signing the letter when rates are known", () => {
    const r = renewalCountdown({ maturityDate: "2027-02-09", balance: 450_000, letterRate: 4.89, quoteRate: 4.29 }, "2026-10-20");
    assert.equal(Math.round(r.costs!.termCost), 8599);
  });
  it("validates input", () => {
    assert.equal(validRenewal({ maturityDate: "soon" }), null);
    assert.deepEqual(validRenewal({ maturityDate: "2027-02-09", balance: -5 }), {
      maturityDate: "2027-02-09",
      balance: undefined,
      letterRate: undefined,
      quoteRate: undefined,
      amortizationYears: undefined,
    });
  });
});

describe("switch kit", () => {
  const txns: Txn[] = [];
  let i = 0;
  const add = (date: string, amount: number, name: string, categoryPrimary: string | null = null) =>
    txns.push({ id: `s${i++}`, accountId: "chq", date, amount, name, categoryPrimary });
  for (let m = 0; m < 6; m++) {
    const month = String(4 + m).padStart(2, "0");
    add(`2026-${month}-01`, 2410, "MORTGAGE PAYMENT", "LOAN_PAYMENTS");
    add(`2026-${month}-12`, 64.99, "PAD GOODLIFE FITNESS");
    add(`2026-${month}-15`, -2150, "PAYROLL DEPOSIT ACME", "INCOME");
    for (const day of [4, 9, 17, 23]) add(`2026-${month}-${String(day).padStart(2, "0")}`, 25 + ((m + day) % 7) * 13, "LOBLAWS");
  }
  const items = detectSwitchItems(txns, "2026-09-20");

  it("lists deposits first, then every recurring payment including the mortgage", () => {
    assert.deepEqual(
      items.map((x) => [x.direction, x.name]),
      [
        ["deposit", "Payroll Deposit Acme"],
        ["payment", "Mortgage Payment"],
        ["payment", "Goodlife Fitness"],
      ],
    );
  });
  it("keeps item keys stable", () => {
    assert.deepEqual(detectSwitchItems(txns, "2026-09-20").map((x) => x.key), items.map((x) => x.key));
  });
});

describe("tracks", () => {
  it("levels up by tasks done and auto-completes the scan task", () => {
    const view = trackView(TRACKS.newcomers, new Map([["no_fee_chequing", "2026-10-01"]]), { scanned: true, subscriptionsReviewed: false });
    assert.equal(view.done, 2);
    assert.equal(view.level, "Chick");
    assert.equal(view.next, "sin_cra");
    assert.equal(TRACKS.students.tasks.length, 12);
    const all = new Map(TRACKS.students.tasks.map((t) => [t.id, "2026-10-01"]));
    assert.equal(trackView(TRACKS.students, all, { scanned: false, subscriptionsReviewed: false }).level, "Golden Loon");
  });
});
