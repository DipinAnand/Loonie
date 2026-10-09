import { classifyFee } from "./fees.js";
import type { Cadence, RecurringSeries, Txn } from "./types.js";
import { addDays, median, merchantKey, round2, titleCase, toDay } from "./util.js";

const CADENCES: { cadence: Cadence; days: number; tolerance: number; perYear: number }[] = [
  { cadence: "weekly", days: 7, tolerance: 1, perYear: 52 },
  { cadence: "biweekly", days: 14, tolerance: 2, perYear: 26 },
  { cadence: "monthly", days: 30.4, tolerance: 4, perYear: 12 },
  { cadence: "quarterly", days: 91, tolerance: 7, perYear: 4 },
  { cadence: "annual", days: 365, tolerance: 12, perYear: 1 },
];

export function perYear(cadence: Cadence): number {
  return CADENCES.find((c) => c.cadence === cadence)!.perYear;
}

/** Categories that are recurring but are never "leaks" (money moving between your own accounts, income, debt principal). */
const NON_SPEND_PRIMARY = new Set(["INCOME", "TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "BANK_FEES"]);

/**
 * Finds recurring outflows: groups by normalized merchant, then checks that the
 * gaps between charges fit one cadence and the amounts are stable enough to be
 * the same bill (subscriptions drift; groceries don't repeat on a schedule).
 */
export function detectRecurring(txns: Txn[], asOf: string): RecurringSeries[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.amount <= 0 || t.pending) continue;
    if (t.categoryPrimary && NON_SPEND_PRIMARY.has(t.categoryPrimary)) continue;
    if (classifyFee(t)) continue; // fees get their own rule
    const key = merchantKey(t.name, t.merchantName);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const series: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    const s = analyzeGroup(key, list, asOf);
    if (s) series.push(s);
  }
  return series.sort((a, b) => b.annualCost - a.annualCost);
}

function analyzeGroup(key: string, list: Txn[], asOf: string): RecurringSeries | null {
  // Same-day/same-amount duplicates are handled by the duplicate rule; keep one per day here.
  const byDay = new Map<string, Txn>();
  for (const t of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!byDay.has(t.date)) byDay.set(t.date, t);
  }
  const txns = [...byDay.values()];

  const gaps: number[] = [];
  for (let i = 1; i < txns.length; i++) gaps.push(toDay(txns[i].date) - toDay(txns[i - 1].date));
  if (gaps.length === 0) return null;

  const medGap = median(gaps);
  const match = CADENCES.find((c) => Math.abs(medGap - c.days) <= c.tolerance);
  if (!match) return null;

  // Annual needs 2 charges; everything else needs 3 so two coincidences don't make a subscription.
  const minCount = match.cadence === "annual" ? 2 : 3;
  if (txns.length < minCount) return null;

  const onCadence = gaps.filter((g) => Math.abs(g - match.days) <= match.tolerance * 1.5).length;
  if (onCadence / gaps.length < 0.66) return null;

  const amounts = txns.map((t) => t.amount);
  const med = median(amounts);
  // Variable-amount bills (utilities) still count, but wildly varying spend does not.
  const stable = amounts.filter((a) => Math.abs(a - med) <= Math.max(med * 0.35, 2)).length;
  if (stable / amounts.length < 0.66) return null;

  const last = txns[txns.length - 1];
  const intervalDays = Math.round(match.days);
  const nextExpectedDate = addDays(last.date, intervalDays);
  const active = toDay(asOf) - toDay(last.date) <= intervalDays + match.tolerance * 2;

  return {
    merchantKey: key,
    displayName: last.merchantName?.trim() || titleCase(key),
    cadence: match.cadence,
    count: txns.length,
    medianAmount: round2(med),
    lastAmount: round2(last.amount),
    previousAmount: priorPriceLevel(amounts),
    firstDate: txns[0].date,
    lastDate: last.date,
    nextExpectedDate,
    active,
    annualCost: active ? round2(last.amount * match.perYear) : 0,
    categoryPrimary: last.categoryPrimary ?? null,
    txnIds: list.map((t) => t.id),
  };
}

/**
 * If the charge recently stepped to a new level (last 1-3 charges at the new
 * price, at least 2 steady charges before it), returns the old price; else null.
 * A bill that just wobbles (utilities) has no steady prior level, so no step.
 */
function priorPriceLevel(amounts: number[]): number | null {
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, b * 0.01);
  const last = amounts[amounts.length - 1];
  let i = amounts.length - 1;
  while (i > 0 && same(amounts[i - 1], last)) i--;
  const atNewLevel = amounts.length - i;
  const before = amounts.slice(0, i);
  if (before.length < 2 || atNewLevel > 3) return null;
  const old = before[before.length - 1];
  if (!same(before[before.length - 2], old)) return null;
  return round2(old);
}
