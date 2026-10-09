import type { LedgerLeak } from "../ledger.js";
import { daysBetween } from "./time.js";

export interface ScoreItem {
  key: string;
  label: string;
  /** Negative = costing points, positive = bonus. */
  points: number;
  /** How to win these points back. */
  hint: string;
}

export interface LeakScore {
  score: number;
  breakdown: ScoreItem[];
}

const FEE_WINDOW_DAYS = 90;

/**
 * Leak Score, 0–100: one number that goes up as leaks get plugged. Pure and
 * explainable: every point lost comes with what to do about it.
 */
export function leakScore(open: LedgerLeak[], resolved: LedgerLeak[], suspicious: LedgerLeak[], today: string): LeakScore {
  const items: ScoreItem[] = [];
  const add = (key: string, label: string, points: number, hint: string) => {
    if (points !== 0) items.push({ key, label, points, hint });
  };

  const recentFees = open.filter(
    (l) => l.kind === "fee" && l.verdict !== "dismissed" && l.history.some((h) => daysBetween(h.date, today) <= FEE_WINDOW_DAYS),
  );
  const feeCost = recentFees.reduce((s, l) => s + l.annualImpact, 0);
  add("fees", `Bank fees: $${Math.round(feeCost)}/yr`, -Math.min(30, Math.round(feeCost / 10)), "Ask for a refund, or switch to a no-fee account.");

  const stillCharging = open.filter((l) => l.kind === "subscription" && l.verdict === "confirmed");
  add(
    "unwanted",
    `${stillCharging.length} subscription${stillCharging.length === 1 ? "" : "s"} you don't need, still charging`,
    -Math.min(24, stillCharging.length * 8),
    "Cancel them. The score updates when the charges stop.",
  );

  const unreviewed = open.filter((l) => l.verdict === null);
  add("unreviewed", `${unreviewed.length} leak${unreviewed.length === 1 ? "" : "s"} to review`, -Math.min(16, unreviewed.length * 2), "Do this week's Leak Hunt.");

  const duplicates = open.filter((l) => l.kind === "duplicate" && l.verdict === "confirmed");
  add("duplicates", "Double charges not refunded yet", -Math.min(8, duplicates.length * 4), "Ask the merchant for a refund.");

  const unreviewedSuspicious = suspicious.filter((l) => l.verdict === null);
  add("suspicious", "Suspicious charges to check", -Math.min(20, unreviewedSuspicious.length * 10), "Tell us if it was you.");

  const plugged = resolved.filter((l) => l.verdict === "confirmed");
  add("plugged", `${plugged.length} leak${plugged.length === 1 ? "" : "s"} plugged`, Math.min(10, plugged.length * 2), "Keep going!");

  const score = Math.max(0, Math.min(100, 100 + items.reduce((s, i) => s + i.points, 0)));
  return { score, breakdown: items.sort((a, b) => a.points - b.points) };
}
