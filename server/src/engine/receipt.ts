import { classifyFee, FEE_RULES } from "./fees.js";
import { detectRecurring, perYear } from "./recurring.js";
import type { Leak, LeakReceipt, RecurringSeries, Txn, Verdict } from "./types.js";
import { merchantKey, round2, stableId, toDay } from "./util.js";

/** Recurring, but essential: never flagged as a subscription leak. */
const ESSENTIAL_PRIMARY = new Set(["RENT_AND_UTILITIES", "GOVERNMENT_AND_NON_PROFIT", "MEDICAL", "LOAN_PAYMENTS"]);
/** Descriptor fallback for when Plaid hasn't categorized (e.g. sandbox custom data). */
const ESSENTIAL_PATTERN = /\b(rent|loyer|mortgage|hypoth[eè]que|hydro|insurance|assurance|property tax|condo fees?|daycare|tuition)\b/i;
/** Same-price repeats here are normal (two coffees, two transit fares). */
const DUPLICATE_EXEMPT_PRIMARY = new Set(["FOOD_AND_DRINK", "TRANSPORTATION", "TRANSFER_OUT", "TRANSFER_IN", "INCOME"]);

const PRICE_HIKE_MIN_PCT = 0.03;
const PRICE_HIKE_MIN_ABS = 0.5;
const DUPLICATE_WINDOW_DAYS = 2;
const DUPLICATE_MIN_AMOUNT = 5;
const FEE_LOOKBACK_DAYS = 365;
const MIN_ANNUALIZE_WINDOW = 30;

const money = (n: number) => `$${n.toFixed(2)}`;

export function buildLeakReceipt(
  txns: Txn[],
  opts: { asOf?: string; verdicts?: Map<string, Verdict> } = {},
): LeakReceipt {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const settled = txns.filter((t) => !t.pending);
  const dates = settled.map((t) => t.date).sort();
  const windowStart = dates[0] ?? null;
  const windowEnd = dates[dates.length - 1] ?? null;
  const windowDays = windowStart ? toDay(asOf) - toDay(windowStart) + 1 : 0;

  const recurring = detectRecurring(settled, asOf);
  const leaks: Leak[] = [
    ...feeLeaks(settled, asOf, windowDays),
    ...subscriptionLeaks(recurring),
    ...priceHikeLeaks(recurring),
    ...duplicateLeaks(settled),
  ].sort((a, b) => b.annualImpact - a.annualImpact);

  const verdicts = opts.verdicts ?? new Map();
  const withVerdicts = leaks.map((l) => ({ ...l, verdict: verdicts.get(l.id) ?? null }));

  return {
    generatedAt: new Date().toISOString(),
    windowStart,
    windowEnd,
    windowDays,
    transactionCount: settled.length,
    totalAnnualImpact: totalImpact(withVerdicts),
    leaks: withVerdicts,
    recurring,
  };
}

/** Yearly total, skipping dismissed leaks. */
export function totalImpact(leaks: Pick<Leak & { verdict: Verdict | null }, "kind" | "merchantKey" | "annualImpact" | "verdict">[]): number {
  const counted = leaks.filter((l) => l.verdict !== "dismissed");
  // A price hike is already inside its subscription's annual cost; only count it on its own once the user keeps the subscription.
  const liveSubs = new Set(counted.filter((l) => l.kind === "subscription").map((l) => l.merchantKey));
  return round2(
    counted.filter((l) => !(l.kind === "price_hike" && liveSubs.has(l.merchantKey))).reduce((s, l) => s + l.annualImpact, 0),
  );
}

