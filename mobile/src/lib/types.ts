// Mirrors server/src/engine/types.ts and the API responses.
export type Verdict = "confirmed" | "dismissed";
export type LeakKind = "fee" | "subscription" | "price_hike" | "duplicate";

export interface Leak {
  id: string;
  kind: LeakKind;
  title: string;
  detail: string;
  merchantKey: string;
  annualImpact: number;
  txnIds: string[];
  verdict: Verdict | null;
}

export interface LeakReceipt {
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  transactionCount: number;
  totalAnnualImpact: number;
  leaks: Leak[];
}

export interface Account {
  account_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  currency: string | null;
  institution_name: string | null;
}

export interface Txn {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchantName?: string | null;
  categoryPrimary?: string | null;
  pending?: boolean;
  currency?: string | null;
}

export interface QuickLinkResult {
  scenario: "leaky" | "dynamic";
  itemId: string;
}
