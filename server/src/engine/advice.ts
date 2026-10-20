import type { Confidence, LeakKind } from "./types.js";
import { round2 } from "./util.js";

/** Bump when a rule changes what it finds; shown on every finding ("Rule v1.3"). */
export const ENGINE_VERSION = "1.3";

/** NSF fees on personal accounts at federally regulated banks: capped at $10 from this date. */
export const NSF_CAP_DATE = "2026-03-12";
export const NSF_CAP = 10;
/** Low-cost accounts: capped at $4/month since December 2025. */
export const LOW_COST_ACCOUNT_CAP = 4;
/** Typical Canadian card markup on purchases in another currency. */
export const FX_SPREAD = 0.025;

const money = (n: number) => `$${n.toFixed(2)}`;

export interface Advice {
  confidence: Confidence;
  fix: string;
  script?: string;
}

export interface AdviceInput {
  kind: LeakKind;
  /** Fee type for fee leaks (merchantKey), else the merchant. */
  key: string;
  displayName: string;
  /** Typical single charge. */
  amount: number;
  count: number;
  firstDate?: string;
  lastDate?: string;
  previousAmount?: number | null;
  /** For nsf_over_cap: total charged above the cap. */
  excess?: number;
  /** True when only Plaid's broad BANK_FEES category (no descriptor match) placed it. */
  weakMatch?: boolean;
}

/** What to do about a finding, and the words to use. Pure: the same input always gives the same text. */
export function adviceFor(i: AdviceInput): Advice {
  if (i.kind === "fee") return feeAdvice(i);
  if (i.kind === "subscription") {
    return {
      confidence: "medium",
      fix: `Still using ${i.displayName}? Cancel before the next charge, or switch to a cheaper plan.`,
    };
  }
  if (i.kind === "price_hike") {
    return {
      confidence: "medium",
      fix: "Ask for the old price, or a retention offer. Many companies say yes when you mention cancelling.",
      script: `I've been a customer${i.firstDate ? ` since ${monthYear(i.firstDate)}` : ""}. My price went from ${money(i.previousAmount ?? 0)} to ${money(i.amount)}. Can you put me back on the old price? Otherwise I'll cancel.`,
    };
  }
  if (i.kind === "duplicate") {
    return {
      confidence: "medium",
      fix: "Check your receipt. If you paid once, ask the merchant for a refund, or dispute it with your card issuer.",
      script: `I was charged ${money(i.amount)} twice${i.lastDate ? ` on ${i.lastDate}` : ""} for one purchase. Please refund the duplicate charge.`,
    };
  }
  return { confidence: "medium", fix: "Check this charge. If it wasn't you, call the number on the back of your card." };
}

