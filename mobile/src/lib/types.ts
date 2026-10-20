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
  meta: LeakMeta;
  history: { date: string; amount: number }[];
}

export interface LeakMeta {
  cadence?: string;
  lastAmount?: number;
  nextExpectedDate?: string;
  rule?: string;
  date?: string;
  /** "high" when a fee line proves it; "medium" when the user should check. */
  confidence?: "high" | "medium";
  ruleVersion?: string;
  fix?: string;
  /** Exact words to say to the bank or merchant. */
  script?: string;
}

export type Grade = "A" | "B" | "C" | "D";

export interface NextMove {
  leakId: string;
  title: string;
  savesPerYear: number;
  fix: string;
  script: string | null;
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
  grade: Grade | null;
  nextMove: NextMove | null;
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
  grade: Grade | null;
  nextMove: NextMove | null;
  renewal: { daysLeft: number; action: string; band: RenewalBand } | null;
  switchKit: { moved: number; total: number };
  loonies: number;
  level: Level;
  next: { level: Level; at: number } | null;
  streaks: { feeFreeDays: number | null; nsfFreeMonths: number | null; huntWeeks: number };
  hunt: { week: string; total: number; remaining: number; completed: boolean };
  upcoming: { leakId: string; title: string; amount: number | null; date: string; inDays: number }[];
  bills: {
    monthlyTotal: number;
    late: number;
    next: { billId: string; name: string; amount: number; date: string; inDays: number }[];
    payday: { date: string; amount: number } | null;
  } | null;
  suspicious: number;
  unreadAlerts: number;
  quests: Quest[];
  celebrate: { quests: string[]; badges: Badge[] };
  connections: Connection[];
  lastScanAt: string | null;
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

export interface Bill {
  id: string;
  name: string;
  kind: "bill" | "subscription" | "debt";
  cadence: Cadence;
  amount: number;
  typicalAmount: number;
  nextDate: string;
  lastPaid: { date: string; amount: number };
  change: { from: number; to: number } | null;
  status: "late" | "due_soon" | "upcoming";
  inDays: number;
  lateDays: number;
  hidden: boolean;
  remindDays: number;
}

export interface Bills {
  ready: true;
  asOf: string;
  today: string;
  bills: Bill[];
  paydays: { name: string; cadence: Cadence; amount: number; nextDate: string; lastDate: string }[];
  coverage: {
    status: "ok" | "tight" | "short" | "unknown";
    until: string;
    payday: { date: string; amount: number } | null;
    due: number;
    dueBills: { id: string; name: string; date: string; amount: number }[];
    balance: number | null;
    cushion: number | null;
  };
  monthlyTotal: number;
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
  kind: "suspicious" | "renewal" | "mortgage" | "fee" | "price_hike" | "new_leak" | "hunt" | "report" | "bill_due" | "bill_late" | "low_balance";
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

// ---- statements, overview, renewal, switch kit, tracks, tools ----

export interface StatementFileSummary {
  name: string;
  transactions: number;
  skippedRows: number;
}

/** Preview of an imported statement: the engine's receipt, nothing stored. */
export interface StatementPreview {
  saved: false;
  statements: StatementFileSummary[];
  receipt: {
    windowStart: string | null;
    windowEnd: string | null;
    transactionCount: number;
    totalAnnualImpact: number;
    grade: Grade;
    nextMove: NextMove | null;
    leaks: (Omit<Leak, "status" | "isNew" | "firstSeen" | "lastSeen" | "resolvedAt" | "verdictAt" | "history"> & { txnIds: string[] })[];
  };
}

export interface StatementSaved {
  saved: true;
  statements: StatementFileSummary[];
  receipt: LeakReceipt;
}

export interface OverviewAccount {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number | null;
  available: number | null;
}

export interface Forecast {
  days: number;
  series: { date: string; balance: number }[];
  low: { date: string; balance: number } | null;
  bounce: { date: string; shortBy: number; before: string[] } | null;
  cover: { accountId: string; name: string; amount: number } | null;
  safeToSpend: number;
  payday: string | null;
}

export interface Overview {
  complete: boolean;
  accounts: OverviewAccount[];
  netWorth: { assets: number; debts: number; net: number };
  forecast: Forecast | null;
  leaksPerYear: number;
  grade: Grade | null;
  renewal: { daysLeft: number; maturityDate: string } | null;
}

export type RenewalBand = "red" | "amber" | "calm";

export interface Renewal {
  maturityDate: string;
  balance?: number;
  letterRate?: number;
  quoteRate?: number;
  amortizationYears?: number;
  daysLeft: number;
  currentMilestone: string | null;
  action: string;
  band: RenewalBand;
  progress: number;
  milestones: { id: string; days: number; label: string; date: string; status: "passed" | "upcoming" }[];
  costs: { letterPayment: number; quotePayment: number; monthlyDifference: number; termCost: number } | null;
  biweekly: { monthlyPayment: number; biweeklyPayment: number; interestSaved: number; yearsSooner: number } | null;
}

export interface SwitchItem {
  key: string;
  name: string;
  direction: "deposit" | "payment";
  cadence: string;
  amount: number;
  lastDate: string;
  nextDate: string;
  count: number;
  moved: boolean;
  movedAt: string | null;
}

export interface SwitchKit {
  items: SwitchItem[];
  moved: number;
  total: number;
  next: string | null;
}

export interface TrackTask {
  id: string;
  week: number;
  title: string;
  why: string;
  auto: boolean;
  done: boolean;
  doneAt: string | null;
}

export interface Track {
  id: "newcomers" | "students";
  title: string;
  subtitle: string;
  levels: string[];
  level: string;
  index: number;
  done: number;
  total: number;
  next: string | null;
  tasks: TrackTask[];
}

export interface YearReceipt {
  year: string;
  charged: number;
  lines: { id: string; kind: LeakKind; title: string; amount: number; fixed: boolean }[];
  fixedCount: number;
  fixedAmount: number;
}

export interface RateBlock {
  goal: number;
  pledged: boolean;
  pool: { id: string; joined: number; joinedAt: string } | null;
  renewalQuarter: string | null;
  status: "coming_2027";
}
