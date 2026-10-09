import { completedHuntWeeks, completeHunt, getHunt, insertHunt, type UserRow } from "../db.js";
import { type LedgerLeak, readReceipt } from "../ledger.js";
import { huntStreak } from "./progress.js";
import { isoWeek } from "./time.js";

export const HUNT_SIZE = 3;

export interface Hunt {
  week: string;
  cards: LedgerLeak[];
  total: number;
  remaining: number;
  completed: boolean;
  streak: number;
}

/** Biggest unreviewed money first; suspicious charges go to the alert inbox, not the game. */
export function pickHuntCards(open: LedgerLeak[]): LedgerLeak[] {
  return open
    .filter((l) => l.verdict === null && l.kind !== "suspicious")
    .sort((a, b) => b.annualImpact - a.annualImpact)
    .slice(0, HUNT_SIZE);
}

/**
 * This week's Leak Hunt. The cards are fixed when the week's hunt is first
 * opened; the hunt is complete once each has a verdict. A week with nothing
 * to review counts as complete: a clean slate is a win.
 */
export async function currentHunt(user: UserRow, today: string): Promise<Hunt> {
  const week = isoWeek(today);
  const receipt = await readReceipt(user);
  const all = [...receipt.leaks, ...receipt.resolved];

  let row = getHunt(user.id, week);
  if (!row) {
    const ids = pickHuntCards(receipt.leaks).map((l) => l.id);
    insertHunt(user.id, week, ids, ids.length === 0 ? today : null);
    row = getHunt(user.id, week)!;
  }
  const ids: string[] = JSON.parse(row.leak_ids);
  const cards = ids.map((id) => all.find((l) => l.id === id)).filter((l): l is LedgerLeak => !!l);
  const remaining = cards.filter((c) => c.verdict === null && c.status === "open").length;

  if (!row.completed_at && remaining === 0) completeHunt(user.id, week, today);
  const completed = !!row.completed_at || remaining === 0;

  return {
    week,
    cards,
    total: cards.length,
    remaining,
    completed,
    streak: huntStreak(new Set(completedHuntWeeks(user.id)), today),
  };
}
