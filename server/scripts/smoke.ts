/**
 * Pre-recording check: `npm run smoke` (with `npm run dev` running in another terminal).
 *
 * Runs the whole demo path against Plaid Sandbox with a throwaway user:
 * leaky test account → scan → receipt → home → alerts, prints a checklist,
 * then deletes the user (and its Plaid item). Takes ~10–30 seconds.
 */
import { randomUUID } from "node:crypto";

const BASE = (process.env.SMOKE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
const user = randomUUID();
let failures = 0;

function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-looni-user": user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the Looni server at ${BASE}. Start it with "npm run dev" first.`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = json.error_code ? ` [${json.error_code}]` : "";
    const hint =
      json.error_code === "INVALID_API_KEYS"
        ? " Check PLAID_CLIENT_ID and PLAID_SECRET (use the Sandbox secret) in server/.env."
        : json.error_code === "INVALID_FIELD" && String(json.error).includes("country")
          ? " Canada may not be enabled on your Plaid account: set PLAID_COUNTRY_CODES=US."
          : res.status === 502 || res.status === 500
            ? " The server couldn't talk to Plaid. Check your internet connection and keys."
            : "";
    throw new Error(`${method} ${path} failed (${res.status})${code}: ${json.error ?? "unknown error"}.${hint}`);
  }
  return json as T;
}

type Leak = { kind: string; title: string; annualImpact: number };

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  const health = await call<{ plaidEnv: string }>("GET", "/health");
  check(health.plaidEnv === "sandbox", "Server is up and using Plaid Sandbox", health.plaidEnv);

  const started = Date.now();
  const link = await call<{ scenario: string; summary: { open: number } | null }>("POST", "/api/sandbox/quick-link", { scenario: "leaky" });
  check(link.scenario === "leaky", "Plaid accepted the leaky test account", link.scenario === "leaky" ? "" : "fell back to Plaid sample data; fewer leaks will show");
  check(!!link.summary, "Scan finished", `${((Date.now() - started) / 1000).toFixed(1)}s`);

  const receipt = await call<{ totalAnnualImpact: number; transactionCount: number; leaks: Leak[]; suspicious: Leak[] }>("GET", "/api/receipt");
  check(receipt.transactionCount > 0, "Transactions read from Plaid", `${receipt.transactionCount}`);
  check(receipt.leaks.length >= 5, "Leaks found", `${receipt.leaks.length}, $${receipt.totalAnnualImpact.toFixed(2)}/yr`);
  for (const kind of ["subscription", "fee", "price_hike", "duplicate"]) {
    check(receipt.leaks.some((l) => l.kind === kind), `  …including a ${kind.replace("_", " ")}`);
  }
  check(receipt.suspicious.length > 0, "Suspicious charge flagged", receipt.suspicious[0]?.title ?? "none");

  const home = await call<{ score: { score: number }; upcoming: { title: string; inDays: number }[]; hunt: { total: number } }>("GET", "/api/home");
  check(home.score.score >= 0, "Leak Score computed", `${home.score.score}`);
  check(home.upcoming.length > 0, "Renewal in 'Coming up'", home.upcoming.map((u) => `${u.title} in ${u.inDays}d`).join(", ") || "none");
  check(home.hunt.total > 0, "Weekly Leak Hunt has cards", `${home.hunt.total}`);

  const { alerts } = await call<{ alerts: { kind: string; title: string }[] }>("GET", "/api/alerts");
  check(alerts.length > 0, "Alerts created", alerts.map((a) => a.kind).join(", ") || "none");

  await call("DELETE", "/api/me");
  check(true, "Test user deleted (Plaid item removed)");
}

main()
  .catch(async (err: Error) => {
    failures++;
    console.log(`\n✗ ${err.message}`);
    await fetch(`${BASE}/api/me`, { method: "DELETE", headers: { "x-looni-user": user } }).catch(() => {});
  })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed.` : "\nAll good. Ready to record.");
    process.exit(failures ? 1 : 0);
  });
