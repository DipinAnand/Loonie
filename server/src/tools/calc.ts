import { round2 } from "../engine/util.js";

/**
 * Money calculators from loonifinancial.com/tools, as pure functions.
 * "Math from fixed rules": the same inputs always give the same answer, and
 * every assumption the site states is a named constant here.
 */

// ---- mortgages (Canadian: fixed rates compound semi-annually) -----------------

/** Monthly rate for a Canadian fixed mortgage quoted at `annual` (e.g. 0.0489). */
export const canadianMonthlyRate = (annual: number) => Math.pow(1 + annual / 2, 1 / 6) - 1;

export function payment(principal: number, periodRate: number, periods: number): number {
  if (periods <= 0) return principal;
  if (periodRate === 0) return principal / periods;
  return (principal * periodRate) / (1 - Math.pow(1 + periodRate, -periods));
}

export interface RenewalCostInput {
  balance: number;
  /** Rate in the renewal letter, e.g. 4.89 (percent). */
  letterRate: number;
  /** Best written quote, e.g. 4.29 (percent). */
  quoteRate: number;
  /** Amortization left, in years. */
  amortizationYears?: number;
  termYears?: number;
}

/** What signing the renewal letter costs over the term versus the best quote ($8,599 on $450k, 4.89% vs 4.29%, 20 years left). */
export function renewalCost(i: RenewalCostInput) {
  const months = (i.amortizationYears ?? 20) * 12;
  const term = (i.termYears ?? 5) * 12;
  const letter = payment(i.balance, canadianMonthlyRate(i.letterRate / 100), months);
  const quote = payment(i.balance, canadianMonthlyRate(i.quoteRate / 100), months);
  return {
    letterPayment: round2(letter),
    quotePayment: round2(quote),
    monthlyDifference: round2(letter - quote),
    termCost: round2((letter - quote) * term),
  };
}

/** Accelerated biweekly (half the monthly payment every two weeks) versus monthly (~$45,000 and 3.3 years on $450k at 4.5%). */
export function acceleratedBiweekly(i: { balance: number; rate: number; amortizationYears?: number }) {
  const annual = i.rate / 100;
  const months = (i.amortizationYears ?? 25) * 12;
  const monthlyRate = canadianMonthlyRate(annual);
  const monthly = payment(i.balance, monthlyRate, months);

  const run = (rate: number, pay: number, cap: number) => {
    let balance = i.balance;
    let interest = 0;
    let n = 0;
    while (balance > 0.01 && n < cap) {
      const it = balance * rate;
      interest += it;
      balance -= Math.min(pay - it, balance);
      n++;
    }
    return { interest, n };
  };
  const m = run(monthlyRate, monthly, months * 2);
  const b = run(Math.pow(1 + annual / 2, 2 / 26) - 1, monthly / 2, months * 5);
  return {
    monthlyPayment: round2(monthly),
    biweeklyPayment: round2(monthly / 2),
    interestSaved: round2(m.interest - b.interest),
    yearsSooner: Math.round((m.n / 12 - b.n / 26) * 10) / 10,
  };
}

/** Break the mortgage early? Big-5 banks charge the larger of 3 months' interest and the IRD; a fair lender charges 3 months. */
export function breakMortgage(i: { balance: number; currentRate: number; newRate: number; monthsLeft: number; lender: "big5" | "fair" }) {
  const years = i.monthsLeft / 12;
  const saved = i.balance * ((i.currentRate - i.newRate) / 100) * years;
  const threeMonths = i.balance * (i.currentRate / 100) * 0.25;
  const ird = Math.max(0, saved * 0.95);
  const penalty = i.lender === "big5" ? Math.max(threeMonths, ird) : threeMonths;
  const net = saved - penalty;
  return {
    interestSaved: round2(saved),
    threeMonthsInterest: round2(threeMonths),
    penalty: round2(penalty),
    net: round2(net),
    verdict: net > 500 ? ("break" as const) : net > -500 ? ("wash" as const) : ("stay" as const),
  };
}

/** Rate Block: whatever commission the lender pays Looni is split half and half with you. */
export function rateBlockShare(i: { balance: number; commissionPct?: number }) {
  const commission = i.balance * ((i.commissionPct ?? 1) / 100);
  return { commission: round2(commission), yourHalf: round2(commission / 2) };
}

// ---- credit cards ----------------------------------------------------------------

const MAX_MONTHS = 1200;

/** Months and interest to clear a card. Minimum = max(3% of balance, $10), the common Canadian rule. */
export function payDownCard(balance: number, apr: number, mode: "minimum" | "fixed", fixedPayment = 0) {
  const r = apr / 100 / 12;
  if (mode === "fixed" && fixedPayment <= balance * r) return { months: null, interest: null };
  let b = balance;
  let months = 0;
  let interest = 0;
  while (b > 0.01 && months < MAX_MONTHS) {
    const it = b * r;
    interest += it;
    b += it;
    const pay = Math.min(mode === "minimum" ? Math.max(b * 0.03, 10) : fixedPayment, b);
    b -= pay;
    months++;
  }
  return months >= MAX_MONTHS ? { months: null, interest: null } : { months, interest: round2(interest) };
}

export const CARD_ALTERNATIVES = [
  { id: "lower_rate", label: "Ask the issuer for a lower rate", apr: (current: number) => Math.max(current - 7, 9.99) },
  { id: "balance_transfer", label: "Balance transfer promo", apr: () => 3.99 },
  { id: "consolidation", label: "Consolidation loan", apr: () => 11.99 },
  { id: "line_of_credit", label: "Unsecured line of credit", apr: () => 9.99 },
  { id: "heloc", label: "Home equity line (HELOC)", apr: () => 6.45 },
];

