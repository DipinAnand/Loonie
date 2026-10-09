import type { Leak, Txn } from "./types.js";
import { merchantKey, round2, stableId, toDay } from "./util.js";

/**
 * Suspicious-charge rules. Plaid data arrives about daily, so this is a
 * "second pair of eyes across all your banks", not real-time fraud blocking:
 * the patterns below are ones banks often let through and that are still
 * worth flagging a day later.
 */
export type SuspiciousRule = "card_test" | "large_new_merchant" | "foreign_new_merchant" | "zombie_subscription";

export interface AnomalyOptions {
  asOf: string;
  /** How far back to flag. Use a shorter window on the first scan so old history doesn't flood the user. */
  lookbackDays: number;
  /** Merchants the user said they don't need, with the date they said it. */
  cancelledMerchants?: Map<string, string>;
}

const MICRO_MAX = 2;
const TINY_MAX = 1;
const MICRO_CLUSTER_DAYS = 3;
const LARGE_MIN = 100;
const ZOMBIE_GRACE_DAYS = 3;
// Small new-merchant charges here are everyday life (a new café, a transit fare), not card testing.
const EVERYDAY_PRIMARY = new Set(["FOOD_AND_DRINK", "TRANSPORTATION"]);

const LABEL: Record<SuspiciousRule, string> = {
  card_test: "Tiny charge from a merchant you've never used. Fraudsters test stolen cards this way before a big purchase.",
  large_new_merchant: "Unusually large first charge from a merchant you've never paid before.",
  foreign_new_merchant: "Foreign-currency charge from a merchant you've never paid before.",
  zombie_subscription: "Still charging after you told Looni you don't need it. Make sure it's really cancelled.",
};

const money = (n: number) => `$${n.toFixed(2)}`;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function detectSuspicious(txns: Txn[], opts: AnomalyOptions): Leak[] {
  const today = toDay(opts.asOf);
  const cutoff = today - opts.lookbackDays;
  const outflows = txns.filter((t) => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const keyOf = new Map(outflows.map((t) => [t.id, merchantKey(t.name, t.merchantName)]));

  // A merchant is "known" if the user paid it before the window being checked.
  const known = new Set(outflows.filter((t) => toDay(t.date) < cutoff).map((t) => keyOf.get(t.id)!));
  const firstSeen = new Map<string, number>();
  for (const t of outflows) if (!firstSeen.has(keyOf.get(t.id)!)) firstSeen.set(keyOf.get(t.id)!, toDay(t.date));
  const isNew = (t: Txn) => !known.has(keyOf.get(t.id)!) && firstSeen.get(keyOf.get(t.id)!) === toDay(t.date);

  const history = outflows.filter((t) => toDay(t.date) < cutoff).map((t) => t.amount);
  const largeThreshold = Math.max(LARGE_MIN, percentile(history, 0.95));
  const currencies = new Map<string, number>();
  for (const t of txns) if (t.currency) currencies.set(t.currency, (currencies.get(t.currency) ?? 0) + 1);
  const home = [...currencies].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const recent = outflows.filter((t) => toDay(t.date) >= cutoff && toDay(t.date) <= today && !t.pending);
  const microNew = recent.filter((t) => t.amount <= MICRO_MAX && isNew(t));

  const flagged = new Map<string, { t: Txn; rule: SuspiciousRule }>();
  const flag = (t: Txn, rule: SuspiciousRule) => {
    if (!flagged.has(t.id)) flagged.set(t.id, { t, rule });
  };

  for (const t of recent) {
    const key = keyOf.get(t.id)!;
    const everyday = !!t.categoryPrimary && EVERYDAY_PRIMARY.has(t.categoryPrimary);

    const cancelledOn = opts.cancelledMerchants?.get(key);
    if (cancelledOn && toDay(t.date) > toDay(cancelledOn) + ZOMBIE_GRACE_DAYS) flag(t, "zombie_subscription");

    if (t.amount <= MICRO_MAX && isNew(t)) {
      const clustered = microNew.some((o) => o.id !== t.id && Math.abs(toDay(o.date) - toDay(t.date)) <= MICRO_CLUSTER_DAYS);
      if (clustered || (t.amount <= TINY_MAX && !everyday)) flag(t, "card_test");
    }
    if (isNew(t) && t.amount > largeThreshold) flag(t, "large_new_merchant");
    if (isNew(t) && home && t.currency && t.currency !== home) flag(t, "foreign_new_merchant");
  }

  return [...flagged.values()].map(({ t, rule }) => ({
    id: stableId("suspicious", t.id),
    kind: "suspicious" as const,
    title: `${money(t.amount)} at ${t.merchantName?.trim() || t.name}`,
    detail: LABEL[rule],
    merchantKey: keyOf.get(t.id)!,
    annualImpact: round2(t.amount),
    txnIds: [t.id],
    features: { rule, amount: round2(t.amount), newMerchant: isNew(t), foreign: !!(home && t.currency && t.currency !== home) },
    meta: { rule, date: t.date },
  }));
}

/** What to do after the user taps "Not me". Generic on purpose: Looni never touches the account. */
export const NOT_ME_STEPS = [
  "Call the number on the back of your card (or in your bank's app) and say you don't recognise the charge.",
  "Lock or freeze the card in your bank's app so nothing else goes through.",
  "Ask the bank to dispute the charge and send you a new card.",
  "If you shared any details with someone, report it to the Canadian Anti-Fraud Centre: 1-888-495-8501.",
];