function feeAdvice(i: AdviceInput): Advice {
  const high: Confidence = i.weakMatch ? "medium" : "high";
  switch (i.key) {
    case "monthly_account_fee":
      return {
        confidence: high,
        fix: `Low-cost accounts are capped at ${money(LOW_COST_ACCOUNT_CAP)}/month since December 2025. Some newcomers and students pay $0.`,
        script: `I've paid ${money(i.amount)} a month for ${i.count >= 12 ? "a year" : `${i.count} months`}. Can you move me to your low-cost account? It's capped at ${money(LOW_COST_ACCOUNT_CAP)}.`,
      };
    case "nsf_over_cap":
      return {
        confidence: "high",
        fix: `NSF fees on personal accounts at federally regulated banks are capped at ${money(NSF_CAP)} since March 12, 2026. Ask for the difference back in writing.`,
        script: `I was charged ${money(i.amount)} for an NSF${i.lastDate ? ` on ${i.lastDate}` : ""}. The cap is ${money(NSF_CAP)} since March 12, 2026. Please refund the ${money(i.excess ?? 0)} above the cap and confirm in writing.`,
      };
    case "nsf":
      return {
        confidence: high,
        fix: "Ask for a goodwill reversal, then turn on a low-balance alert so it doesn't happen again.",
        script: `I was charged an NSF fee of ${money(i.amount)}. I've been a customer in good standing. Can you reverse it as a one-time courtesy?`,
      };
    case "overdraft":
      return {
        confidence: high,
        fix: "Ask for a reversal, and compare overdraft protection fees with a low-balance alert.",
        script: `I was charged ${money(i.amount)} in overdraft fees. Can you reverse them, and what does overdraft protection cost on my account?`,
      };
    case "fx":
    case "fx_spread":
      return {
        confidence: i.key === "fx_spread" ? "medium" : high,
        fix: "Many cards add about 2.5% to purchases in another currency. A no-FX-fee card skips that markup.",
      };
    case "atm":
      return { confidence: high, fix: "Use your own bank's ATMs, or get cash back at the till." };
    case "transaction_fee":
      return {
        confidence: high,
        fix: "Most low-cost and no-fee accounts include e-Transfers and transactions. Ask which plan covers how you bank.",
        script: `I'm paying per-transaction fees. Which of your plans includes my transactions at no extra cost?`,
      };
    case "interest":
      return {
        confidence: high,
        fix: "Pay the full statement balance to stop interest. A lower-rate card or balance transfer can cut what you owe meanwhile.",
        script: `I'm carrying a balance. Can you lower my interest rate, or offer a balance transfer rate?`,
      };
    case "late":
      return {
        confidence: high,
        fix: "Ask for a one-time reversal and set up an automatic minimum payment.",
        script: `I was charged a late fee of ${money(i.amount)}. Can you waive it as a one-time courtesy? I've set up automatic payments.`,
      };
    case "annual_card_fee":
      return {
        confidence: high,
        fix: "If you don't use the card's perks, ask for a fee waiver or a downgrade to a no-fee card.",
        script: `I'm thinking of cancelling because of the ${money(i.amount)} annual fee. Can you waive it, or move me to a no-fee card?`,
      };
    default:
      return { confidence: "medium", fix: "Ask your bank what this fee is for, and whether it can be waived." };
  }
}

function monthYear(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Your bank's quiet score": a letter grade on what you're leaking per year. */
export function quietGrade(annualLeak: number): "A" | "B" | "C" | "D" {
  if (annualLeak < 50) return "A";
  if (annualLeak < 200) return "B";
  if (annualLeak < 500) return "C";
  return "D";
}

export interface NextMoveCandidate {
  id: string;
  kind: LeakKind;
  merchantKey: string;
  title: string;
  annualImpact: number;
  verdict: string | null;
  meta?: { fix?: string; script?: string; lastAmount?: number };
}

export interface NextMove {
  leakId: string;
  title: string;
  /** Dollars per year this move saves. */
  savesPerYear: number;
  fix: string;
  script: string | null;
}

/**
 * The single best thing to do next, ranked by dollars saved. Moving off a
 * monthly plan fee saves the fee minus the $4 low-cost cap, not the whole fee.
 */
export function nextMove(leaks: NextMoveCandidate[]): NextMove | null {
  const options = leaks
    .filter((l) => l.verdict !== "dismissed" && l.kind !== "suspicious")
    .map((l) => {
      let saves = l.annualImpact;
      let title = l.title;
      if (l.kind === "fee" && l.merchantKey === "monthly_account_fee") {
        saves = Math.max(0, l.annualImpact - LOW_COST_ACCOUNT_CAP * 12);
        title = `Ask for a low-cost account. It's capped at ${money(LOW_COST_ACCOUNT_CAP)}/mo.`;
      } else if (l.kind === "fee" && l.merchantKey === "nsf_over_cap") {
        title = "Ask for the NSF fees above the $10 cap back.";
      } else if (l.kind === "subscription") {
        title = `Cancel ${l.title.replace(/\s\((weekly|biweekly|monthly|quarterly|annual)\)$/, "")} if you don't use it.`;
      } else if (l.kind === "price_hike") {
        title = `Ask ${l.title.replace(/ raised its price$/, "")} for the old price.`;
      }
      return { l, saves: round2(saves), title };
    })
    .filter((o) => o.saves > 0)
    .sort((a, b) => b.saves - a.saves);
  const best = options[0];
  if (!best) return null;
  return {
    leakId: best.l.id,
    title: best.title,
    savesPerYear: best.saves,
    fix: best.l.meta?.fix ?? "",
    script: best.l.meta?.script ?? null,
  };
}
