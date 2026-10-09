import { alertsFor, completedQuests, completeQuest, scansForUser, unlockBadge, unlockedBadges, type UserRow } from "../db.js";
import { openForUser } from "../keys.js";
import { type LedgerReceipt, readReceipt, type ScanSummary } from "../ledger.js";
import { BADGES, earnedBadges } from "./achievements.js";
import { currentHunt } from "./hunt.js";
import { deliverAlerts, expoPushSender, type PushSender } from "./notify.js";
import { levelFor, outcomeStreaks, savedToDate } from "./progress.js";
import { evaluateQuests, questReward } from "./quests.js";
import { leakScore } from "./score.js";
import { daysBetween, localNow } from "./time.js";

export const localToday = (user: UserRow, now = new Date()) => localNow(now, user.timezone).date;

/** Quests, with auto-completions persisted, plus the loonie total they feed. */
export async function questsFor(user: UserRow, receipt: LedgerReceipt, today: string, huntStreak: number) {
  const done = completedQuests(user.id);
  const { quests, newlyCompleted } = evaluateQuests({ today, open: receipt.leaks, resolved: receipt.resolved, huntStreak }, done);
  for (const id of newlyCompleted) completeQuest(user.id, id, today);
  const questLoonies = [...done.keys(), ...newlyCompleted].reduce((s, id) => s + questReward(id), 0);
  return { quests, newlyCompleted, questLoonies };
}

/** Unlocks any newly earned badges and returns them (for a celebration on the client). */
export function syncBadges(user: UserRow, receipt: LedgerReceipt, today: string, huntStreak: number): string[] {
  const all = [...receipt.leaks, ...receipt.resolved, ...receipt.suspicious];
  const streaks = outcomeStreaks(all, today);
  const earned = earnedBadges({
    savedPerYear: receipt.savedPerYear,
    pluggedCount: receipt.resolved.filter((l) => l.verdict === "confirmed").length,
    feeFreeDays: streaks.feeFreeDays,
    huntStreak,
    priceHikesReviewed: all.filter((l) => l.kind === "price_hike" && l.verdict !== null).length,
    suspiciousReviewed: all.filter((l) => l.kind === "suspicious" && l.verdict !== null).length,
  });
  return earned.filter((b) => unlockBadge(user.id, b, today));
}

/** Everything the home screen needs, in one call. */
export async function homeFor(user: UserRow, now = new Date()) {
  const today = localToday(user, now);
  const receipt = await readReceipt(user);
  const hunt = await currentHunt(user, today);
  const { quests, newlyCompleted, questLoonies } = await questsFor(user, receipt, today, hunt.streak);
  const newBadges = syncBadges(user, receipt, today, hunt.streak);

  const saved = savedToDate(receipt.resolved, today);
  const loonies = Math.floor(saved) + questLoonies;
  const score = leakScore(receipt.leaks, receipt.resolved, receipt.suspicious, today);
  const streaks = outcomeStreaks([...receipt.leaks, ...receipt.resolved], today);

  const upcoming = receipt.leaks
    .filter((l) => l.kind === "subscription" && l.verdict !== "dismissed" && l.meta.nextExpectedDate)
    .map((l) => ({ leakId: l.id, title: l.title, amount: l.meta.lastAmount ?? null, date: l.meta.nextExpectedDate!, inDays: daysBetween(today, l.meta.nextExpectedDate!) }))
    .filter((u) => u.inDays >= 0 && u.inDays <= 14)
    .sort((a, b) => a.inDays - b.inDays);

  const scoreHistory = await scoreTrend(user);
  const unread = alertsFor(user.id, 100).filter((a) => !a.read_at).length;

  return {
    today,
    score: { ...score, previous: scoreHistory.at(-2)?.score ?? null },
    savedPerYear: receipt.savedPerYear,
    savedToDate: saved,
    stillLeakingPerYear: receipt.totalAnnualImpact,
    loonies,
    ...levelFor(loonies),
    streaks: { ...streaks, huntWeeks: hunt.streak },
    hunt: { week: hunt.week, total: hunt.total, remaining: hunt.remaining, completed: hunt.completed },
    upcoming,
    suspicious: receipt.suspicious.filter((s) => s.verdict === null).length,
    unreadAlerts: unread,
    quests: quests.filter((q) => q.status === "available").slice(0, 3),
    celebrate: {
      quests: newlyCompleted,
      badges: newBadges.map((id) => BADGES.find((b) => b.id === id)!).map(({ id, title, description }) => ({ id, title, description })),
    },
    connections: receipt.connections,
    lastScanAt: receipt.lastScanAt,
  };
}

