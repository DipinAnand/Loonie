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
