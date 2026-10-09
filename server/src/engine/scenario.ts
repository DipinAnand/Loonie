import { addDays } from "./util.js";

export interface ScenarioTxn {
  date: string;
  amount: number;
  description: string;
}

/**
 * A deterministic "leaky" Canadian chequing account: subscriptions (one with a
 * price hike), bilingual bank fees, an NSF, a double charge and ordinary noise.
 * Used by the unit tests and fed to Plaid Sandbox as a `user_custom` account so
 * the full pipeline (Plaid -> sync -> engine) can be exercised end to end.
 */
export function leakyScenario(asOf: string, months = 6): ScenarioTxn[] {
  const out: ScenarioTxn[] = [];
  const monthly = (day: number, fn: (m: number) => ScenarioTxn | null) => {
    for (let m = months - 1; m >= 0; m--) {
      const d = addDays(asOf, -(m * 30) - day);
      const t = fn(m);
      if (t) out.push({ ...t, date: d });
    }
  };

  monthly(3, () => ({ date: "", amount: 16.49, description: "NETFLIX.COM 866-579-7172 ON" }));
  monthly(8, (m) => ({ date: "", amount: m < 2 ? 12.99 : 10.99, description: "SPOTIFY P1A2B3C4D5" }));
  monthly(12, () => ({ date: "", amount: 64.99, description: "PAD GOODLIFE FITNESS #4471" }));
  monthly(15, () => ({ date: "", amount: 4.99, description: "APPLE.COM/BILL ICLOUD" }));
  monthly(1, () => ({ date: "", amount: 16.95, description: "FRAIS MENSUELS / MONTHLY FEE" }));
  monthly(20, (m) => (m % 2 === 0 ? { date: "", amount: 1.5, description: "INTERAC E-TRANSFER FEE" } : null));
  monthly(25, () => ({ date: "", amount: 1850, description: "RENT PAYMENT PROPERTY MGMT" }));

  // Payroll every two weeks (inflow -> ignored by leak rules).
  for (let d = 2; d < months * 30; d += 14) out.push({ date: addDays(asOf, -d), amount: -2150, description: "PAYROLL DEPOSIT ACME CORP" });

  // Ordinary spending at varying amounts (must NOT look recurring).
  const grocery = [87.12, 143.5, 62.3, 110.45, 95.01, 128.77, 71.2, 154.3];
  grocery.forEach((amt, i) => out.push({ date: addDays(asOf, -(i * 19 + 4)), amount: amt, description: "LOBLAWS #1032 TORONTO ON" }));

  out.push({ date: addDays(asOf, -40), amount: 48.0, description: "NSF FEE / FRAIS FONDS INSUFFISANTS" });
  out.push({ date: addDays(asOf, -22), amount: 3.5, description: "FOREIGN TRANSACTION FEE" });
  out.push({ date: addDays(asOf, -10), amount: 89.99, description: "SQ *BEST BUY ONLINE 4421" });
  out.push({ date: addDays(asOf, -9), amount: 89.99, description: "SQ *BEST BUY ONLINE 4421" });

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Plaid Sandbox `user_custom` password payload for the scenario above. */
export function leakyScenarioSandboxConfig(asOf: string) {
  return {
    override_accounts: [
      {
        type: "depository",
        subtype: "checking",
        starting_balance: 4200,
        meta: { name: "Looni Leaky Chequing", mask: "4242" },
        transactions: leakyScenario(asOf).map((t) => ({
          date_transacted: t.date,
          date_posted: t.date,
          amount: t.amount,
          description: t.description,
          currency: "CAD",
        })),
      },
    ],
  };
}
