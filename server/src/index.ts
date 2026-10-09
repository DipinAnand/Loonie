import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { Products } from "plaid";
import { assertConfig, config } from "./config.js";
import { allUserIds, deleteUserRow, getItem, insertItem, itemsForUser, setConsent, type UserRow } from "./db.js";
import { leakyScenarioSandboxConfig } from "./engine/scenario.js";
import { forgetDek, openAccessToken, sealAccessToken } from "./keys.js";
import { ensureUser, labelLeak, readReceipt, sealInstitution } from "./ledger.js";
import { log } from "./log.js";
import { plaid, plaidError } from "./plaid.js";
import { fetchAllForUser, runScan } from "./scan.js";
import { handlePlaidWebhook, verifyPlaidWebhook } from "./webhooks.js";

assertConfig();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true, plaidEnv: config.plaid.env });
});

// Webhooks need the raw body to check Plaid's signature, so they come before express.json().
app.post("/webhooks/plaid", express.raw({ type: "application/json", limit: "64kb" }), async (req, res) => {
  const body = req.body as Buffer;
  if (!(await verifyPlaidWebhook(body, req.header("plaid-verification")))) {
    res.status(401).end();
    return;
  }
  res.status(200).end(); // ack fast; Plaid retries slow endpoints
  handlePlaidWebhook(JSON.parse(body.toString("utf8"))).catch((err) => log.warn("webhook failed", { err }));
});

app.use(express.json({ limit: "16kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

// MVP identity: the app generates a random id on first launch and keeps it in
// SecureStore. Swap for real auth (Clerk/Supabase/Cognito) before production.
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AuthedRequest = Request & { user: UserRow };

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  const id = req.header("x-looni-user");
  if (!id || !USER_ID.test(id)) {
    res.status(401).json({ error: "Missing or invalid x-looni-user header" });
    return;
  }
  (req as AuthedRequest).user = await ensureUser(id.toLowerCase());
  next();
});

const userOf = (req: Request) => (req as AuthedRequest).user;

async function saveItem(user: UserRow, publicToken: string, institution?: { id?: string; name?: string }) {
  const { data } = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  insertItem({
    item_id: data.item_id,
    user_id: user.id,
    access_token_enc: await sealAccessToken(data.access_token, data.item_id),
    institution_enc: await sealInstitution(user, data.item_id, institution?.name),
  });
  const summary = await runScan(user.id, { waitForData: true });
  return { itemId: data.item_id, summary };
}

const linkTokenBase = (req: Request) => ({
  client_name: "Looni",
  language: "en",
  country_codes: config.plaid.countryCodes,
  user: { client_user_id: userOf(req).id },
  ...(config.plaid.webhookUrl ? { webhook: config.plaid.webhookUrl } : {}),
  ...(config.plaid.androidPackageName && req.body?.platform === "android" ? { android_package_name: config.plaid.androidPackageName } : {}),
  ...(config.plaid.redirectUri && req.body?.platform === "ios" ? { redirect_uri: config.plaid.redirectUri } : {}),
});

/** Records the user's choices from the consent screen. Training is opt-in. */
app.post("/api/consent", (req, res) => {
  const training = req.body?.training === true;
  setConsent(userOf(req).id, training, config.consentVersion);
  res.json({ ok: true, training, version: config.consentVersion });
});

/** Step 1 of Link: the app asks for a short-lived link_token. */
app.post("/api/link/token", async (req, res) => {
  const { data } = await plaid.linkTokenCreate({ ...linkTokenBase(req), products: config.plaid.products });
  res.json({ linkToken: data.link_token, expiration: data.expiration });
});

/** Update mode: re-opens Link for a broken connection (expired login, new consent). */
app.post("/api/link/update-token", async (req, res) => {
  const item = getItem(String(req.body?.itemId ?? ""));
  if (!item || item.user_id !== userOf(req).id) {
    res.status(404).json({ error: "Unknown connection" });
    return;
  }
  const { data } = await plaid.linkTokenCreate({
    ...linkTokenBase(req),
    access_token: await openAccessToken(item.access_token_enc, item.item_id),
  });
  res.json({ linkToken: data.link_token, expiration: data.expiration });
});

/** Step 2 of Link: swap the public_token for an access_token (kept server side, encrypted). */
app.post("/api/link/exchange", async (req, res) => {
  const { publicToken, institution } = req.body ?? {};
  if (typeof publicToken !== "string") {
    res.status(400).json({ error: "publicToken is required" });
    return;
  }
  res.json(await saveItem(userOf(req), publicToken, institution));
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
      options: {
        override_username: username,
        override_password: password ?? "pass_good",
        ...(config.plaid.webhookUrl ? { webhook: config.plaid.webhookUrl } : {}),
      },
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
    log.warn("custom sandbox user rejected, falling back to user_transactions_dynamic", plaidError(err)?.body ?? err);
    used = "dynamic";
    publicToken = (await create("user_transactions_dynamic")).data.public_token;
  }

  const { data: inst } = await plaid.institutionsGetById({ institution_id: institutionId, country_codes: config.plaid.countryCodes });
  res.json({ scenario: used, ...(await saveItem(userOf(req), publicToken, { id: institutionId, name: inst.institution.name })) });
});

