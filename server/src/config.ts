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
  },
  encryptionKey: process.env.ENCRYPTION_KEY || "",
};

export function assertConfig(): void {
  const missing = [
    ["PLAID_CLIENT_ID", config.plaid.clientId],
    ["PLAID_SECRET", config.plaid.secret],
    ["ENCRYPTION_KEY", config.encryptionKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}. Copy server/.env.example to server/.env and fill it in.`);
  }
  if (Buffer.from(config.encryptionKey, "base64").length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  }
}
