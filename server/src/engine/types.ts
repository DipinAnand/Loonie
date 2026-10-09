/**
 * Normalized transaction the engine works on. Amount follows Plaid's sign
 * convention: positive = money leaving the account, negative = money coming in.
 */
export interface Txn {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  name: string;
  merchantName?: string | null;
  /** Plaid personal_finance_category.primary, e.g. "BANK_FEES" */
  categoryPrimary?: string | null;
  /** Plaid personal_finance_category.detailed, e.g. "BANK_FEES_OVERDRAFT_FEES" */
  categoryDetailed?: string | null;
  pending?: boolean;
  currency?: string | null;
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

export interface RecurringSeries {
  merchantKey: string;
  displayName: string;
  cadence: Cadence;
  count: number;
  medianAmount: number;
  lastAmount: number;
  /** Old price when the charge recently stepped to a new level, else null. */
  previousAmount: number | null;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string;
  active: boolean;
  annualCost: number;
  categoryPrimary: string | null;
  txnIds: string[];
}

export type LeakKind = "fee" | "subscription" | "price_hike" | "duplicate";

export interface Leak {
  /** Stable across re-runs so user labels stick to the same leak. */
  id: string;
  kind: LeakKind;
  title: string;
  detail: string;
  merchantKey: string;
  /** Estimated cost over 12 months (one-off amount for duplicates). */
  annualImpact: number;
  txnIds: string[];
  /** Feature snapshot stored alongside labels -> future training rows. */
  features: Record<string, string | number | boolean | null>;
}

export type Verdict = "confirmed" | "dismissed";

export interface LeakReceipt {
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  transactionCount: number;
  totalAnnualImpact: number;
  leaks: (Leak & { verdict: Verdict | null })[];
  recurring: RecurringSeries[];
}
