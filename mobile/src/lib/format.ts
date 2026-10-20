export function money(n: number, currency = "CAD"): string {
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function prettyCategory(c?: string | null): string {
  if (!c) return "Uncategorized";
  return c
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "Tue, Oct 21" from YYYY-MM-DD, without the device's time zone shifting the day. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function inDaysLabel(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: "every week",
  biweekly: "every 2 weeks",
  monthly: "monthly",
  quarterly: "every 3 months",
  annual: "yearly",
};
export const cadenceLabel = (c: string) => CADENCE_LABEL[c] ?? c;
