import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLeakReceipt } from "../engine/receipt.js";
import { mergeStatements, parseDate, parseMoney, parseStatement, sniffDelimiter, StatementError } from "./csv.js";

describe("money and dates", () => {
  it("reads Canadian and French money formats", () => {
    assert.equal(parseMoney("1,234.50"), 1234.5);
    assert.equal(parseMoney("(16.95)"), -16.95);
    assert.equal(parseMoney("-48.00"), -48);
    assert.equal(parseMoney("12,50"), 12.5);
    assert.equal(parseMoney("1 234,56 $"), 1234.56);
    assert.equal(parseMoney("45.00 CR"), -45);
    assert.ok(Number.isNaN(parseMoney("")));
  });
  it("reads ISO, compact, numeric and month-name dates", () => {
    assert.equal(parseDate("2026-03-12"), "2026-03-12");
    assert.equal(parseDate("20260312"), "2026-03-12");
    assert.equal(parseDate("03/12/2026"), "2026-03-12");
    assert.equal(parseDate("03/12/2026", true), "2026-12-03");
    assert.equal(parseDate("25/03/2026"), "2026-03-25"); // a value over 12 settles the order
    assert.equal(parseDate("Mar 12, 2026"), "2026-03-12");
    assert.equal(parseDate("12 mars 2026"), "2026-03-12");
    assert.equal(parseDate("1er févr. 2026"), "2026-02-01");
    assert.equal(parseDate("2026-02-30"), null);
  });
  it("sniffs the delimiter", () => {
    assert.equal(sniffDelimiter("Date;Description;Montant\n2026-01-01;X;1,00"), ";");
    assert.equal(sniffDelimiter("Date\tDescription\tAmount"), "\t");
    assert.equal(sniffDelimiter('Date,"Desc, with comma",Amount'), ",");
  });
});

describe("parseStatement", () => {
  it("reads a bank export with withdrawal and deposit columns", () => {
    const text = [
      "Account,Chequing 4821",
      "",
      "Date,Description,Withdrawals,Deposits,Balance",
      "2026-09-01,MONTHLY PLAN FEE,16.95,,1000.00",
      '2026-09-02,"PAYROLL DEPOSIT ACME",,2150.00,3150.00',
      "2026-09-03,VISA PAYMENT,500.00,,2650.00",
      "2026-09-04,NETFLIX.COM,16.49,,2633.51",
    ].join("\n");
    const p = parseStatement({ name: "chequing.csv", text });
    assert.equal(p.txns.length, 4);
    const byName = new Map(p.txns.map((t) => [t.name, t]));
    assert.equal(byName.get("MONTHLY PLAN FEE")?.amount, 16.95);
    assert.equal(byName.get("PAYROLL DEPOSIT ACME")?.amount, -2150);
    assert.equal(byName.get("PAYROLL DEPOSIT ACME")?.categoryPrimary, "INCOME");
    assert.equal(byName.get("VISA PAYMENT")?.categoryPrimary, "TRANSFER_OUT");
  });

  it("treats positive amounts as spending on a card export", () => {
    const text = ["Transaction Date,Merchant,Amount", "03/14/2026,SPOTIFY,12.99", "03/15/2026,UBER EATS,31.20", "03/18/2026,SHOPPERS DRUG MART,22.10", "03/20/2026,PAYMENT - THANK YOU,-500.00"].join("\n");
    const p = parseStatement({ name: "visa.csv", text });
    assert.ok(p.spendPositive);
    assert.equal(p.txns.find((t) => t.name === "SPOTIFY")?.amount, 12.99);
    assert.equal(p.txns.find((t) => t.name.startsWith("PAYMENT"))?.categoryPrimary, "TRANSFER_IN");
  });

  it("reads a headerless French export with semicolons and comma decimals", () => {
    const text = ["12/03/2026;FRAIS MENSUELS;-16,95", "13/03/2026;EPICERIE METRO;-54,20", "15/03/2026;DEPOT PAIE;2150,00"].join("\n");
    const p = parseStatement({ name: "desjardins.txt", text });
    assert.deepEqual(
      p.txns.map((t) => [t.date, t.amount]),
      [
        ["2026-03-12", 16.95],
        ["2026-03-13", 54.2],
        ["2026-03-15", -2150],
      ],
    );
  });

  it("refuses formats it can't read", () => {
    assert.throws(() => parseStatement({ name: "statement.pdf", text: "" }), StatementError);
    assert.throws(() => parseStatement({ name: "empty.csv", text: "Date,Description,Amount\n" }), StatementError);
  });

  it("counts a row exported in two overlapping files once, but keeps real same-day repeats", () => {
    const a = parseStatement({ name: "aug.csv", text: "Date,Description,Amount\n2026-08-30,COFFEE,-4.50\n2026-08-30,COFFEE,-4.50\n2026-08-31,BOOKS,-20.00" });
    const b = parseStatement({ name: "sep.csv", text: "Date,Description,Amount\n2026-08-31,BOOKS,-20.00\n2026-09-01,LUNCH,-12.00" });
    assert.equal(mergeStatements([a, b]).length, 4);
  });
});

describe("statement → Leak Receipt (the site's sample year)", () => {
  // 12 months of: $16.95 plan fee, streaming $16.99 → $19.99 from March 2026, two $48 NSF fees, a duplicated $64.20 restaurant charge.
  const rows = ["Date,Description,Amount"];
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(2025, 9 + m, 1)).toISOString().slice(0, 10);
    const d5 = new Date(Date.UTC(2025, 9 + m, 5)).toISOString().slice(0, 10);
    rows.push(`${d},MONTHLY PLAN FEE,-16.95`);
    rows.push(`${d5},STREAMCO MONTHLY,${d5 >= "2026-03-01" ? "-19.99" : "-16.99"}`);
    // Groceries: several trips a month at varying amounts (never a subscription).
    for (const day of [3, 11, 19, 26]) {
      rows.push(`${new Date(Date.UTC(2025, 9 + m, day)).toISOString().slice(0, 10)},LOBLAWS #1032,-${(40 + ((m * 7 + day) % 13) * 9.31).toFixed(2)}`);
    }
  }
  rows.push("2026-01-14,NSF FEE,-48.00", "2026-02-11,NSF FEE,-48.00", "2026-06-20,RESTAURANT LE MARCHE,-64.20", "2026-06-20,RESTAURANT LE MARCHE,-64.20");
  const p = parseStatement({ name: "year.csv", text: rows.join("\n") });
  const r = buildLeakReceipt(p.txns, { asOf: "2026-10-01" });
  const find = (pred: (l: (typeof r.leaks)[number]) => boolean) => r.leaks.find(pred);

  it("finds the plan fee, the pre-cap NSF fees, the price rise and the duplicate", () => {
    assert.ok(find((l) => l.features.feeType === "monthly_account_fee"));
    assert.equal(find((l) => l.features.feeType === "nsf")?.txnIds.length, 2);
    const hike = find((l) => l.kind === "price_hike")!;
    assert.equal(hike.features.delta, 3);
    assert.match(hike.detail, /since 2026-03-05\. 7 charges at the new price: \$21\.00 extra so far/);
    assert.ok(!find((l) => l.merchantKey.includes("loblaws")));
    assert.equal(find((l) => l.kind === "duplicate")?.annualImpact, 64.2);
  });
});