/** Leak Score per scan, oldest first (recomputed from each scan's sealed summary). */
export async function scoreTrend(user: UserRow): Promise<{ at: string; score: number }[]> {
  const out: { at: string; score: number }[] = [];
  for (const s of scansForUser(user.id, 12).reverse()) {
    const summary = await openForUser<ScanSummary>(user.id, user.wrapped_dek, s.summary_enc, "scan");
    if (typeof summary.score === "number") out.push({ at: s.ran_at, score: summary.score });
  }
  return out;
}

export async function badgesFor(user: UserRow) {
  const unlocked = new Map(unlockedBadges(user.id).map((b) => [b.badge, b]));
  return BADGES.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    unlockedAt: unlocked.get(b.id)?.unlocked_at ?? null,
    seen: unlocked.get(b.id)?.seen === 1,
  }));
}

/** Privacy-safe numbers for the share card: no merchants, banks or dates. */
export async function shareStatsFor(user: UserRow, now = new Date()) {
  const today = localToday(user, now);
  const receipt = await readReceipt(user);
  const found = receipt.totalAnnualImpact + receipt.savedPerYear;
  const score = leakScore(receipt.leaks, receipt.resolved, receipt.suspicious, today).score;
  const plugged = receipt.resolved.filter((l) => l.verdict === "confirmed").length;
  const { questLoonies } = await questsFor(user, receipt, today, 0);
  const loonies = Math.floor(savedToDate(receipt.resolved, today)) + questLoonies;
  return { foundPerYear: Math.round(found), pluggedPerYear: Math.round(receipt.savedPerYear), leaksPlugged: plugged, score, level: levelFor(loonies).level };
}

/** Month in review, from the ledger: what was found, plugged and is still open. */
export async function monthlyReport(user: UserRow, month: string) {
  const receipt = await readReceipt(user);
  const inMonth = (d: string | null) => !!d && d.startsWith(month);
  const all = [...receipt.leaks, ...receipt.resolved];
  const found = all.filter((l) => inMonth(l.firstSeen));
  const plugged = receipt.resolved.filter((l) => l.verdict === "confirmed" && inMonth(l.resolvedAt));
  const fees = all
    .filter((l) => l.kind === "fee")
    .flatMap((l) => l.history.filter((h) => h.date.startsWith(month)))
    .reduce((s, h) => s + h.amount, 0);
  const trend = (await scoreTrend(user)).filter((t) => t.at.startsWith(month));
  return {
    month,
    newLeaks: found.map((l) => ({ id: l.id, kind: l.kind, title: l.title, annualImpact: l.annualImpact })),
    plugged: plugged.map((l) => ({ id: l.id, title: l.title, annualImpact: l.annualImpact })),
    pluggedPerYear: Math.round(plugged.reduce((s, l) => s + l.annualImpact, 0) * 100) / 100,
    feesPaid: Math.round(fees * 100) / 100,
    scoreStart: trend.at(0)?.score ?? null,
    scoreEnd: trend.at(-1)?.score ?? null,
    stillOpen: receipt.leaks.length,
  };
}

/** Builds alerts from the ledger (no Plaid call) and pushes what the rules allow. */
export async function notifyUser(user: UserRow, now = new Date(), sender: PushSender = expoPushSender) {
  const today = localToday(user, now);
  const receipt = await readReceipt(user);
  const hunt = await currentHunt(user, today);
  return deliverAlerts(user, receipt, { now, huntRemaining: hunt.remaining, sender });
}

export async function alertInbox(user: UserRow) {
  const rows = alertsFor(user.id, 100);
  const out = [];
  for (const a of rows) {
    const p = await openForUser<{ title: string; body: string; leakId: string | null }>(user.id, user.wrapped_dek, a.payload_enc, `alert:${a.alert_key}`);
    out.push({ key: a.alert_key, kind: a.kind, security: a.security === 1, createdAt: a.created_at, read: !!a.read_at, ...p });
  }
  return out;
}
