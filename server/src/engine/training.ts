import type { Leak } from "./types.js";

/**
 * Turns a labeled leak into a de-identified training row:
 * - only engine features + kind + merchant key (a business, not a person),
 * - exact amounts become ranges, so a row can't be matched against a statement,
 * - anything that can name a person (e-transfers, P2P, payroll) is dropped.
 * Returns null when the leak shouldn't be used for training at all.
 */
const PERSON_LIKE = /\b(e-?transfer|etransfer|interac|virement|send money|zelle|venmo|wise|payroll|salary|paie|deposit|depot|transfer|to |from )\b/i;
const AMOUNT_FIELD = /amount|sum|impact|delta|balance/i;
const BUCKETS = [5, 10, 20, 50, 100, 250, 500, 1000, 5000];

export function amountBucket(n: number): string {
  const abs = Math.abs(n);
  let lo = 0;
  for (const hi of BUCKETS) {
    if (abs < hi) return `${lo}-${hi}`;
    lo = hi;
  }
  return `${lo}+`;
}

export function toTrainingFeatures(leak: Pick<Leak, "kind" | "merchantKey" | "features" | "annualImpact">): Record<string, string | number | boolean | null> | null {
  if (PERSON_LIKE.test(leak.merchantKey)) return null;
  const out: Record<string, string | number | boolean | null> = { merchantKey: leak.merchantKey, annualImpact: amountBucket(leak.annualImpact) };
  for (const [k, v] of Object.entries(leak.features)) {
    out[k] = typeof v === "number" && AMOUNT_FIELD.test(k) ? amountBucket(v) : v;
  }
  return out;
}