/** Re-scan now: fetch from Plaid, analyze in memory, update the ledger. */
app.post("/api/scan", async (req, res) => {
  const summary = await runScan(userOf(req).id);
  res.json({ summary, receipt: await readReceipt(await ensureUser(userOf(req).id)) });
});

/** The Leak Receipt, read from the encrypted ledger. Works even while a bank connection is down. */
app.get("/api/receipt", async (req, res) => {
  res.json(await readReceipt(userOf(req)));
});

/**
 * Accounts and recent transactions, fetched live from Plaid for display.
 * Nothing from this response is written to the database.
 */
app.get("/api/transactions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { data, complete } = await fetchAllForUser(userOf(req).id);
  res.json({
    complete,
    accounts: data.flatMap((d) =>
      d.accounts.map((a) => ({
        account_id: a.account_id,
        name: a.official_name || a.name,
        mask: a.mask ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        current_balance: a.balances.current ?? null,
        available_balance: a.balances.available ?? null,
        currency: a.balances.iso_currency_code ?? null,
      })),
    ),
    transactions: data
      .flatMap((d) => d.txns)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),
  });
});

/** Confirm / dismiss a leak. Training rows only with consent, de-identified. */
app.post("/api/labels", async (req, res) => {
  const { leakId, verdict } = req.body ?? {};
  if (verdict !== "confirmed" && verdict !== "dismissed") {
    res.status(400).json({ error: "verdict must be 'confirmed' or 'dismissed'" });
    return;
  }
  if (!(await labelLeak(userOf(req), String(leakId), verdict))) {
    res.status(404).json({ error: "Unknown leak" });
    return;
  }
  res.json({ ok: true });
});

/**
 * Disconnect everything and delete the user. Plaid items are removed at Plaid,
 * then the user row (and with it the wrapped data key) is deleted, so any copy
 * of their findings left in a backup can no longer be decrypted.
 */
app.delete("/api/me", async (req, res) => {
  const user = userOf(req);
  for (const item of itemsForUser(user.id)) {
    try {
      await plaid.itemRemove({ access_token: await openAccessToken(item.access_token_enc, item.item_id) });
    } catch (err) {
      log.warn("itemRemove failed", { itemId: item.item_id, code: plaidError(err)?.body.error_code });
    }
  }
  deleteUserRow(user.id);
  forgetDek(user.wrapped_dek);
  res.json({ ok: true });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const p = plaidError(err);
  if (p) {
    res.status(p.status >= 500 ? 502 : 400).json(p.body);
    return;
  }
  log.error("unhandled", err);
  res.status(500).json({ error: "Internal error" });
});

// Fallback for missed webhooks: rescan everyone on a timer.
if (config.scanIntervalHours > 0) {
  setInterval(
    async () => {
      for (const id of allUserIds()) await runScan(id).catch((err) => log.warn("scheduled scan failed", { err }));
    },
    config.scanIntervalHours * 3_600_000,
  ).unref();
}

app.listen(config.port, "0.0.0.0", () => {
  log.info(`Looni API on http://localhost:${config.port} (Plaid ${config.plaid.env})`);
});
