import type { SwitchItem } from "./switchkit.js";
import { addDays, round2, toDay } from "./util.js";

/**
 * "Know before it bounces": the next 30 days of every chequing balance, from
 * today's live balances plus the recurring deposits and payments Looni already
 * found. Only possible because Looni sees every account, so it can say which
 * other account can cover the gap.
 */
export interface ForecastAccount {
  id: string;
  name: string;
  /** Plaid account type: depository, credit, loan, investment, other. */
  type: string;
  subtype: string | null;
  balance: number | null;
  available: number | null;
}

export interface Forecast {
  days: number;
  /** Combined chequing balance at the end of each day, today first. */
  series: { date: string; balance: number }[];
  low: { date: string; balance: number } | null;
  /** First day the combined chequing balance goes below zero, and by how much. */
  bounce: { date: string; shortBy: number; before: string[] } | null;
  /** Another account with enough money to cover the gap. */
  cover: { accountId: string; name: string; amount: number } | null;
  /** Lowest projected balance over the window, floored at zero. */
  safeToSpend: number;
  /** Next deposit the user is waiting for (labelled "Payday" on the chart). */
  payday: string | null;
}

const STEP_DAYS: Record<SwitchItem["cadence"], number> = { weekly: 7, biweekly: 14, monthly: 0, quarterly: 0, annual: 0 };
const STEP_MONTHS: Record<SwitchItem["cadence"], number> = { weekly: 0, biweekly: 0, monthly: 1, quarterly: 3, annual: 12 };

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Every date an item is expected in [from, to], starting at its next expected date. */
export function occurrences(item: Pick<SwitchItem, "cadence" | "nextDate">, from: string, to: string): string[] {
  const out: string[] = [];
  // Step from the original date each time, so the 31st stays the 31st after a short month.
  const nth = (k: number) =>
    STEP_DAYS[item.cadence] ? addDays(item.nextDate, k * STEP_DAYS[item.cadence]) : addMonths(item.nextDate, k * STEP_MONTHS[item.cadence]);
  for (let k = 0; k < 400; k++) {
    let date = nth(k);
    if (date > to) break;
    // A charge that was due recently but hasn't shown yet still counts today.
    if (k === 0 && date < from && toDay(from) - toDay(date) <= 5) date = from;
    if (date >= from) out.push(date);
  }
  return out;
}

const isChequing = (a: ForecastAccount) => a.type === "depository" && (a.subtype === "checking" || a.subtype === null);
const isSavings = (a: ForecastAccount) => a.type === "depository" && !isChequing(a);

export function forecast(accounts: ForecastAccount[], items: SwitchItem[], today: string, days = 30): Forecast | null {
  const chequing = accounts.filter((a) => isChequing(a) && a.balance !== null);
  if (chequing.length === 0) return null;
  const chequingIds = new Set(chequing.map((a) => a.id));
  // Items from a statement have no Plaid account: they ran through chequing, so count them there.
  const flows = items.filter((i) => i.accountId === null || chequingIds.has(i.accountId) || !accounts.some((a) => a.id === i.accountId));

  const end = addDays(today, days - 1);
  const byDate = new Map<string, { amount: number; names: string[] }>();
  let payday: string | null = null;
  for (const item of flows) {
    for (const date of occurrences(item, today, end)) {
      const entry = byDate.get(date) ?? { amount: 0, names: [] };
      entry.amount += item.direction === "deposit" ? item.amount : -item.amount;
      if (item.direction === "payment") entry.names.push(item.name);
      byDate.set(date, entry);
      if (item.direction === "deposit" && (!payday || date < payday)) payday = date;
    }
  }

  let balance = chequing.reduce((s, a) => s + (a.available ?? a.balance ?? 0), 0);
  const series: Forecast["series"] = [];
  let low: Forecast["low"] = null;
  let bounce: Forecast["bounce"] = null;
  const paidSoFar: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const flow = byDate.get(date);
    if (flow) {
      balance += flow.amount;
      paidSoFar.push(...flow.names);
    }
    series.push({ date, balance: round2(balance) });
    if (!low || balance < low.balance) low = { date, balance: round2(balance) };
    if (!bounce && balance < 0) bounce = { date, shortBy: 0, before: [...new Set(paidSoFar)].slice(-4) };
  }
  if (bounce && low) bounce.shortBy = round2(-low.balance);

  let cover: Forecast["cover"] = null;
  if (bounce) {
    const need = Math.ceil(bounce.shortBy);
    const from = accounts
      .filter((a) => isSavings(a) && (a.available ?? a.balance ?? 0) >= need)
      .sort((a, b) => (b.available ?? b.balance ?? 0) - (a.available ?? a.balance ?? 0))[0];
    if (from) cover = { accountId: from.id, name: from.name, amount: need };
  }

  return {
    days,
    series,
    low,
    bounce,
    cover,
    safeToSpend: round2(Math.max(0, low?.balance ?? 0)),
    payday,
  };
}

/** "Everything you have": assets minus what is owed (credit cards, loans, mortgage). */
export function netWorth(accounts: ForecastAccount[]) {
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    const v = a.balance ?? 0;
    if (a.type === "credit" || a.type === "loan") debts += v;
    else assets += v;
  }
  return { assets: round2(assets), debts: round2(debts), net: round2(assets - debts) };
}
