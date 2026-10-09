import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;

export function toDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDay(toDay(date) + days);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

// Processor / channel noise that banks prepend to merchant descriptors,
// including the Canadian ones (PAD, Interac, bilingual prefixes).
const DESCRIPTOR_NOISE = [
  /\b(pos|purchase|achat|debit|card|carte|visa|mc|mastercard|interac|e-?transfer|virement)\b/g,
  /\b(pad|pre-?authori[sz]ed( debit)?|preauth|paiement pre-?autori[sz]e|ach|recurring|recurrent|bill ?payment|paiement de facture)\b/g,
  /\b(sq|tst|pp|paypal|stripe)\s*\*/g,
  /\b(inc|ltd|llc|corp|co|ltee|ltée)\b\.?/g,
  /\b(www\.|\.com|\.ca|\.net)\b/g,
];

/**
 * Collapse a raw descriptor into a key that groups the same merchant across
 * statements: "NETFLIX.COM 866-579-7172 ON" and "Netflix" -> "netflix".
 */
export function merchantKey(name: string, merchantName?: string | null): string {
  const source = (merchantName && merchantName.trim()) || name;
  let s = source.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const re of DESCRIPTOR_NOISE) s = s.replace(re, " ");
  s = s
    .replace(/[#*]\s*\w*\d\w*/g, " ") // store / reference numbers like #1234, *AB12C
    .replace(/\d[\d-]{3,}/g, " ") // phone numbers, long refs
    .replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z\d]{4,}\b/g, " ") // mixed letter+digit reference codes
    .replace(/\b(on|qc|bc|ab|mb|sk|ns|nb|nl|pe|ca|us)\b\s*$/g, " ") // trailing province/country
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || source.toLowerCase().trim();
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
