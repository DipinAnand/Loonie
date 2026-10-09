import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM with a key id prefix and associated data (AAD).
 *
 *   <keyId>.<iv>.<tag>.<ciphertext>     (base64 parts)
 *
 * - The key id lets old ciphertexts keep decrypting after a key rotation.
 * - The AAD binds a ciphertext to where it belongs (e.g. "token:<itemId>"), so a
 *   value copied into another user's row fails to decrypt instead of leaking.
 */
export type Keyring = { current: string; keys: Map<string, Buffer> };

export function seal(keyring: Keyring, plaintext: string | Buffer, aad: string): string {
  const key = keyring.keys.get(keyring.current);
  if (!key) throw new Error(`Unknown key id ${keyring.current}`);
  return sealWith(keyring.current, key, plaintext, aad);
}

export function sealWith(keyId: string, key: Buffer, plaintext: string | Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [keyId, ...[iv, cipher.getAuthTag(), data].map((b) => b.toString("base64"))].join(".");
}

export function open(keyring: Keyring, payload: string, aad: string): Buffer {
  const keyId = payload.slice(0, payload.indexOf("."));
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`Unknown key id ${keyId}`);
  return openWith(key, payload, aad);
}

export function openWith(key: Buffer, payload: string, aad: string): Buffer {
  const [, iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Key id of a sealed payload (used to find values that still need re-encrypting after a rotation). */
export function keyIdOf(payload: string): string {
  return payload.slice(0, payload.indexOf("."));
}
