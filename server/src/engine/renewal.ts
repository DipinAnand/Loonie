import { acceleratedBiweekly, renewalCost } from "../tools/calc.js";
import { addDays, toDay } from "./util.js";

/**
 * Mortgage renewal countdown. Lenders only have to send the renewal statement
 * 21 days before the term ends; Looni starts the clock at 180.
 */
export const MILESTONES = [
  { days: 180, id: "rate_hold", label: "Rate hold opens", action: "Rate hold window is open at most lenders. Ask for a 120-day hold." },
  { days: 120, id: "quotes", label: "Get quotes", action: "Get two written quotes and a rate hold now." },
  { days: 90, id: "retention", label: "Retention call", action: "Retention call time. Share your competing quote." },
  { days: 21, id: "statement", label: "Statement due", action: "Inside the 21-day window. Compare the statement against your quotes today." },
] as const;

export type MilestoneId = (typeof MILESTONES)[number]["id"];

export interface RenewalInput {
  maturityDate: string; // YYYY-MM-DD
  balance?: number;
  letterRate?: number;
  quoteRate?: number;
  amortizationYears?: number;
}

export function renewalCountdown(input: RenewalInput, today: string) {
  const daysLeft = toDay(input.maturityDate) - toDay(today);
  const milestones = MILESTONES.map((m) => ({
    id: m.id,
    days: m.days,
    label: m.label,
    date: addDays(input.maturityDate, -m.days),
    status: daysLeft < m.days ? ("passed" as const) : ("upcoming" as const),
  }));
  // The milestone the user is inside now: the smallest one already reached.
  const current = [...MILESTONES].reverse().find((m) => daysLeft <= m.days) ?? null;
  const action =
    daysLeft <= 0
      ? "Your term has ended. If you haven't signed, you may be on an open rate: call your lender today."
      : current
        ? current.action
        : "Too early for a rate hold. Looni will remind you at 180 days.";
  const band = daysLeft <= 21 ? "red" : daysLeft < 60 ? "amber" : "calm";
  // Bar fills from 180 days (empty) to 21 days (full).
  const progress = Math.min(1, Math.max(0, 1 - (Math.min(180, daysLeft) - 21) / 159));

  const costs =
    input.balance && input.letterRate && input.quoteRate
      ? renewalCost({ balance: input.balance, letterRate: input.letterRate, quoteRate: input.quoteRate, amortizationYears: input.amortizationYears })
      : null;
  const biweekly =
    input.balance && (input.quoteRate || input.letterRate)
      ? acceleratedBiweekly({ balance: input.balance, rate: (input.quoteRate || input.letterRate)!, amortizationYears: input.amortizationYears })
      : null;

  return {
    maturityDate: input.maturityDate,
    daysLeft,
    currentMilestone: current?.id ?? null,
    action,
    band,
    progress: Math.round(progress * 1000) / 1000,
    milestones,
    costs,
    biweekly,
  };
}

/** Which milestone alert is due today, if any. Fires once per milestone, even if the exact day was missed. */
export function dueMilestone(maturityDate: string, today: string): (typeof MILESTONES)[number] | null {
  const daysLeft = toDay(maturityDate) - toDay(today);
  if (daysLeft < 0) return null;
  return [...MILESTONES].reverse().find((m) => daysLeft <= m.days) ?? null;
}

export function validRenewal(body: unknown): RenewalInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.maturityDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.maturityDate) || Number.isNaN(Date.parse(b.maturityDate))) return null;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);
  return {
    maturityDate: b.maturityDate,
    balance: num(b.balance, 10_000_000),
    letterRate: num(b.letterRate, 25),
    quoteRate: num(b.quoteRate, 25),
    amortizationYears: num(b.amortizationYears, 40),
  };
}

/** Calendar quarter a mortgage renews in, e.g. "2027-Q1" (Rate Block pools are per province and quarter). */
export function renewalQuarter(maturityDate: string): string {
  return `${maturityDate.slice(0, 4)}-Q${Math.floor((+maturityDate.slice(5, 7) - 1) / 3) + 1}`;
}
