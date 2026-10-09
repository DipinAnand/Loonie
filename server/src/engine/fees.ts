import type { Txn } from "./types.js";

export interface FeeRule {
  type: string;
  label: string;
  /** Plaid personal_finance_category.detailed values that map to this fee. */
  categories: string[];
  /** Descriptor patterns, English + French (Big-6 statements are bilingual). */
  patterns: RegExp[];
}

// Order matters: the first matching rule wins, so specific rules come before generic ones.
export const FEE_RULES: FeeRule[] = [
  {
    type: "nsf",
    label: "NSF / insufficient funds fees",
    categories: ["BANK_FEES_INSUFFICIENT_FUNDS"],
    patterns: [/\bnsf\b/i, /insufficient funds/i, /fonds insuffisants/i, /returned item/i, /\bi\/?f\b fee/i],
  },
  {
    type: "overdraft",
    label: "Overdraft fees & interest",
    categories: ["BANK_FEES_OVERDRAFT_FEES"],
    patterns: [/overdraft/i, /\bod (fee|interest|handling)\b/i, /d[ée]couvert/i],
  },
  {
    type: "monthly_account_fee",
    label: "Monthly account fees",
    categories: ["BANK_FEES_OTHER_BANK_FEES"],
    patterns: [
      /(monthly|account|plan|service|maintenance|package) (fee|charge)/i,
      /frais (mensuels|de service|d'administration|de compte|fixes)/i,
      /\bmthly fee\b/i,
    ],
  },
  {
    type: "fx",
    label: "Foreign exchange fees",
    categories: ["BANK_FEES_FOREIGN_TRANSACTION_FEES"],
    patterns: [/foreign (transaction|exchange|currency) fee/i, /\bfx fee\b/i, /frais de change/i, /conversion fee/i],
  },
  {
    type: "atm",
    label: "ATM fees",
    categories: ["BANK_FEES_ATM_FEES"],
    patterns: [/\batm\b.*\bfee\b/i, /\babm\b.*(fee|frais)/i, /network (access )?fee/i, /frais (de )?gab/i],
  },
  {
    type: "transaction_fee",
    label: "Per-transaction fees",
    categories: [],
    patterns: [/(e-?transfer|interac|transaction|txn|cheque|withdrawal) fee/i, /frais (de virement|d'opération|de transaction)/i],
  },
  {
    type: "interest",
    label: "Credit card interest",
    categories: ["BANK_FEES_INTEREST_CHARGE", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT_INTEREST"],
    patterns: [/(purchase|cash advance|card)? ?interest charge/i, /frais d'int[ée]r[êe]ts?/i, /\binterest\b(?! (paid|earned|credit))/i],
  },
  {
    type: "late",
    label: "Late payment fees",
    categories: ["BANK_FEES_LATE_FEES"],
    patterns: [/late (payment )?fee/i, /frais de retard/i],
  },
  {
    type: "annual_card_fee",
    label: "Annual card fees",
    categories: [],
    patterns: [/annual (card )?fee/i, /frais annuels/i, /membership fee/i],
  },
];

/** Returns the matching fee rule, or null. Only outflows can be fees. */
export function classifyFee(txn: Txn): FeeRule | null {
  if (txn.amount <= 0) return null;
  // Descriptor first: it is more specific than Plaid's category.
  for (const rule of FEE_RULES) {
    if (rule.patterns.some((p) => p.test(txn.name))) return rule;
  }
  if (txn.categoryDetailed) {
    for (const rule of FEE_RULES) {
      if (rule.categories.includes(txn.categoryDetailed)) return rule;
    }
  }
  if (txn.categoryPrimary === "BANK_FEES") {
    return FEE_RULES.find((r) => r.type === "monthly_account_fee")!;
  }
  return null;
}
