/** Money and dates as people read them, for sentences shown in the app. */
export const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-16" → "Aug 16", with the year only when it isn't this year. */
export function day(iso: string, now = new Date()): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}${y === now.getUTCFullYear() ? "" : `, ${y}`}`;
}