/** The credit trap: how long the card takes, and what cheaper debt would save at the same payment. */
export function creditTrap(i: { balance: number; apr: number; mode: "minimum" | "fixed"; payment?: number }) {
  const current = payDownCard(i.balance, i.apr, i.mode, i.payment);
  // Compare everything at one fixed payment: what the user pays, or 4% of the balance ($50 floor).
  const reference = i.mode === "fixed" && i.payment ? i.payment : Math.max(Math.round(i.balance * 0.04), 50);
  const base = payDownCard(i.balance, i.apr, "fixed", reference);
  const options = CARD_ALTERNATIVES.map((o) => {
    const apr = o.apr(i.apr);
    const r = payDownCard(i.balance, apr, "fixed", reference);
    return {
      id: o.id,
      label: o.label,
      apr,
      interest: r.interest,
      saves: base.interest !== null && r.interest !== null ? round2(base.interest - r.interest) : null,
    };
  });
  return { months: current.months, interest: current.interest, comparisonPayment: reference, options };
}

// ---- budgets and savings ------------------------------------------------------------

/** Rough combined tax rate on gross pay, by province (site estimates). */
export const PROVINCE_TAX: Record<string, number> = { ON: 0.215, BC: 0.209, AB: 0.18, QC: 0.248 };

/** 50/30/20 on Canadian take-home, with savings split 50% TFSA / 30% RRSP / 20% emergency fund. */
export function budget503020(i: { monthlyGross: number; province: string }) {
  const tax = PROVINCE_TAX[i.province] ?? PROVINCE_TAX.ON;
  const net = Math.round(i.monthlyGross * (1 - tax));
  const savings = net * 0.2;
  return {
    taxRate: tax,
    takeHome: net,
    needs: round2(net * 0.5),
    wants: round2(net * 0.3),
    savings: round2(savings),
    tfsa: round2(savings * 0.5),
    rrsp: round2(savings * 0.3),
    emergency: round2(savings * 0.2),
  };
}

export const TFSA_ANNUAL_LIMIT_2026 = 7000;
export const TFSA_CUMULATIVE_2026 = 109000;

/** TFSA growth with monthly contributions; the taxable comparison assumes about 25% of the gain lost to tax. */
export function tfsaGrowth(i: { monthly: number; existing: number; rate: number; years: number }) {
  const r = i.rate / 100 / 12;
  const n = i.years * 12;
  const fv = r === 0 ? i.existing + i.monthly * n : i.existing * Math.pow(1 + r, n) + i.monthly * ((Math.pow(1 + r, n) - 1) / r);
  const contributed = i.existing + i.monthly * n;
  const gain = fv - contributed;
  return {
    futureValue: round2(fv),
    contributed: round2(contributed),
    gain: round2(gain),
    taxableWouldLose: round2(gain * 0.25),
    overAnnualLimit: i.monthly * 12 > TFSA_ANNUAL_LIMIT_2026,
  };
}

/** Rent vs buy over a horizon: 25-year amortization, CMHC premium under 20% down, 2%/yr upkeep + $150/mo, 6% on the down payment. */
export function rentVsBuy(i: { price: number; downPct: number; rate: number; rent: number; rentGrowthPct?: number; years: number }) {
  const down = i.price * (i.downPct / 100);
  const loan = i.price - down;
  const mr = i.rate / 100 / 12;
  const mortgage = payment(loan, mr, 300);
  const cmhc = i.downPct < 20 ? loan * (i.downPct < 5 ? 0.04 : i.downPct < 10 ? 0.031 : 0.028) : 0;
  const ownMonthly = mortgage + (i.price * 0.02) / 12 + 150;
  let rentTotal = 0;
  let rent = i.rent;
  for (let y = 0; y < i.years; y++) {
    rentTotal += rent * 12;
    rent *= 1 + (i.rentGrowthPct ?? 3) / 100;
  }
  const opportunity = down * (Math.pow(1.06, i.years) - 1);
  const ownTotal = ownMonthly * i.years * 12;
  return {
    mortgagePayment: round2(mortgage),
    ownMonthly: round2(ownMonthly),
    cmhcPremium: round2(cmhc),
    rentTotal: round2(rentTotal),
    downPaymentOpportunity: round2(opportunity),
    ownTotal: round2(ownTotal),
    buyWins: rentTotal + opportunity >= ownTotal,
  };
}

/** True car cost: 13% HST, fixed running costs, and the rule that a car should cost at most 15% of gross income. */
export const CAR_RUNNING_COSTS_PER_YEAR = 2200 + 1200 + 2400 + 300; // insurance, maintenance, fuel, registration

export function carCost(i: { price: number; down: number; rate: number; termMonths: number; annualIncome: number }) {
  const financed = i.price * 1.13 - i.down;
  const mr = i.rate / 100 / 12;
  const pay = payment(financed, mr, i.termMonths);
  const monthly = CAR_RUNNING_COSTS_PER_YEAR / 12 + pay;
  const ceiling = (i.annualIncome * 0.15) / 12;
  return {
    payment: round2(pay),
    totalInterest: round2(pay * i.termMonths + i.down - i.price),
    trueMonthly: round2(monthly),
    ceiling: round2(ceiling),
    fits: monthly <= ceiling,
    // The same payment into a TFSA at 6% over the loan term.
    invested: round2(pay * ((Math.pow(1.06, i.termMonths / 12) - 1) / (0.06 / 12))),
  };
}

export const CALCULATORS = {
  renewal: renewalCost,
  biweekly: acceleratedBiweekly,
  break: breakMortgage,
  rateblock: rateBlockShare,
  credit: creditTrap,
  budget: budget503020,
  tfsa: tfsaGrowth,
  rentvbuy: rentVsBuy,
  car: carCost,
} as const;
