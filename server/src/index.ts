import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { Products } from "plaid";
import { assertConfig, config } from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import {
  accountsForUser,
  deleteUser,
  ensureUser,
  insertItem,
  insertLabel,
  itemsForUser,
  latestVerdicts,
  transactionsForUser,
} from "./db.js";
import { buildLeakReceipt } from "./engine/receipt.js";
import { leakyScenarioSandboxConfig } from "./engine/scenario.js";
import type { Verdict } from "./engine/types.js";
import { plaid, plaidError } from "./plaid.js";
import { syncItem } from "./sync.js";

assertConfig();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, plaidEnv: config.plaid.env });
});

// MVP identity: the app generates a random id on first launch and keeps it in
// SecureStore. Swap for real auth (Clerk/Supabase/Cognito) before production.
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AuthedRequest = Request & { userId: string };

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const id = req.header("x-looni-user");
  if (!id || !USER_ID.test(id)) {
    res.status(401).json({ error: "Missing or invalid x-looni-user header" });
    return;
  }
  ensureUser(id);
  (req as AuthedRequest).userId = id;
  next();
});

const userId = (req: Request) => (req as AuthedRequest).userId;

async function saveItem(user: string, publicToken: string, institution?: { id?: string; name?: string }) {
  const { data } = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  insertItem({
    item_id: data.item_id,
    user_id: user,
    access_token_enc: encrypt(data.access_token),
    institution_id: institution?.id ?? null,
    institution_name: institution?.name ?? null,
  });
  const item = itemsForUser(user).find((i) => i.item_id === data.item_id)!;
  const sync = await syncItem(item, { waitForData: true });
  return { itemId: data.item_id, sync };
}

/** Step 1 of Link: the app asks for a short-lived link_token. */
app.post("/api/link/token", async (req, res) => {
  const { data } = await plaid.linkTokenCreate({
    client_name: "Looni",
    language: "en",
    country_codes: config.plaid.countryCodes,
    products: config.plaid.products,
    user: { client_user_id: userId(req) },
    ...(config.plaid.androidPackageName && req.body?.platform === "android"
      ? { android_package_name: config.plaid.androidPackageName }
      : {}),
    ...(config.plaid.redirectUri && req.body?.platform === "ios" ? { redirect_uri: config.plaid.redirectUri } : {}),
  });
  res.json({ linkToken: data.link_token, expiration: data.expiration });
});

/** Step 2 of Link: swap the public_token from onSuccess for an access_token (kept server side, encrypted). */
app.post("/api/link/exchange", async (req, res) => {
  const { publicToken, institution } = req.body ?? {};
  if (typeof publicToken !== "string") {
    res.status(400).json({ error: "publicToken is required" });
    return;
  }
  res.json(await saveItem(userId(req), publicToken, institution));
});

/**
 * Sandbox only: link a Plaid test bank without the Link UI (works in Expo Go,
 * simulators and CI). scenario "leaky" seeds a custom user with known leaks;
 * "dynamic" uses Plaid's user_transactions_dynamic realistic data.
 */
app.post("/api/sandbox/quick-link", async (req, res) => {
  if (config.plaid.env !== "sandbox") {
    res.status(404).end();
    return;
  }
  const scenario: "leaky" | "dynamic" = req.body?.scenario === "dynamic" ? "dynamic" : "leaky";
  const institutionId = config.plaid.sandboxInstitution;
  const create = (username: string, password?: string) =>
    plaid.sandboxPublicTokenCreate({
      institution_id: institutionId,
      initial_products: [Products.Transactions],
      options: { override_username: username, override_password: password ?? "pass_good" },
    });

  let used = scenario;
  let publicToken: string;
  try {
    const today = new Date().toISOString().slice(0, 10);
    publicToken =
      scenario === "leaky"
        ? (await create("user_custom", JSON.stringify(leakyScenarioSandboxConfig(today)))).data.public_token
        : (await create("user_transactions_dynamic")).data.public_token;
  } catch (err) {
    if (scenario !== "leaky") throw err;
    console.warn("Custom sandbox user rejected, falling back to user_transactions_dynamic:", plaidError(err)?.body ?? err);
    used = "dynamic";
    publicToken = (await create("user_transactions_dynamic")).data.public_token;
  }

  const { data: inst } = await plaid.institutionsGetById({
    institution_id: institutionId,
    country_codes: config.plaid.countryCodes,
  });
  res.json({ scenario: used, ...(await saveItem(userId(req), publicToken, { id: institutionId, name: inst.institution.name })) });
});

app.post("/api/transactions/sync", async (req, res) => {
  const results = [];
  for (const item of itemsForUser(userId(req))) results.push({ itemId: item.item_id, ...(await syncItem(item)) });
  res.json({ items: results });
});

app.get("/api/accounts", (req, res) => {
  res.json({ accounts: accountsForUser(userId(req)) });
});

app.get("/api/transactions", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ transactions: transactionsForUser(userId(req), limit) });
});

app.get("/api/receipt", (req, res) => {
  const user = userId(req);
  res.json(buildLeakReceipt(transactionsForUser(user), { verdicts: latestVerdicts(user) }));
});

/** Confirm / dismiss a leak. Append-only: this table is the Phase 2 training set. */
app.post("/api/labels", (req, res) => {
  const user = userId(req);
  const { leakId, verdict } = req.body ?? {};
  if (verdict !== "confirmed" && verdict !== "dismissed") {
    res.status(400).json({ error: "verdict must be 'confirmed' or 'dismissed'" });
    return;
  }
  const leak = buildLeakReceipt(transactionsForUser(user)).leaks.find((l) => l.id === leakId);
  if (!leak) {
    res.status(404).json({ error: "Unknown leak" });
    return;
  }
  insertLabel({
    userId: user,
    leakId,
    leakKind: leak.kind,
    merchantKey: leak.merchantKey,
    verdict: verdict as Verdict,
    features: { ...leak.features, annualImpact: leak.annualImpact },
  });
  res.json({ ok: true });
});

/** Disconnect everything and delete the user's data (PIPEDA: minimal retention, right to withdraw). */
app.delete("/api/me", async (req, res) => {
  const user = userId(req);
  for (const item of itemsForUser(user)) {
    try {
      await plaid.itemRemove({ access_token: decrypt(item.access_token_enc) });
    } catch (err) {
      console.warn("itemRemove failed", item.item_id, plaidError(err)?.body ?? err);
    }
  }
  deleteUser(user);
  res.json({ ok: true });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const p = plaidError(err);
  if (p) {
    res.status(p.status >= 500 ? 502 : 400).json(p.body);
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Looni API on http://localhost:${config.port} (Plaid ${config.plaid.env})`);
});