function feeLeaks(txns: Txn[], asOf: string, windowDays: number): Leak[] {
  const cutoff = toDay(asOf) - FEE_LOOKBACK_DAYS;
  const byType = new Map<string, Txn[]>();
  for (const t of txns) {
    if (toDay(t.date) < cutoff) continue;
    const rule = classifyFee(t);
    if (!rule) continue;
    byType.set(rule.type, [...(byType.get(rule.type) ?? []), t]);
  }

  const observed = Math.max(Math.min(windowDays, FEE_LOOKBACK_DAYS), MIN_ANNUALIZE_WINDOW);
  return [...byType].map(([type, list]) => {
    const rule = FEE_RULES.find((r) => r.type === type)!;
    const sum = list.reduce((s, t) => s + t.amount, 0);
    const annual = round2((sum * 365) / observed);
    return {
      id: stableId("fee", type),
      kind: "fee" as const,
      title: rule.label,
      detail: `${list.length} charge${list.length === 1 ? "" : "s"} totalling ${money(sum)} in the last ${observed} days`,
      merchantKey: type,
      annualImpact: annual,
      txnIds: list.map((t) => t.id),
      features: { feeType: type, count: list.length, observedSum: round2(sum), observedDays: observed },
    };
  });
}

function subscriptionLeaks(recurring: RecurringSeries[]): Leak[] {
  return recurring
    .filter((s) => s.active && !isEssential(s))
    .map((s) => ({
      id: stableId("subscription", s.merchantKey),
      kind: "subscription" as const,
      title: `${s.displayName} (${s.cadence})`,
      detail: `${money(s.lastAmount)} ${s.cadence}, ${s.count} charges since ${s.firstDate}. Next around ${s.nextExpectedDate}. Still using it?`,
      merchantKey: s.merchantKey,
      annualImpact: s.annualCost,
      txnIds: s.txnIds,
      features: {
        cadence: s.cadence,
        count: s.count,
        lastAmount: s.lastAmount,
        medianAmount: s.medianAmount,
        category: s.categoryPrimary,
      },
    }));
}

function isEssential(s: RecurringSeries): boolean {
  return (s.categoryPrimary !== null && ESSENTIAL_PRIMARY.has(s.categoryPrimary)) || ESSENTIAL_PATTERN.test(s.merchantKey);
}

function priceHikeLeaks(recurring: RecurringSeries[]): Leak[] {
  const leaks: Leak[] = [];
  for (const s of recurring) {
    if (!s.active || s.previousAmount === null) continue;
    const delta = s.lastAmount - s.previousAmount;
    if (delta < PRICE_HIKE_MIN_ABS || delta / s.previousAmount < PRICE_HIKE_MIN_PCT) continue;
    leaks.push({
      id: stableId("price_hike", s.merchantKey, String(s.previousAmount), String(s.lastAmount)),
      kind: "price_hike",
      title: `${s.displayName} raised its price`,
      detail: `${money(s.previousAmount)} → ${money(s.lastAmount)} (+${((delta / s.previousAmount) * 100).toFixed(0)}%) on ${s.lastDate}`,
      merchantKey: s.merchantKey,
      annualImpact: round2(delta * perYear(s.cadence)),
      txnIds: s.txnIds.slice(-2),
      features: { cadence: s.cadence, previousAmount: s.previousAmount, lastAmount: s.lastAmount, delta: round2(delta) },
    });
  }
  return leaks;
}

function duplicateLeaks(txns: Txn[]): Leak[] {
  const leaks: Leak[] = [];
  const sorted = [...txns]
    .filter((t) => t.amount >= DUPLICATE_MIN_AMOUNT && !(t.categoryPrimary && DUPLICATE_EXEMPT_PRIMARY.has(t.categoryPrimary)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (used.has(a.id)) continue;
    const keyA = merchantKey(a.name, a.merchantName);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const gap = toDay(b.date) - toDay(a.date);
      if (gap > DUPLICATE_WINDOW_DAYS) break;
      if (used.has(b.id) || Math.abs(a.amount - b.amount) > 0.005) continue;
      if (merchantKey(b.name, b.merchantName) !== keyA) continue;
      used.add(a.id).add(b.id);
      leaks.push({
        id: stableId("duplicate", a.id, b.id),
        kind: "duplicate",
        title: `Possible double charge: ${b.merchantName?.trim() || a.name}`,
        detail: `${money(a.amount)} on ${a.date} and again on ${b.date}. Worth asking for a refund.`,
        merchantKey: keyA,
        annualImpact: round2(b.amount),
        txnIds: [a.id, b.id],
        features: { amount: round2(a.amount), gapDays: gap, sameAccount: a.accountId === b.accountId },
      });
      break;
    }
  }
  return leaks;
}
