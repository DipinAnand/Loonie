import { fromDay, toDay } from "../engine/util.js";

/** ISO-8601 week id, e.g. "2026-W41". Weeks start on Monday. */
export function isoWeek(date: string): string {
  const day = toDay(date);
  const weekday = (new Date(day * 86_400_000).getUTCDay() + 6) % 7; // Mon=0
  const thursday = day - weekday + 3;
  const year = new Date(thursday * 86_400_000).getUTCFullYear();
  const jan4 = toDay(`${year}-01-04`);
  const jan4Weekday = (new Date(jan4 * 86_400_000).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4Weekday;
  const week = Math.floor((thursday - 3 - week1Monday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday (YYYY-MM-DD) of the ISO week containing `date`. */
export function weekMonday(date: string): string {
  const day = toDay(date);
  return fromDay(day - ((new Date(day * 86_400_000).getUTCDay() + 6) % 7));
}

/** The ISO week before the one containing `fromDate`, with its Monday. */
export function previousWeek(fromDate: string): { week: string; monday: string } {
  const monday = fromDay(toDay(weekMonday(fromDate)) - 7);
  return { week: isoWeek(monday), monday };
}

/** Local calendar date and hour in an IANA time zone. */
export function localNow(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "America/Toronto";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: weekdays.indexOf(parts.weekday) };
}

export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);
