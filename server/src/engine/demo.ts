// Prints the Leak Receipt for the built-in leaky scenario: `npm run demo:receipt`
import { detectSuspicious } from "./anomaly.js";
import { buildLeakReceipt } from "./receipt.js";
import { leakyScenario } from "./scenario.js";
import { toDay } from "./util.js";

const asOf = new Date().toISOString().slice(0, 10);
const txns = leakyScenario(asOf).map((t, i) => ({ id: `t${i}`, accountId: "demo", date: t.date, amount: t.amount, name: t.description }));
const receipt = buildLeakReceipt(txns, { asOf });
const suspicious = detectSuspicious(txns, { asOf, lookbackDays: 7 });

console.log(`\nLEAK RECEIPT  (${receipt.windowStart} → ${receipt.windowEnd}, ${receipt.transactionCount} txns)\n`);
for (const l of receipt.leaks) console.log(`${l.kind.padEnd(13)} ${("$" + l.annualImpact.toFixed(2)).padStart(10)}/yr  ${l.title}\n${" ".repeat(30)}${l.detail}`);
console.log(`\nTOTAL ${("$" + receipt.totalAnnualImpact.toFixed(2)).padStart(10)}/yr\n`);

console.log("SUSPICIOUS");
for (const s of suspicious) console.log(`  ${s.title}: ${s.detail}`);

console.log("\nCOMING UP (next 14 days)");
for (const l of receipt.leaks) {
  const next = l.meta?.nextExpectedDate;
  const days = next ? toDay(next) - toDay(asOf) : -1;
  if (next && days >= 0 && days <= 14) console.log(`  ${l.title} on ${next} (in ${days} day${days === 1 ? "" : "s"})`);
}
console.log();
