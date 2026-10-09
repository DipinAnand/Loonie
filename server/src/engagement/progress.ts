import { round2 } from "../engine/util.js";
import type { LedgerLeak } from "../ledger.js";
import { daysBetween, isoWeek, previousWeek } from "./time.js";

/** Money actually kept so far: each plugged leak's yearly cost, pro-rated since it stopped. */
export function savedToDate(resolved: LedgerLeak[], today: string): number {
  return round2(
    resolved
      .filter((l) => l.verdict === "confirmed" && l.resolvedAt && l.kind !== "duplicate" && l.kind !== "suspicious")
      .reduce((s, l) => s + (l.annualImpact * Math.max(0, daysBetween(l.resolvedAt!, today))) / 365, 0),
  );
}

export const LEVELS = [
  { level: "egg", min: 0 },
  { level: "chick", min: 100 },
  { level: "fledgling", min: 500 },
  { level: "loon", min: 1000 },
] as const;
export type Level = (typeof LEVELS)[number]["level"];

/** 1 loonie per dollar saved so far, plus quest rewards. */
export function levelFor(loonies: number): { level: Level; next: { level: Level; at: number } | null } {
  let i = 0;
  while (i + 1 < LEVELS.length && loonies >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1];
  return { level: LEVELS[i].level, next: next ? { level: next.level, at: next.min } : null };
}

export interface Streaks {
  /** Days since the last bank fee (null when Looni has never seen one). */
  feeFreeDays: number | null;
  /** Whole months since the last NSF fee (null when never). */
  nsfFreeMonths: number | null;
  /** Consecutive completed weekly Leak Hunts. */
  huntWeeks: number;
}

/** Outcome streaks: they break only when money actually leaks, never for not opening the app. */
export function outcomeStreaks(all: LedgerLeak[], today: string): Omit<Streaks, "huntWeeks"> {
  const fees = all.filter((l) => l.kind === "fee");
  const lastFee = fees.flatMap((l) => l.history.map((h) => h.date)).sort().at(-1);
  const nsf = fees.filter((l) => l.merchantKey === "nsf" || l.merchantKey === "overdraft");
  const lastNsf = nsf.flatMap((l) => l.history.map((h) => h.date)).sort().at(-1);
  return {
    feeFreeDays: lastFee ? Math.max(0, daysBetween(lastFee, today)) : null,
    nsfFreeMonths: lastNsf ? Math.floor(Math.max(0, daysBetween(lastNsf, today)) / 30) : null,
  };
}

/**
 * Consecutive completed hunt weeks, counting back from this week (or last week
 * if this one isn't done yet). One missed week per calendar month is forgiven.
 */
export function huntStreak(completed: Set<string>, today: string): number {
  let streak = 0;
  let cursorDate = today;
  let week = isoWeek(today);
  const freezesUsed = new Set<string>();

  if (!completed.has(week)) {
    const prev = previousWeek(cursorDate);
    week = prev.week;
    cursorDate = prev.monday;
  }
  for (let guard = 0; guard < 520; guard++) {
    if (completed.has(week)) {
      streak++;
    } else {
      const month = cursorDate.slice(0, 7);
      if (streak === 0 || freezesUsed.has(month)) break;
      freezesUsed.add(month);
    }
    const prev = previousWeek(cursorDate);
    week = prev.week;
    cursorDate = prev.monday;
  }
  return streak;
}
