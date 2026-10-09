// Mirrors server/src/engine/types.ts and the API responses.
export type Verdict = "confirmed" | "dismissed";
export type LeakKind = "fee" | "subscription" | "price_hike" | "duplicate" | "suspicious";

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
  verdictAt: string | null;
  title: string;
  detail: string;
  merchantKey: string;
  annualImpact: number;
  meta: { cadence?: string; lastAmount?: number; nextExpectedDate?: string; rule?: string; date?: string };
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
  /** Open suspicious-charge alerts; never counted in totals. */
  suspicious: Leak[];
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

// ---- engagement (mirrors server/src/engagement) ----

export type Level = "egg" | "chick" | "fledgling" | "loon";

export interface ScoreItem {
  key: string;
  label: string;
  points: number;
  hint: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  reward: number;
  completion: "auto" | "self";
  status: "available" | "completed";
  completedAt: string | null;
  progress: { current: number; target: number } | null;
  stake: number | null;
  endsOn: string | null;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  unlockedAt?: string | null;
  seen?: boolean;
}

export interface Home {
  today: string;
  score: { score: number; previous: number | null; breakdown: ScoreItem[] };
  savedPerYear: number;
  savedToDate: number;
  stillLeakingPerYear: number;
  loonies: number;
  level: Level;
  next: { level: Level; at: number } | null;
  streaks: { feeFreeDays: number | null; nsfFreeMonths: number | null; huntWeeks: number };
  hunt: { week: string; total: number; remaining: number; completed: boolean };
  upcoming: { leakId: string; title: string; amount: number | null; date: string; inDays: number }[];
  suspicious: number;
  unreadAlerts: number;
  quests: Quest[];
  celebrate: { quests: string[]; badges: Badge[] };
  connections: Connection[];
  lastScanAt: string | null;
}

export interface Hunt {
  week: string;
  cards: Leak[];
  total: number;
  remaining: number;
  completed: boolean;
  streak: number;
}

export interface Alert {
  key: string;
  kind: "suspicious" | "renewal" | "fee" | "price_hike" | "new_leak" | "hunt" | "report";
  security: boolean;
  createdAt: string;
  read: boolean;
  title: string;
  body: string;
  leakId: string | null;
}

export interface NotificationSettings {
  push: boolean;
  hideAmounts: boolean;
  quietStart: number;
  quietEnd: number;
  kinds: Record<Alert["kind"], boolean>;
  timezone: string;
}

export interface LabelResult {
  ok: true;
  notMeSteps?: string[];
  hunt: { remaining: number; completed: boolean; streak: number };
  celebrate: { quests: string[]; badges: string[] };
}

export interface ShareStats {
  foundPerYear: number;
  pluggedPerYear: number;
  leaksPlugged: number;
  score: number;
  level: Level;
}

export interface MonthlyReport {
  month: string;
  newLeaks: { id: string; kind: LeakKind; title: string; annualImpact: number }[];
  plugged: { id: string; title: string; annualImpact: number }[];
  pluggedPerYear: number;
  feesPaid: number;
  scoreStart: number | null;
  scoreEnd: number | null;
  stillOpen: number;
}
