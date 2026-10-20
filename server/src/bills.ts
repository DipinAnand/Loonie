import type { AccountBase } from "plaid";
import { billPrefsFor, getBillPlan, saveBillPlan, type UserRow } from "./db.js";
import { type BillPlan, billStatus, coverage } from "./engine/bills.js";
import { round2 } from "./engine/util.js";
import { perYear } from "./engine/recurring.js";
import { openForUser, sealForUser } from "./keys.js";

/** Reminder lead time when the user hasn't picked one. */
export const DEFAULT_REMIND_DAYS = 3;

export const saveBills = async (user: UserRow, plan: BillPlan) =>
  saveBillPlan(user.id, await sealForUser(user.id, user.wrapped_dek, plan, "bills"));

export async function readBills(user: UserRow): Promise<BillPlan | null> {
  const row = getBillPlan(user.id);
  return row ? openForUser<BillPlan>(user.id, user.wrapped_dek, row.payload_enc, "bills") : null;
}

/**
 * Money available to pay bills: chequing accounts if there are any, else all
 * deposit accounts. Read from the response in memory; never stored.
 */
export function spendableBalance(accounts: AccountBase[]): number | null {
  const deposit = accounts.filter((a) => a.type === "depository");
  const chequing = deposit.filter((a) => a.subtype === "checking");
  const pool = chequing.length ? chequing : deposit;
  const values = pool.map((a) => a.balances.available ?? a.balances.current).filter((v): v is number => typeof v === "number");
  return values.length ? round2(values.reduce((s, v) => s + v, 0)) : null;
}

/** The bill tracker screen: every bill with where it stands, paydays, and whether the balance covers what's due. */
export function billsView(plan: BillPlan, user: UserRow, today: string, balance: number | null) {
  const prefs = billPrefsFor(user.id);
  const hidden = new Set([...prefs.values()].filter((p) => p.hidden).map((p) => p.bill_id));
  const bills = plan.bills.map((b) => {
    const pref = prefs.get(b.id);
    return {
      ...b,
      ...billStatus(b, plan, today),
      hidden: hidden.has(b.id),
      remindDays: pref?.remind_days ?? DEFAULT_REMIND_DAYS,
    };
  });
  const shown = bills.filter((b) => !b.hidden);
  return {
    asOf: plan.asOf,
    today,
    bills,
    paydays: plan.paydays,
    coverage: coverage(plan, today, balance, hidden),
    monthlyTotal: round2(shown.reduce((s, b) => s + (b.amount * perYear(b.cadence)) / 12, 0)),
  };
}

export type BillsView = ReturnType<typeof billsView>;
