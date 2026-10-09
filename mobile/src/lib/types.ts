// Mirrors server/src/engine/types.ts and the API responses.
export type Verdict = "confirmed" | "dismissed";
export type LeakKind = "fee" | "subscription" | "price_hike" | "duplicate";

export type ConnectionStatus = "healthy" | "login_required" | "revoked";

/** A finding from the server's encrypted leak ledger (mirrors server/src/ledger.ts). */
export interface Leak {
  id: string;
  kind: LeakKind;
  status: "open" | "resolved";
  isNew: boolean;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
  verdict: Verdict | null;
  title: string;
  detail: string;
  merchantKey: string;
  annualImpact: number;
  history: { date: string; amount: number }[];
}

export interface Connection {
  itemId: string;
  institution: string | null;
  status: ConnectionStatus;
  lastScannedAt: string | null;
}

export interface LeakReceipt {
  lastScanAt: string | null;
  lastScanComplete: boolean;
  totalAnnualImpact: number;
  savedPerYear: number;
  transactionCount: number;
  windowStart: string | null;
  leaks: Leak[];
  resolved: Leak[];
  connections: Connection[];
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
