import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { type Keyring, open, openWith, seal, sealWith } from "./crypto.js";

/**
 * Key hierarchy
 *
 *   master key (KMS in production, MASTER_KEY in dev)
 *     ├── Plaid access tokens
 *     └── per-user data keys (DEKs), stored wrapped in users.wrapped_dek
 *           └── that user's findings, institution names, scan summaries
 *
 * Deleting a user deletes their wrapped DEK, which makes every value sealed
 * with it unreadable, including copies in database backups (crypto-shredding).
 */
export interface KeyProvider {
  /** Encrypts a secret (access token, DEK) under the master key. */
  wrap(plaintext: Buffer, aad: string): Promise<string>;
  unwrap(wrapped: string, aad: string): Promise<Buffer>;
}

/** Master key(s) from env. MASTER_KEY_ID names the current one; OLD_MASTER_KEYS="id:base64,..." still decrypt. */
export class LocalKeyProvider implements KeyProvider {
  private keyring: Keyring;

  constructor() {
    const keys = new Map<string, Buffer>([[config.masterKeyId, Buffer.from(config.masterKey, "base64")]]);
    for (const entry of config.oldMasterKeys) {
      const [id, b64] = entry.split(":");
      keys.set(id, Buffer.from(b64, "base64"));
    }
    this.keyring = { current: config.masterKeyId, keys };
  }

  async wrap(plaintext: Buffer, aad: string) {
    return seal(this.keyring, plaintext, aad);
  }

  async unwrap(wrapped: string, aad: string) {
    return open(this.keyring, wrapped, aad);
  }
}

/**
 * Production: the master key never leaves AWS KMS (ca-central-1). wrap/unwrap
 * become KMS Encrypt/Decrypt calls with EncryptionContext = { aad }, and IAM
 * limits Decrypt to the API's role. Not wired up in the MVP.
 */
export class KmsKeyProvider implements KeyProvider {
  async wrap(): Promise<string> {
    throw new Error("KMS key provider is not configured. Use KEY_PROVIDER=local for development.");
  }
  async unwrap(): Promise<Buffer> {
    throw new Error("KMS key provider is not configured. Use KEY_PROVIDER=local for development.");
  }
}

export const keyProvider: KeyProvider = config.keyProvider === "kms" ? new KmsKeyProvider() : new LocalKeyProvider();

// ---- Plaid access tokens ----------------------------------------------------

export const sealAccessToken = async (token: string, itemId: string) => keyProvider.wrap(Buffer.from(token), `token:${itemId}`);
export const openAccessToken = async (sealed: string, itemId: string) =>
  (await keyProvider.unwrap(sealed, `token:${itemId}`)).toString("utf8");

// ---- Per-user data keys -----------------------------------------------------

export async function newWrappedDek(userId: string): Promise<string> {
  return keyProvider.wrap(randomBytes(32), `dek:${userId}`);
}

// Unwrapped DEKs are cached briefly so a request doesn't hit KMS for every field.
// Keyed by the wrapped value itself, so a cached key can never be used for a different wrapped DEK.
const DEK_TTL_MS = 5 * 60_000;
const dekCache = new Map<string, { dek: Buffer; expires: number }>();

async function dekFor(userId: string, wrappedDek: string): Promise<Buffer> {
  const hit = dekCache.get(wrappedDek);
  if (hit && hit.expires > Date.now()) return hit.dek;
  const dek = await keyProvider.unwrap(wrappedDek, `dek:${userId}`);
  dekCache.set(wrappedDek, { dek, expires: Date.now() + DEK_TTL_MS });
  return dek;
}

/** Drops (and zeroes) the cached plaintext key, e.g. when the user is deleted. */
export function forgetDek(wrappedDek: string): void {
  dekCache.get(wrappedDek)?.dek.fill(0);
  dekCache.delete(wrappedDek);
}

/** Seals JSON with the user's own key. `purpose` goes into the AAD (e.g. "leak:<id>"). */
export async function sealForUser(userId: string, wrappedDek: string, value: unknown, purpose: string): Promise<string> {
  return sealWith("u1", await dekFor(userId, wrappedDek), JSON.stringify(value), `${purpose}:${userId}`);
}

export async function openForUser<T>(userId: string, wrappedDek: string, sealed: string, purpose: string): Promise<T> {
  return JSON.parse(openWith(await dekFor(userId, wrappedDek), sealed, `${purpose}:${userId}`).toString("utf8")) as T;
}
