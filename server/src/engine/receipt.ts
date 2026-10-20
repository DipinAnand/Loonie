import { adviceFor, ENGINE_VERSION, FX_SPREAD, NSF_CAP, NSF_CAP_DATE } from "./advice.js";
import { classifyFee, FEE_RULES } from "./fees.js";
import { detectRecurring, perYear } from "./recurring.js";
import type { Leak, LeakMeta, LeakReceipt, RecurringSeries, Txn, Verdict } from "./types.js";
import { isForeignPurchase, merchantKey, round2, stableId, toDay } from "./util.js";

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
/** A credit cancels a matching debit posted up to 2 days after it or 120 days before it. */
const REFUND_BEFORE_DAYS = 2;
const REFUND_AFTER_DAYS = 120;
/** Income and transfers are never refunds. */
const REFUND_EXEMPT_PRIMARY = new Set(["INCOME", "TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"]);
const REFUND_WORDS = /\b(refund|reversal|revers\w*|rebate|credit|adjustment|waiv\w*|rembours\w*|annul\w*|renvers\w*|remise|return(ed)?)\b/gi;

const money = (n: number) => `$${n.toFixed(2)}`;

export function buildLeakReceipt(
  txns: Txn[],
  opts: { asOf?: string; verdicts?: Map<string, Verdict> } = {},
): LeakReceipt {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  // A charge that was refunded or reversed is not money paid.
  const settled = netRefunds(txns.filter((t) => !t.pending));
  const dates = settled.map((t) => t.date).sort();
  const windowStart = dates[0] ?? null;
  const windowEnd = dates[dates.length - 1] ?? null;
  const windowDays = windowStart ? toDay(asOf) - toDay(windowStart) + 1 : 0;

  const recurring = detectRecurring(settled, asOf);
  const leaks: Leak[] = [
    ...feeLeaks(settled, asOf, windowDays),
    ...fxSpreadLeaks(settled, asOf, windowDays),
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

/** Yearly total, skipping dismissed leaks. Suspicious charges are alerts, not leaks, so they never count. */
export function totalImpact(leaks: Pick<Leak & { verdict: Verdict | null }, "kind" | "merchantKey" | "annualImpact" | "verdict">[]): number {
  const counted = leaks.filter((l) => l.verdict !== "dismissed" && l.kind !== "suspicious");
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
    // NSF fees above the legal cap are money the bank owes back, not just a habit to fix.
    const type = rule.type === "nsf" && t.date >= NSF_CAP_DATE && t.amount > NSF_CAP + 0.005 ? "nsf_over_cap" : rule.type;
    byType.set(type, [...(byType.get(type) ?? []), t]);
  }

  const observed = Math.max(Math.min(windowDays, FEE_LOOKBACK_DAYS), MIN_ANNUALIZE_WINDOW);
  return [...byType].map(([type, list]) => {
    const sum = list.reduce((s, t) => s + t.amount, 0);
    const last = list[list.length - 1];
    if (type === "nsf_over_cap") {
      const excess = round2(list.reduce((s, t) => s + (t.amount - NSF_CAP), 0));
      return {
        id: stableId("fee", type),
        kind: "fee" as const,
        title: "NSF fees above the $10 cap",
        detail: `${list.length} NSF fee${list.length === 1 ? "" : "s"} totalling ${money(sum)} since March 12, 2026. ${money(excess)} is above the cap.`,
        merchantKey: type,
        annualImpact: excess,
        txnIds: list.map((t) => t.id),
        features: { feeType: type, count: list.length, observedSum: round2(sum), observedDays: observed },
        meta: withAdvice({ date: last.date, lastAmount: round2(last.amount) }, { kind: "fee", key: type, displayName: "NSF", amount: last.amount, count: list.length, lastDate: last.date, excess }),
      };
    }
    const rule = FEE_RULES.find((r) => r.type === type)!;
    const weakMatch = list.every((t) => !rule.patterns.some((p) => p.test(t.name)) && !rule.categories.includes(t.categoryDetailed ?? ""));
    const annual = round2((sum * 365) / observed);
    const preCap = type === "nsf" && list.some((t) => t.date < NSF_CAP_DATE) ? ", before the $10 cap" : "";
    return {
      id: stableId("fee", type),
      kind: "fee" as const,
      title: rule.label,
      detail: `${list.length} charge${list.length === 1 ? "" : "s"} totalling ${money(sum)} in the last ${observed} days${preCap}`,
      merchantKey: type,
      annualImpact: annual,
      txnIds: list.map((t) => t.id),
      features: { feeType: type, count: list.length, observedSum: round2(sum), observedDays: observed },
      meta: withAdvice(
        { date: last.date, lastAmount: round2(last.amount) },
        { kind: "fee", key: type, displayName: rule.label, amount: last.amount, count: list.length, firstDate: list[0].date, lastDate: last.date, weakMatch },
      ),
    };
  });
}

/**
 * Cards rarely show the currency markup as a line: it is inside the exchange
 * rate. Estimated at 2.5% of foreign-currency purchases, unless the statement
 * already shows FX fee lines (then the fee rule counts them).
 */
function fxSpreadLeaks(txns: Txn[], asOf: string, windowDays: number): Leak[] {
  const cutoff = toDay(asOf) - FEE_LOOKBACK_DAYS;
  const recent = txns.filter((t) => toDay(t.date) >= cutoff);
  if (recent.some((t) => classifyFee(t)?.type === "fx")) return [];
  const counts = new Map<string, number>();
  for (const t of recent) if (t.currency) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  const home = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CAD";
  const foreign = recent.filter(
    (t) => t.amount > 0 && !classifyFee(t) && !(t.categoryPrimary && REFUND_EXEMPT_PRIMARY.has(t.categoryPrimary)) && isForeignPurchase(t, home),
  );
  if (foreign.length === 0) return [];
  const spend = round2(foreign.reduce((s, t) => s + t.amount, 0));
  const observed = Math.max(Math.min(windowDays, FEE_LOOKBACK_DAYS), MIN_ANNUALIZE_WINDOW);
  const cost = round2(spend * FX_SPREAD);
  const last = foreign[foreign.length - 1];
  return [
    {
      id: stableId("fee", "fx_spread"),
      kind: "fee",
      title: "Foreign transaction spread",
      detail: `About ${(FX_SPREAD * 100).toFixed(1)}% on ${money(spend)} of foreign-currency spend (${foreign.length} purchase${foreign.length === 1 ? "" : "s"})`,
      merchantKey: "fx_spread",
      annualImpact: round2((cost * 365) / observed),
      txnIds: foreign.map((t) => t.id),
      features: { feeType: "fx_spread", count: foreign.length, observedSum: spend, observedDays: observed },
      meta: withAdvice({ date: last.date }, { kind: "fee", key: "fx_spread", displayName: "FX", amount: cost, count: foreign.length }),
    },
  ];
}

/**
 * Pairs every credit with the debit it cancels (same amount, same merchant or
 * fee type, the debit at most 2 days after or 120 days before) and drops both.
 */
export function netRefunds(txns: Txn[]): Txn[] {
  const keyOf = (t: Txn) => {
    const fee = classifyFee({ ...t, amount: Math.abs(t.amount) });
    if (fee) return `fee:${fee.type === "nsf" || fee.type === "overdraft" ? "nsf" : fee.type}`;
    return merchantKey(t.name.replace(REFUND_WORDS, " "), t.merchantName?.replace(REFUND_WORDS, " "));
  };
  const credits = txns.filter((t) => t.amount < 0 && !(t.categoryPrimary && REFUND_EXEMPT_PRIMARY.has(t.categoryPrimary)));
  if (credits.length === 0) return txns;
  const debits = txns.filter((t) => t.amount > 0);
  const debitKeys = new Map(debits.map((t) => [t.id, keyOf(t)]));
  const dropped = new Set<string>();
  for (const c of credits) {
    const key = keyOf(c);
    const day = toDay(c.date);
    let best: Txn | null = null;
    for (const d of debits) {
      if (dropped.has(d.id) || Math.abs(d.amount + c.amount) > 0.005 || debitKeys.get(d.id) !== key) continue;
      const gap = day - toDay(d.date);
      if (gap < -REFUND_BEFORE_DAYS || gap > REFUND_AFTER_DAYS) continue;
      if (!best || Math.abs(gap) < Math.abs(day - toDay(best.date))) best = d;
    }
    if (best) dropped.add(best.id).add(c.id);
  }
  return dropped.size ? txns.filter((t) => !dropped.has(t.id)) : txns;
}

function withAdvice(meta: LeakMeta, input: Parameters<typeof adviceFor>[0]): LeakMeta {
  const a = adviceFor(input);
  return { ...meta, confidence: a.confidence, ruleVersion: ENGINE_VERSION, fix: a.fix, ...(a.script ? { script: a.script } : {}) };
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
      meta: withAdvice(
        { cadence: s.cadence, lastAmount: s.lastAmount, nextExpectedDate: s.nextExpectedDate },
        { kind: "subscription", key: s.merchantKey, displayName: s.displayName, amount: s.lastAmount, count: s.count, firstDate: s.firstDate, lastDate: s.lastDate },
      ),
    }));
}

