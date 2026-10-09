import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { Products } from "plaid";
import { assertConfig, config } from "./config.js";
import {
  allUserIds,
  deletePushToken,
  deleteUserRow,
  getItem,
  getUser,
  insertItem,
  itemsForUser,
  markAlertsRead,
  markBadgesSeen,
  setConsent,
  setNotifySettings,
  setTimezone,
  upsertPushToken,
  completeQuest,
  completedQuests,
  type UserRow,
} from "./db.js";
import { NOT_ME_STEPS } from "./engine/anomaly.js";
import { currentHunt } from "./engagement/hunt.js";
import { hashToken, parseSettings } from "./engagement/notify.js";
import { isSelfReported } from "./engagement/quests.js";
import {
  alertInbox,
  badgesFor,
  homeFor,
  localToday,
  monthlyReport,
  notifyUser,
  questsFor,
  shareStatsFor,
  syncBadges,
} from "./engagement/service.js";
import { leakyScenarioSandboxConfig } from "./engine/scenario.js";
import { forgetDek, openAccessToken, sealAccessToken, sealForUser } from "./keys.js";
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

/**
 * Confirm / dismiss a leak. For suspicious charges, "confirmed" means "Not me"
 * and the response carries the steps to take. Training rows only with consent.
 */
app.post("/api/labels", async (req, res) => {
  const user = userOf(req);
  const { leakId, verdict } = req.body ?? {};
  if (verdict !== "confirmed" && verdict !== "dismissed") {
    res.status(400).json({ error: "verdict must be 'confirmed' or 'dismissed'" });
    return;
  }
  if (!(await labelLeak(user, String(leakId), verdict))) {
    res.status(404).json({ error: "Unknown leak" });
    return;
  }
  const today = localToday(user);
  const receipt = await readReceipt(user);
  const hunt = await currentHunt(user, today);
  const { newlyCompleted } = await questsFor(user, receipt, today, hunt.streak);
  const badges = syncBadges(user, receipt, today, hunt.streak);
  const suspicious = receipt.suspicious.find((l) => l.id === leakId);
  res.json({
    ok: true,
    notMeSteps: suspicious && verdict === "confirmed" ? NOT_ME_STEPS : undefined,
    hunt: { remaining: hunt.remaining, completed: hunt.completed, streak: hunt.streak },
    celebrate: { quests: newlyCompleted, badges },
  });
});

// ---- engagement ---------------------------------------------------------------

app.get("/api/home", async (req, res) => {
  res.json(await homeFor(userOf(req)));
});

app.get("/api/hunt", async (req, res) => {
  const user = userOf(req);
  res.json(await currentHunt(user, localToday(user)));
});

app.get("/api/quests", async (req, res) => {
  const user = userOf(req);
  const today = localToday(user);
  const hunt = await currentHunt(user, today);
  const { quests, newlyCompleted, questLoonies } = await questsFor(user, await readReceipt(user), today, hunt.streak);
  res.json({ quests, newlyCompleted, questLoonies });
});

/** Self-reported quests only ("I got the fee refunded"); auto quests complete from the ledger. */
app.post("/api/quests/:id/complete", async (req, res) => {
  const user = userOf(req);
  const id = String(req.params.id);
  const today = localToday(user);
  const hunt = await currentHunt(user, today);
  const { quests } = await questsFor(user, await readReceipt(user), today, hunt.streak);
  if (!isSelfReported(id) || !quests.some((q) => q.id === id) || completedQuests(user.id).has(id)) {
    res.status(400).json({ error: "This quest can't be completed manually right now" });
    return;
  }
  completeQuest(user.id, id, today);
  res.json({ ok: true });
});

app.get("/api/badges", async (req, res) => {
  res.json({ badges: await badgesFor(userOf(req)) });
});

app.post("/api/badges/seen", (req, res) => {
  markBadgesSeen(userOf(req).id);
  res.json({ ok: true });
});

app.get("/api/alerts", async (req, res) => {
  res.json({ alerts: await alertInbox(userOf(req)) });
});

app.post("/api/alerts/read", (req, res) => {
  const keys = req.body?.keys;
  markAlertsRead(userOf(req).id, Array.isArray(keys) ? keys.map(String).slice(0, 200) : "all", new Date().toISOString().replace("T", " ").slice(0, 19));
  res.json({ ok: true });
});

const PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;

app.post("/api/push-token", async (req, res) => {
  const user = userOf(req);
  const token = String(req.body?.token ?? "");
  if (!PUSH_TOKEN.test(token)) {
    res.status(400).json({ error: "Invalid Expo push token" });
    return;
  }
  upsertPushToken(user.id, hashToken(token), await sealForUser(user.id, user.wrapped_dek, token, "push"));
  res.json({ ok: true });
});

app.delete("/api/push-token", (req, res) => {
  deletePushToken(userOf(req).id, hashToken(String(req.body?.token ?? "")));
  res.json({ ok: true });
});

app.get("/api/settings/notifications", (req, res) => {
  const user = userOf(req);
  res.json({ ...parseSettings(user.notify_settings), timezone: user.timezone });
});

app.put("/api/settings/notifications", (req, res) => {
  const user = userOf(req);
  const body = req.body ?? {};
  if (typeof body.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: body.timezone });
      setTimezone(user.id, body.timezone);
    } catch {
      res.status(400).json({ error: "Unknown time zone" });
      return;
    }
  }
  const current = parseSettings(user.notify_settings);
  const hour = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : d);
  const next = {
    push: typeof body.push === "boolean" ? body.push : current.push,
    hideAmounts: typeof body.hideAmounts === "boolean" ? body.hideAmounts : current.hideAmounts,
    quietStart: hour(body.quietStart, current.quietStart),
    quietEnd: hour(body.quietEnd, current.quietEnd),
    kinds: Object.fromEntries(
      Object.entries(current.kinds).map(([k, v]) => [k, typeof body.kinds?.[k] === "boolean" ? body.kinds[k] : v]),
    ),
  };
  setNotifySettings(user.id, JSON.stringify(next));
  res.json({ ...next, timezone: getUser(user.id)!.timezone });
});

app.get("/api/share", async (req, res) => {
  res.json(await shareStatsFor(userOf(req)));
});

app.get("/api/report", async (req, res) => {
  const month = String(req.query.month ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ error: "month must be YYYY-MM" });
    return;
  }
  res.json(await monthlyReport(userOf(req), month));
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

// Ledger-only alert check (renewals, weekly hunt, monthly report): no Plaid calls.
if (config.notifyIntervalMinutes > 0) {
  setInterval(
    async () => {
      for (const id of allUserIds()) {
        const user = getUser(id);
        if (user) await notifyUser(user).catch((err) => log.warn("scheduled notify failed", { err }));
      }
    },
    config.notifyIntervalMinutes * 60_000,
  ).unref();
}

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
