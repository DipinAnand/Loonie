import { CountryCode, Products } from "plaid";

function list(value: string | undefined, fallback: string): string[] {
  return (value || fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  databasePath: process.env.DATABASE_PATH || "./looni.db",
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || "",
    secret: process.env.PLAID_SECRET || "",
    env: (process.env.PLAID_ENV || "sandbox") as "sandbox" | "production",
    countryCodes: list(process.env.PLAID_COUNTRY_CODES, "US,CA") as CountryCode[],
    products: list(process.env.PLAID_PRODUCTS, "transactions") as Products[],
    sandboxInstitution: process.env.PLAID_SANDBOX_INSTITUTION || "ins_109508",
    // Android OAuth redirect needs the app package name; iOS OAuth needs a registered https redirect.
    androidPackageName: process.env.PLAID_ANDROID_PACKAGE_NAME || "",
    redirectUri: process.env.PLAID_REDIRECT_URI || "",
    // Public HTTPS URL of POST /webhooks/plaid (e.g. an ngrok tunnel in dev). Optional.
    webhookUrl: process.env.PLAID_WEBHOOK_URL || "",
  },
  keyProvider: (process.env.KEY_PROVIDER || "local") as "local" | "kms",
  masterKey: process.env.MASTER_KEY || "",
  masterKeyId: process.env.MASTER_KEY_ID || "k1",
  oldMasterKeys: list(process.env.OLD_MASTER_KEYS, ""),
  /** Rescan every user on a timer as a fallback for missed webhooks. 0 = off. */
  scanIntervalHours: Number(process.env.SCAN_INTERVAL_HOURS || 0),
  /** How often to check the ledger for alerts that need no new bank data (renewals, weekly hunt). 0 = off. */
  notifyIntervalMinutes: Number(process.env.NOTIFY_INTERVAL_MINUTES ?? 60),
  /** Bump when the consent text changes; stored with every training row. */
  consentVersion: "2026-10",
};

export function assertConfig(): void {
  const missing = [
    ["PLAID_CLIENT_ID", config.plaid.clientId],
    ["PLAID_SECRET", config.plaid.secret],
    ...(config.keyProvider === "local" ? [["MASTER_KEY", config.masterKey]] : []),
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}. Copy server/.env.example to server/.env and fill it in.`);
  }
  if (config.keyProvider === "local" && Buffer.from(config.masterKey, "base64").length !== 32) {
    throw new Error("MASTER_KEY must be 32 bytes, base64 encoded.");
  }
  if (config.masterKeyId.includes(".") || config.masterKeyId.includes(":")) {
    throw new Error("MASTER_KEY_ID may not contain '.' or ':'.");
  }
}
