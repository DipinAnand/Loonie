import { detectRecurring } from "./recurring.js";
import type { Cadence, Txn } from "./types.js";
import { stableId } from "./util.js";

/**
 * The switch kit: every recurring deposit and pre-authorized payment, so that
 * moving to a better account bounces nothing. Canada has no one-click account
 * switch, so the order matters: point deposits at the new account first, then
 * move payments, earliest next charge first.
 */
export interface SwitchItem {
  /** Opaque, stable across scans (a hash of direction + merchant). */
  key: string;
  name: string;
  direction: "deposit" | "payment";
  cadence: Cadence;
  amount: number;
  lastDate: string;
  nextDate: string;
  count: number;
  accountId: string | null;
}

export function detectSwitchItems(txns: Txn[], asOf: string): SwitchItem[] {
  const settled = txns.filter((t) => !t.pending);
  const accountOf = new Map(settled.map((t) => [t.id, t.accountId]));
  // Deposits run through the same cadence detector as payments, sign flipped.
  const deposits = detectRecurring(
    settled.filter((t) => t.amount < 0).map((t) => ({ ...t, amount: -t.amount })),
    asOf,
    { includeNonSpend: true },
  );
  const payments = detectRecurring(
    settled.filter((t) => t.amount > 0),
    asOf,
    { includeNonSpend: true },
  );

  const toItem = (direction: SwitchItem["direction"]) => (s: (typeof payments)[number]): SwitchItem => ({
    key: stableId("switch", direction, s.merchantKey),
    name: s.displayName,
    direction,
    cadence: s.cadence,
    amount: s.lastAmount,
    lastDate: s.lastDate,
    nextDate: s.nextExpectedDate,
    count: s.count,
    accountId: accountOf.get(s.txnIds[s.txnIds.length - 1]) ?? null,
  });

  const byNext = (a: SwitchItem, b: SwitchItem) => a.nextDate.localeCompare(b.nextDate);
  return [
    ...deposits.filter((s) => s.active).map(toItem("deposit")).sort(byNext),
    ...payments.filter((s) => s.active).map(toItem("payment")).sort(byNext),
  ];
}
