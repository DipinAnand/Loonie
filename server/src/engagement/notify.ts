import { createHash } from "node:crypto";
import {
  countPushedSince,
  deletePushToken,
  insertAlert,
  markAlertPushed,
  pushTokensFor,
  type UserRow,
} from "../db.js";
import { openForUser, sealForUser } from "../keys.js";
import type { LedgerLeak, LedgerReceipt } from "../ledger.js";
import { log } from "../log.js";
import { daysBetween, isoWeek, localNow } from "./time.js";

export type AlertKind = "suspicious" | "renewal" | "fee" | "price_hike" | "new_leak" | "hunt" | "report";

export interface NotifySettings {
  push: boolean;
  /** Lock-screen privacy: pushes never show amounts unless the user turns this off. */
  hideAmounts: boolean;
  quietStart: number; // local hour, inclusive
  quietEnd: number; // local hour, exclusive
  kinds: Record<AlertKind, boolean>;
}

export const DEFAULT_SETTINGS: NotifySettings = {
  push: true,
  hideAmounts: true,
  quietStart: 21,
  quietEnd: 8,
  kinds: { suspicious: true, renewal: true, fee: true, price_hike: true, new_leak: true, hunt: true, report: true },
};

export function parseSettings(json: string | null | undefined): NotifySettings {
  let raw: Partial<NotifySettings> = {};
  try {
    raw = JSON.parse(json || "{}");
  } catch {
    /* fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS, ...raw, kinds: { ...DEFAULT_SETTINGS.kinds, ...(raw.kinds ?? {}) } };
}

/** Non-security pushes allowed per rolling 7 days. Everything still lands in the in-app inbox. */
export const WEEKLY_PUSH_CAP = 2;

export interface AlertCandidate {
  key: string;
  kind: AlertKind;
  security: boolean;
  priority: number;
  leakId: string | null;
  title: string;
  /** Full text for the in-app inbox. */
  body: string;
  /** Lock-screen text without amounts. */
  privateBody: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const displayName = (l: LedgerLeak) => l.title.replace(/\s\((weekly|biweekly|monthly|quarterly|annual)\)$/, "");
const when = (days: number) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

export interface CandidateContext {
  /** User's local calendar date. */
  today: string;
  /** 0 = Monday. */
  weekday: number;
  huntRemaining: number;
}

/** Everything worth telling the user right now, each with a stable idempotency key. */
export function buildCandidates(r: LedgerReceipt, ctx: CandidateContext): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  for (const l of r.suspicious.filter((s) => s.verdict === null)) {
    out.push({
      key: `sus:${l.id}`,
      kind: "suspicious",
      security: true,
      priority: 100,
      leakId: l.id,
      title: "Suspicious charge",
      body: `${l.title}. ${l.detail} Was this you?`,
      privateBody: "A charge on your account looks unusual. Was this you?",
    });
  }

  for (const l of r.leaks) {
    const lastCharge = l.history.at(-1);
    if (l.kind === "subscription" && l.verdict !== "dismissed" && l.meta.nextExpectedDate) {
      const days = daysBetween(ctx.today, l.meta.nextExpectedDate);
      if (days >= 0 && days <= 2) {
        out.push({
          key: `renew:${l.id}:${l.meta.nextExpectedDate}`,
          kind: "renewal",
          security: false,
          priority: 80,
          leakId: l.id,
          title: `${displayName(l)} renews ${when(days)}`,
          body: `${money(l.meta.lastAmount ?? 0)} will be charged. ${l.verdict === "confirmed" ? "You said you don't need it. Cancel before it renews." : "Still using it?"}`,
          privateBody: l.verdict === "confirmed" ? "You said you don't need it. Cancel before it renews." : "Still using it?",
        });
      }
    }
    if (l.kind === "fee" && l.verdict !== "dismissed" && lastCharge && daysBetween(lastCharge.date, ctx.today) <= 3) {
      out.push({
        key: `fee:${l.id}:${lastCharge.date}`,
        kind: "fee",
        security: false,
        priority: 70,
        leakId: l.id,
        title: "New bank fee",
        body: `${l.title}: ${money(lastCharge.amount)} on ${lastCharge.date}. Banks often refund fees if you ask. Get the script.`,
        privateBody: `${l.title}. Banks often refund fees if you ask.`,
      });
    }
    if (l.kind === "price_hike" && l.isNew) {
      out.push({
        key: `hike:${l.id}`,
        kind: "price_hike",
        security: false,
        priority: 60,
        leakId: l.id,
        title: l.title,
        body: `${l.detail}. That's ${money(l.annualImpact)} more a year.`,
        privateBody: "A subscription just got more expensive. Take a look.",
      });
    }
    if ((l.kind === "subscription" || l.kind === "duplicate") && l.isNew) {
      out.push({
        key: `new:${l.id}`,
        kind: "new_leak",
        security: false,
        priority: 50,
        leakId: l.id,
        title: l.kind === "duplicate" ? "Possible double charge" : `New recurring charge: ${displayName(l)}`,
        body: `${l.detail}`,
        privateBody: l.kind === "duplicate" ? "You may have been charged twice." : "Looni spotted a new recurring charge.",
      });
    }
  }

  if (ctx.weekday === 0 && ctx.huntRemaining > 0) {
    const week = isoWeek(ctx.today);
    out.push({
      key: `hunt:${week}`,
      kind: "hunt",
      security: false,
      priority: 30,
      leakId: null,
      title: "This week's Leak Hunt is ready",
      body: `${ctx.huntRemaining} card${ctx.huntRemaining === 1 ? "" : "s"} to sort. About 30 seconds.`,
      privateBody: `${ctx.huntRemaining} card${ctx.huntRemaining === 1 ? "" : "s"} to sort. About 30 seconds.`,
    });
  }

  if (ctx.today.endsWith("-01") && r.lastScanAt) {
    const prevMonth = new Date(`${ctx.today}T00:00:00Z`);
    prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
    const month = prevMonth.toISOString().slice(0, 7);
    const name = prevMonth.toLocaleString("en-CA", { month: "long", timeZone: "UTC" });
    out.push({
      key: `report:${month}`,
      kind: "report",
      security: false,
      priority: 20,
      leakId: null,
      title: `Your ${name} Leak Report`,
      body: "See what you plugged, what's new and your Leak Score.",
      privateBody: "See what you plugged, what's new and your Leak Score.",
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

const isQuiet = (hour: number, s: NotifySettings) =>
  s.quietStart > s.quietEnd ? hour >= s.quietStart || hour < s.quietEnd : hour >= s.quietStart && hour < s.quietEnd;

// ---- delivery -------------------------------------------------------------------

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string | null>;
}

export interface PushSender {
  /** Returns tokens the push service says are dead, so they can be forgotten. */
  send(messages: PushMessage[]): Promise<{ deadTokens: string[] }>;
}

/** Expo's push service (works for both APNs and FCM through the Expo push token). */
export const expoPushSender: PushSender = {
  async send(messages) {
    if (messages.length === 0) return { deadTokens: [] };
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages.map((m) => ({ ...m, sound: "default" }))),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
    const deadTokens = (json.data ?? []).flatMap((t, i) => (t.details?.error === "DeviceNotRegistered" ? [messages[i].to] : []));
    return { deadTokens };
  },
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Turns the current ledger into inbox alerts and (some) pushes:
 * - every alert is created once (idempotency key),
 * - non-security alerts wait until quiet hours end,
 * - at most WEEKLY_PUSH_CAP non-security pushes per 7 days; the rest stay in the inbox,
 * - security alerts always push,
 * - lock-screen text hides amounts unless the user opted in.
 */
export async function deliverAlerts(
  user: UserRow,
  receipt: LedgerReceipt,
  opts: { now: Date; huntRemaining: number; sender: PushSender },
): Promise<{ created: AlertCandidate[]; pushed: PushMessage[] }> {
  const settings = parseSettings(user.notify_settings);
  const local = localNow(opts.now, user.timezone);
  const quiet = isQuiet(local.hour, settings);
  const nowIso = opts.now.toISOString().replace("T", " ").slice(0, 19);
  const weekAgo = new Date(opts.now.getTime() - 7 * 86_400_000).toISOString().replace("T", " ").slice(0, 19);

  const candidates = buildCandidates(receipt, { today: local.date, weekday: local.weekday, huntRemaining: opts.huntRemaining })
    .filter((c) => settings.kinds[c.kind])
    .filter((c) => c.security || !quiet);

  const created: AlertCandidate[] = [];
  for (const c of candidates) {
    const payloadEnc = await sealForUser(user.id, user.wrapped_dek, { title: c.title, body: c.body, leakId: c.leakId }, `alert:${c.key}`);
    if (insertAlert({ userId: user.id, key: c.key, kind: c.kind, security: c.security, payloadEnc, at: nowIso })) created.push(c);
  }

  const pushed: PushMessage[] = [];
  const tokens = settings.push ? pushTokensFor(user.id) : [];
  if (tokens.length === 0) return { created, pushed };
  const plainTokens = await Promise.all(
    tokens.map(async (t) => ({ hash: t.token_hash, token: await openForUser<string>(user.id, user.wrapped_dek, t.token_enc, "push") })),
  );

  let budget = WEEKLY_PUSH_CAP - countPushedSince(user.id, weekAgo, false);
  for (const c of created) {
    if (!c.security) {
      if (budget <= 0) continue;
      budget--;
    }
    const body = settings.hideAmounts ? c.privateBody : c.body;
    for (const t of plainTokens) pushed.push({ to: t.token, title: c.title, body, data: { alertKey: c.key, leakId: c.leakId } });
    markAlertPushed(user.id, c.key, nowIso);
  }

  try {
    const { deadTokens } = await opts.sender.send(pushed);
    for (const dead of deadTokens) deletePushToken(user.id, hashToken(dead));
  } catch (err) {
    log.warn("push send failed", { err });
  }
  return { created, pushed };
}
