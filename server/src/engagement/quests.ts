import type { LedgerLeak } from "../ledger.js";

export interface QuestContext {
  today: string;
  open: LedgerLeak[];
  resolved: LedgerLeak[];
  huntStreak: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  reward: number; // loonies
  /** Completes on its own from the ledger, or the user taps "Done" (self-reported). */
  completion: "auto" | "self";
  /** Shown only between these dates (seasonal), inclusive. */
  window?: { from: string; to: string };
  available: (c: QuestContext) => boolean;
  progress?: (c: QuestContext) => { current: number; target: number };
  done?: (c: QuestContext) => boolean;
  /** Estimated money at stake, for the card ("saves up to $780/yr"). */
  stake?: (c: QuestContext) => number | null;
}

const plugged = (c: QuestContext) => c.resolved.filter((l) => l.verdict === "confirmed" && l.kind !== "suspicious");
const maxImpact = (ls: LedgerLeak[]) => (ls.length ? Math.max(...ls.map((l) => l.annualImpact)) : null);

export const QUESTS: QuestDef[] = [
  {
    id: "plug_subscription",
    title: "Plug a subscription you don't use",
    description: "Cancel one. Looni confirms it when the charges stop.",
    reward: 100,
    completion: "auto",
    available: (c) => c.open.some((l) => l.kind === "subscription") || plugged(c).some((l) => l.kind === "subscription"),
    done: (c) => plugged(c).some((l) => l.kind === "subscription"),
    stake: (c) => maxImpact(c.open.filter((l) => l.kind === "subscription")),
  },
  {
    id: "review_all",
    title: "Review every leak",
    description: "Tell Looni which leaks are real. It gets smarter for everyone.",
    reward: 50,
    completion: "auto",
    available: (c) => c.open.length + c.resolved.length > 0,
    progress: (c) => {
      const all = [...c.open, ...c.resolved].filter((l) => l.kind !== "suspicious");
      return { current: all.filter((l) => l.verdict !== null).length, target: all.length };
    },
    done: (c) => {
      const all = [...c.open, ...c.resolved].filter((l) => l.kind !== "suspicious");
      return all.length > 0 && all.every((l) => l.verdict !== null);
    },
  },
  {
    id: "fee_refund",
    title: "Get a bank fee refunded",
    description: "Banks often reverse fees if you ask. We'll give you the script.",
    reward: 75,
    completion: "self",
    available: (c) => [...c.open, ...c.resolved].some((l) => l.kind === "fee"),
    stake: (c) => {
      const last = c.open.filter((l) => l.kind === "fee").flatMap((l) => l.history).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      return last ? last.amount : null;
    },
  },
  {
    id: "duplicate_refund",
    title: "Get a double charge refunded",
    description: "Ask the merchant to reverse the duplicate.",
    reward: 60,
    completion: "self",
    available: (c) => c.open.some((l) => l.kind === "duplicate"),
    stake: (c) => maxImpact(c.open.filter((l) => l.kind === "duplicate")),
  },
  {
    id: "hunt_streak_4",
    title: "4-week Leak Hunt streak",
    description: "Finish the weekly Leak Hunt four weeks in a row.",
    reward: 120,
    completion: "auto",
    available: () => true,
    progress: (c) => ({ current: Math.min(4, c.huntStreak), target: 4 }),
    done: (c) => c.huntStreak >= 4,
  },
  {
    id: "fall_cleanup_2026",
    title: "Fall Cleanup: plug 3 leaks",
    description: "Plug three leaks before November 30.",
    reward: 200,
    completion: "auto",
    window: { from: "2026-10-01", to: "2026-11-30" },
    available: () => true,
    progress: (c) => ({
      current: Math.min(3, plugged(c).filter((l) => l.resolvedAt && l.resolvedAt >= "2026-10-01" && l.resolvedAt <= "2026-11-30").length),
      target: 3,
    }),
    done: (c) => plugged(c).filter((l) => l.resolvedAt && l.resolvedAt >= "2026-10-01" && l.resolvedAt <= "2026-11-30").length >= 3,
  },
];

export interface QuestView {
  id: string;
  title: string;
  description: string;
  reward: number;
  completion: "auto" | "self";
  status: "available" | "completed";
  completedAt: string | null;
  progress: { current: number; target: number } | null;
  stake: number | null;
  endsOn: string | null;
}

/**
 * Evaluates every quest. Returns the views plus ids that just completed
 * (auto quests) so the caller can persist them and celebrate.
 */
export function evaluateQuests(c: QuestContext, completed: Map<string, string>): { quests: QuestView[]; newlyCompleted: string[] } {
  const quests: QuestView[] = [];
  const newlyCompleted: string[] = [];
  for (const q of QUESTS) {
    const done = completed.get(q.id) ?? null;
    if (!done && q.window && (c.today < q.window.from || c.today > q.window.to)) continue;
    if (!done && !q.available(c)) continue;
    let completedAt = done;
    if (!completedAt && q.completion === "auto" && q.done?.(c)) {
      completedAt = c.today;
      newlyCompleted.push(q.id);
    }
    quests.push({
      id: q.id,
      title: q.title,
      description: q.description,
      reward: q.reward,
      completion: q.completion,
      status: completedAt ? "completed" : "available",
      completedAt,
      progress: q.progress?.(c) ?? null,
      stake: q.stake?.(c) ?? null,
      endsOn: q.window?.to ?? null,
    });
  }
  return { quests, newlyCompleted };
}

export const questReward = (id: string) => QUESTS.find((q) => q.id === id)?.reward ?? 0;
export const isSelfReported = (id: string) => QUESTS.find((q) => q.id === id)?.completion === "self";
