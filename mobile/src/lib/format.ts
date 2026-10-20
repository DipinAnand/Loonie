export function money(n: number, currency = "CAD", digits = 2): string {
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return `$${n.toFixed(digits)}`;
  }
}

/** "2026-10-27" → "Oct 27". */
export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function prettyCategory(c?: string | null): string {
  if (!c) return "Uncategorized";
  return c
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
