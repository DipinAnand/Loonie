// Prints the Leak Receipt for the built-in leaky scenario: `npm run demo:receipt`
import { buildLeakReceipt } from "./receipt.js";
import { leakyScenario } from "./scenario.js";

const asOf = new Date().toISOString().slice(0, 10);
const txns = leakyScenario(asOf).map((t, i) => ({ id: `t${i}`, accountId: "demo", date: t.date, amount: t.amount, name: t.description }));
const receipt = buildLeakReceipt(txns, { asOf });

console.log(`\nLEAK RECEIPT  (${receipt.windowStart} → ${receipt.windowEnd}, ${receipt.transactionCount} txns)\n`);
for (const l of receipt.leaks) console.log(`${l.kind.padEnd(13)} ${("$" + l.annualImpact.toFixed(2)).padStart(10)}/yr  ${l.title}\n${" ".repeat(30)}${l.detail}`);
console.log(`\nTOTAL ${("$" + receipt.totalAnnualImpact.toFixed(2)).padStart(10)}/yr\n`);
