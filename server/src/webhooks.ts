import { createHash, createPublicKey, type JsonWebKey, timingSafeEqual, verify } from "node:crypto";
import { getItem, setItemStatus } from "./db.js";
import { log } from "./log.js";
import { plaid } from "./plaid.js";
import { runScan, statusForPlaidError } from "./scan.js";

type KeyFetcher = (kid: string) => Promise<JsonWebKey & { expired_at?: number | null }>;

const keyCache = new Map<string, JsonWebKey & { expired_at?: number | null }>();

const plaidKeyFetcher: KeyFetcher = async (kid) => {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const { data } = await plaid.webhookVerificationKeyGet({ key_id: kid });
  const { kty, crv, x, y, expired_at } = data.key;
  const jwk = { kty, crv, x, y, expired_at };
  keyCache.set(kid, jwk);
  return jwk;
};

const MAX_AGE_SECONDS = 5 * 60;

/**
 * Verifies the Plaid-Verification JWT (ES256) on a webhook: signature by a
 * current Plaid key, issued within 5 minutes, and bound to this exact body.
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 */
export async function verifyPlaidWebhook(
  rawBody: Buffer,
  jwt: string | undefined,
  fetchKey: KeyFetcher = plaidKeyFetcher,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!jwt) return false;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

    const jwk = await fetchKey(header.kid);
    if (jwk.expired_at) return false;
    const { expired_at: _ignored, ...publicJwk } = jwk;
    const key = createPublicKey({ key: publicJwk as JsonWebKey, format: "jwk" });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    if (!ok) return false;

    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (typeof claims.iat !== "number" || nowSeconds - claims.iat > MAX_AGE_SECONDS) return false;

    const expected = Buffer.from(createHash("sha256").update(rawBody).digest("hex"));
    const claimed = Buffer.from(String(claims.request_body_sha256 ?? ""));
    return expected.length === claimed.length && timingSafeEqual(expected, claimed);
  } catch {
    return false;
  }
}

interface PlaidWebhook {
  webhook_type: string;
  webhook_code: string;
  item_id?: string;
  error?: { error_code?: string } | null;
}

/** Keeps findings fresh and connection status honest without storing any transactions. */
export async function handlePlaidWebhook(body: PlaidWebhook): Promise<void> {
  const item = body.item_id ? getItem(body.item_id) : undefined;
  if (!item) return;
  const { webhook_type: type, webhook_code: code } = body;

  if (type === "TRANSACTIONS" && (code === "SYNC_UPDATES_AVAILABLE" || code === "DEFAULT_UPDATE" || code === "INITIAL_UPDATE")) {
    runScan(item.user_id).catch((err) => log.warn("webhook scan failed", { itemId: item.item_id, err }));
    return;
  }
  if (type === "ITEM") {
    if (code === "ERROR") {
      const status = statusForPlaidError(body.error?.error_code);
      if (status) setItemStatus(item.item_id, status);
    } else if (code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT") {
      setItemStatus(item.item_id, "login_required");
    } else if (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED") {
      setItemStatus(item.item_id, "revoked");
    } else if (code === "LOGIN_REPAIRED") {
      setItemStatus(item.item_id, "healthy");
      runScan(item.user_id).catch((err) => log.warn("webhook scan failed", { itemId: item.item_id, err }));
    }
  }
}
