/**
 * Newcomer and student tracks: twelve tasks, one a week, in the order that
 * works (loonifinancial.com/newcomers and /students). The loon levels up as
 * tasks get done.
 */
export interface TrackTask {
  id: string;
  title: string;
  why: string;
  /** Done automatically from the ledger (e.g. "run the scan"), instead of by a tap. */
  auto?: "scanned" | "subscriptions_reviewed";
}

export interface Track {
  id: "newcomers" | "students";
  title: string;
  subtitle: string;
  levels: [string, string, string, string, string];
  tasks: TrackTask[];
}

export const TRACKS: Record<Track["id"], Track> = {
  newcomers: {
    id: "newcomers",
    title: "Your first 90 days of money in Canada",
    subtitle: "No credit history, fees nobody explained, limits nobody mentioned. Twelve tasks, one a week.",
    levels: ["Arrived", "Chick", "Diver", "Swimmer", "Golden Loon"],
    tasks: [
      { id: "no_fee_chequing", title: "Open a no-fee chequing account", why: "Newcomer packages waive fees for a year, then start charging. Note the date." },
      { id: "sin_cra", title: "Get your SIN and set up CRA My Account", why: "You need both to work, file taxes and get benefits like the GST/HST credit." },
      { id: "autodeposit", title: "Turn on e-Transfer autodeposit", why: "Money lands without security questions, and nobody can intercept it." },
      { id: "secured_card", title: "Get a secured or newcomer credit card", why: "It's how you start a Canadian credit history." },
      { id: "pay_in_full", title: "Pay the card in full, on time, twice", why: "On-time payments are the biggest part of your credit score. Paying in full costs $0 in interest." },
      { id: "credit_report", title: "Check your free credit report", why: "Equifax and TransUnion are free. Make sure your new file is right." },
      { id: "tfsa", title: "Open a TFSA", why: "Growth is tax-free. Room starts the year you become a resident and are 18 or older." },
      { id: "first_scan", title: "Find the fees on your first statement", why: "Looni reads it and shows every fee, with the line that proves it.", auto: "scanned" },
      { id: "starter_fund", title: "Save a $1,000 starter emergency fund", why: "A buffer keeps one surprise from turning into an NSF fee or card debt." },
      { id: "review_subscriptions", title: "Review subscriptions and price rises", why: "Trials turn into charges. Looni lists every recurring payment.", auto: "subscriptions_reviewed" },
      { id: "cdic", title: "Know what CDIC covers", why: "Up to $100,000 per insured category, per member bank." },
      { id: "waiver_reminder", title: "Set a reminder before your fee waiver ends", why: "Switch to a low-cost account ($4/month cap) or a no-fee bank before the first fee." },
    ],
  },
  students: {
    id: "students",
    title: "The student account that quietly expires",
    subtitle: "Free while you study, a fee account the month after you graduate. Looni flags the date and prepares the switch.",
    levels: ["Fresher", "Chick", "Diver", "Swimmer", "Golden Loon"],
    tasks: [
      { id: "expiry_date", title: "Find your student account's expiry date", why: "It usually converts to a fee account after graduation, with no warning." },
      { id: "expiry_reminder", title: "Set a reminder 60 days before it converts", why: "Time to compare and switch before the first fee." },
      { id: "no_fee_card", title: "Get a no-fee credit card and pay it in full", why: "Builds credit for your first apartment and phone plan, at no cost." },
      { id: "cra_file", title: "Set up CRA My Account and file, even at $0 income", why: "Filing unlocks the GST/HST credit and carries forward tuition credits." },
      { id: "autodeposit", title: "Turn on e-Transfer autodeposit", why: "Rent splits and refunds land automatically." },
      { id: "first_scan", title: "Run the free scan", why: "See every fee and subscription on one receipt.", auto: "scanned" },
      { id: "subscriptions", title: "Audit subscriptions and keep student discounts", why: "Student pricing ends at graduation. Know which ones will jump.", auto: "subscriptions_reviewed" },
      { id: "tfsa", title: "Open a TFSA with your first paycheque", why: "Room builds from 18, even if you don't use it yet." },
      { id: "nsf_cap", title: "Know the NSF cap", why: "Since March 12, 2026, an NSF fee at a federally regulated bank can't be more than $10." },
      { id: "credit_report", title: "Check your credit report", why: "Free from Equifax and TransUnion. Catch errors early." },
      { id: "buffer", title: "Build a one-month buffer in a high-interest savings account", why: "Covers the gap between student loans, jobs and rent." },
      { id: "grad_switch", title: "Plan the graduation switch and move your payments", why: "Looni's switch kit lists every payment and deposit so nothing bounces." },
    ],
  },
};

/** Level by tasks done: 0, 1–3, 4–7, 8–11, all 12. */
export function trackLevel(track: Track, done: number): { level: string; index: number } {
  const index = done >= track.tasks.length ? 4 : done >= 8 ? 3 : done >= 4 ? 2 : done >= 1 ? 1 : 0;
  return { level: track.levels[index], index };
}

export function trackView(track: Track, done: Map<string, string>, auto: { scanned: boolean; subscriptionsReviewed: boolean }) {
  const isDone = (t: TrackTask) =>
    done.has(t.id) || (t.auto === "scanned" && auto.scanned) || (t.auto === "subscriptions_reviewed" && auto.subscriptionsReviewed);
  const tasks = track.tasks.map((t, i) => ({
    id: t.id,
    week: i + 1,
    title: t.title,
    why: t.why,
    auto: !!t.auto,
    done: isDone(t),
    doneAt: done.get(t.id) ?? null,
  }));
  const count = tasks.filter((t) => t.done).length;
  return {
    id: track.id,
    title: track.title,
    subtitle: track.subtitle,
    levels: track.levels,
    ...trackLevel(track, count),
    done: count,
    total: tasks.length,
    next: tasks.find((t) => !t.done)?.id ?? null,
    tasks,
  };
}