export function isEssential(s: Pick<RecurringSeries, "categoryPrimary" | "merchantKey">): boolean {
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
      detail: `${money(s.previousAmount)} → ${money(s.lastAmount)} (+${((delta / s.previousAmount) * 100).toFixed(0)}%) since ${s.stepDate}. ${s.chargesSinceStep} charge${s.chargesSinceStep === 1 ? "" : "s"} at the new price: ${money(delta * (s.chargesSinceStep ?? 1))} extra so far`,
      merchantKey: s.merchantKey,
      annualImpact: round2(delta * perYear(s.cadence)),
      txnIds: s.txnIds.slice(-2),
      features: { cadence: s.cadence, previousAmount: s.previousAmount, lastAmount: s.lastAmount, delta: round2(delta), chargesSinceStep: s.chargesSinceStep },
      meta: withAdvice(
        { cadence: s.cadence, lastAmount: s.lastAmount, previousAmount: s.previousAmount, date: s.lastDate },
        { kind: "price_hike", key: s.merchantKey, displayName: s.displayName, amount: s.lastAmount, count: s.count, firstDate: s.firstDate, previousAmount: s.previousAmount },
      ),
    });
  }
  return leaks;
}

function duplicateLeaks(txns: Txn[]): Leak[] {
  const leaks: Leak[] = [];
  const sorted = [...txns]
    .filter((t) => t.amount >= DUPLICATE_MIN_AMOUNT && !classifyFee(t) && !(t.categoryPrimary && DUPLICATE_EXEMPT_PRIMARY.has(t.categoryPrimary)))
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
        meta: withAdvice(
          { date: b.date, lastAmount: round2(b.amount) },
          { kind: "duplicate", key: keyA, displayName: b.merchantName?.trim() || a.name, amount: b.amount, count: 2, lastDate: b.date },
        ),
      });
      break;
    }
  }
  return leaks;
}
