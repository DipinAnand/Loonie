import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ForecastAccount, forecast, netWorth, occurrences } from "./forecast.js";
import type { SwitchItem } from "./switchkit.js";

const item = (over: Partial<SwitchItem>): SwitchItem => ({
  key: over.name ?? "k",
  name: "X",
  direction: "payment",
  cadence: "monthly",
  amount: 100,
  lastDate: "2026-09-27",
  nextDate: "2026-10-27",
  count: 6,
  accountId: "chq",
  ...over,
});

const accounts: ForecastAccount[] = [
  { id: "chq", name: "Chequing", type: "depository", subtype: "checking", balance: 3240, available: 3240 },
  { id: "sav", name: "Savings", type: "depository", subtype: "savings", balance: 8900, available: 8900 },
  { id: "visa", name: "Visa", type: "credit", subtype: "credit card", balance: 1180, available: null },
  { id: "inv", name: "TFSA + RRSP", type: "investment", subtype: "tfsa", balance: 18400, available: null },
  { id: "mtg", name: "Mortgage", type: "loan", subtype: "mortgage", balance: 412000, available: null },
];

describe("30-day forecast", () => {
  // Rent, hydro and daycare land on the 27th; payday is Nov 1.
  const items = [
    item({ name: "Rent", amount: 2400 }),
    item({ name: "Hydro", amount: 145 }),
    item({ name: "Daycare", amount: 1150 }),
    item({ name: "Payroll", direction: "deposit", amount: 2150, nextDate: "2026-11-01", cadence: "biweekly" }),
  ];
  const f = forecast(accounts, items, "2026-10-20")!;

  it("finds the day the chequing balance goes short, and by how much", () => {
    assert.equal(f.bounce?.date, "2026-10-27");
    assert.equal(f.bounce?.shortBy, 455);
    assert.deepEqual(f.bounce?.before, ["Rent", "Hydro", "Daycare"]);
    assert.equal(f.payday, "2026-11-01");
    assert.equal(f.safeToSpend, 0);
  });
  it("offers savings at another account to cover it", () => {
    assert.deepEqual(f.cover, { accountId: "sav", name: "Savings", amount: 455 });
  });
  it("has nothing to say without a chequing account", () => {
    assert.equal(forecast(accounts.filter((a) => a.id !== "chq"), items, "2026-10-20"), null);
  });
});

describe("occurrences", () => {
  it("steps monthly by calendar month and biweekly by 14 days", () => {
    assert.deepEqual(occurrences({ cadence: "monthly", nextDate: "2026-10-31" }, "2026-10-20", "2026-12-31"), ["2026-10-31", "2026-11-30", "2026-12-31"]);
    assert.deepEqual(occurrences({ cadence: "biweekly", nextDate: "2026-10-23" }, "2026-10-20", "2026-11-20"), ["2026-10-23", "2026-11-06", "2026-11-20"]);
  });
  it("counts a charge a few days late as due today", () => {
    assert.deepEqual(occurrences({ cadence: "monthly", nextDate: "2026-10-18" }, "2026-10-20", "2026-10-25"), ["2026-10-20"]);
  });
});

describe("net worth", () => {
  it("subtracts cards and loans from everything else", () => {
    assert.deepEqual(netWorth(accounts), { assets: 30540, debts: 413180, net: -382640 });
  });
});
