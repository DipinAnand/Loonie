import { isEssential } from "./receipt.js";
import { cadenceSpacing, detectIncome, detectRecurring } from "./recurring.js";
import type { Cadence, RecurringSeries, Txn } from "./types.js";
import { addDays, round2, stableId, toDay } from "./util.js";

/** Recurring payments that are bills (not optional subscriptions), by descriptor, for when Plaid hasn't categorized. */
const BILL_PATTERN =
  /\b(wireless|mobile|mobility|telecom|internet|phone|hydro|electric|enbridge|gas|water|insurance|assurance|rogers|bell|telus|fido|koodo|virgin plus|videotron|freedom|shaw|cogeco|eastlink)\b/i;

export type BillKind = "bill" | "subscription" | "debt";

export interface Bill {
  /** Stable across scans so the user's settings stick. */
  id: string;
  merchantKey: string;
  name: string;
  kind: BillKind;
  cadence: Cadence;
  /** What the next charge is expected to be (the last one). */
  amount: number;
  /** Usual charge, for bills whose amount moves (utilities). */
  typicalAmount: number;
  nextDate: string;
  lastPaid: { date: string; amount: number };
  /** The last charge was noticeably different from before. */
  change: { from: number; to: number } | null;
}

export interface Payday {
  name: string;
  cadence: Cadence;
  amount: number;
  nextDate: string;
  lastDate: string;
}

/** What a scan learned about the user's bills and paydays. Sealed in the ledger; no balances. */
export interface BillPlan {
  /** Day of the scan that produced this plan: a bill is only "late" if the scan saw past its due date. */
  asOf: string;
  bills: Bill[];
  paydays: Payday[];
}

export function buildBillPlan(txns: Txn[], asOf: string): BillPlan {
  const settled = txns.filter((t) => !t.pending);
  const bills = detectRecurring(settled, asOf, { includeLoanPayments: true })
    .filter((s) => s.active)
    .map(toBill)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const paydays = detectIncome(settled, asOf).map((s) => ({
    name: s.displayName,
    cadence: s.cadence,
    amount: s.lastAmount,
    nextDate: s.nextExpectedDate,
    lastDate: s.lastDate,
  }));
  return { asOf, bills, paydays };
}

function toBill(s: RecurringSeries): Bill {
  const kind: BillKind =
    s.categoryPrimary === "LOAN_PAYMENTS" ? "debt" : isEssential(s) || BILL_PATTERN.test(s.merchantKey) ? "bill" : "subscription";
  let change: Bill["change"] = null;
  if (s.previousAmount !== null) change = { from: s.previousAmount, to: s.lastAmount };
  else if (Math.abs(s.lastAmount - s.medianAmount) > Math.max(5, s.medianAmount * 0.15)) change = { from: s.medianAmount, to: s.lastAmount };
  return {
    id: stableId("bill", s.merchantKey),
    merchantKey: s.merchantKey,
    name: s.displayName,
    kind,
    cadence: s.cadence,
    amount: s.lastAmount,
    typicalAmount: s.medianAmount,
    nextDate: s.nextExpectedDate,
    lastPaid: { date: s.lastDate, amount: s.lastAmount },
    change,
  };
}

export type BillStatus = "late" | "due_soon" | "upcoming";

const DUE_SOON_DAYS = 3;

/**
 * Where a bill stands today. "Late" means a scan ran past the due date (plus
 * the usual wobble) and the charge still hadn't shown up: worth checking the
 * payment went through. Without a newer scan we can't tell, so it stays due.
 */
export function billStatus(bill: Bill, plan: BillPlan, today: string): { status: BillStatus; inDays: number; lateDays: number } {
  const { tolerance } = cadenceSpacing(bill.cadence);
  const inDays = toDay(bill.nextDate) - toDay(today);
  const seenPast = toDay(plan.asOf) - toDay(bill.nextDate);
  if (seenPast > tolerance) return { status: "late", inDays, lateDays: seenPast };
  return { status: inDays <= DUE_SOON_DAYS ? "due_soon" : "upcoming", inDays, lateDays: 0 };
}

/** Each expected charge between `from` and `to` (inclusive). A bill already due but not yet seen counts once. */
export function occurrences(bill: Bill, from: string, to: string): string[] {
  const { days } = cadenceSpacing(bill.cadence);
  const out: string[] = [];
  for (let d = bill.nextDate, k = 0; d <= to && k < 60; d = addDays(d, days), k++) {
    if (d >= from || k === 0) out.push(d);
  }
  return out;
}

/** Next payday on or after `today`, rolling a stale schedule forward. */
export function nextPayday(plan: BillPlan, today: string): Payday | null {
  let best: Payday | null = null;
  for (const p of plan.paydays) {
    const { days } = cadenceSpacing(p.cadence);
    let d = p.nextDate;
    while (d < today) d = addDays(d, days);
    if (!best || d < best.nextDate) best = { ...p, nextDate: d };
  }
  return best;
}

export interface Coverage {
  status: "ok" | "tight" | "short" | "unknown";
  /** Last day counted: the day before the next payday, or two weeks out when no payday is known. */
  until: string;
  payday: { date: string; amount: number } | null;
  due: number;
  dueBills: { id: string; name: string; date: string; amount: number }[];
  /** Live balance from the bank. Never stored. */
  balance: number | null;
  /** Balance left after the bills above. */
  cushion: number | null;
}

const FALLBACK_WINDOW_DAYS = 14;

/** Will the money in the account cover the bills due before the next paycheque? */
export function coverage(plan: BillPlan, today: string, balance: number | null, hidden: Set<string> = new Set()): Coverage {
  const payday = nextPayday(plan, today);
  const until = payday && payday.nextDate > today ? addDays(payday.nextDate, -1) : addDays(today, FALLBACK_WINDOW_DAYS);
  const dueBills = plan.bills
    .filter((b) => !hidden.has(b.id))
    .flatMap((b) => occurrences(b, today, until).map((date) => ({ id: b.id, name: b.name, date, amount: b.amount })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const due = round2(dueBills.reduce((s, b) => s + b.amount, 0));
  const cushion = balance === null ? null : round2(balance - due);
  const status =
    cushion === null ? "unknown" : cushion < 0 ? "short" : cushion < Math.max(100, due * 0.1) ? "tight" : "ok";
  return {
    status,
    until,
    payday: payday ? { date: payday.nextDate, amount: payday.amount } : null,
    due,
    dueBills,
    balance,
    cushion,
  };
}
