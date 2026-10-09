# Looni data security

**Principle: Plaid is the source of truth. Looni keeps a ledger of findings, not a copy of anyone's bank history.**

Every scan reads the user's transactions from Plaid into memory, runs the leak engine, writes the *findings* to an
encrypted ledger and drops the raw data. While a connection is healthy, Plaid can return 12–24 months of history at any
time, so Looni never needs its own copy. The ledger exists for the cases where Plaid can't answer, because connections
do break (an expired bank login, revoked consent, a bank outage). When that happens the user still sees their receipt
and savings history, and the app asks them to reconnect.

## What we store

| Data | Stored? | Where / how | Deleted when |
| --- | --- | --- | --- |
| Bank username / password | **Never** | Entered in Plaid Link only | n/a |
| Raw transactions, descriptors, balances | **Never** | In memory during a scan or a live `/api/transactions` call | End of request |
| Plaid access token | Yes | `items.access_token_enc`: AES-256-GCM under the master key, bound to its item id | User disconnects (also revoked at Plaid via `/item/remove`) |
| Institution name | Yes | `items.institution_enc`: user's own key | User disconnects |
| Leak findings (title, merchant, amounts, that leak's own charge dates) | Yes | `leaks.payload_enc`: user's own key | User disconnects (crypto-shredded) |
| Leak status, kind, first/last seen, verdict | Yes, plaintext | `leaks` | User disconnects |
| Scan summaries (total, counts) | Yes | `scans.summary_enc`: user's own key | User disconnects |
| Training examples | Only with opt-in consent | `training_labels`: merchant key, cadence, *amount ranges*, kind, verdict, consent version. Keyed by a random `subject_id`, **no user id** | Kept: it can't be linked to anyone once the user is deleted |
| Logs | Minimal | Tokens masked; names, descriptions, amounts, balances and accounts are dropped (`server/src/log.ts`) | Log retention policy |

The SQLite file in development and the managed Postgres database in production hold no readable transaction data.
`server/src/security.test.ts` checks this by searching the raw database file for merchant names and tokens.

## Key hierarchy (envelope encryption)

```
Master key (AWS KMS, ca-central-1, in production; MASTER_KEY in dev)
 ├─ Plaid access tokens            AAD = "token:<itemId>"
 └─ Per-user data keys (DEKs)      AAD = "dek:<userId>", stored wrapped in users.wrapped_dek
      └─ that user's findings, institution names, scan summaries, training pseudonym
                                    AAD = "<purpose>:<userId>"
```

- **AES-256-GCM** everywhere, with a fresh 96-bit IV per value. The authentication tag means tampering is detected,
  not silently decrypted.
- **AAD (associated data) binds each ciphertext to where it belongs.** A token or finding copied into another row,
  item or user fails to decrypt.
- **Key ids** are stored with every ciphertext (`k1.<iv>.<tag>.<data>`). To rotate the master key:
  1. Set a new `MASTER_KEY` and `MASTER_KEY_ID`.
  2. Move the old key to `OLD_MASTER_KEYS="k1:<base64>"`.
  3. Re-wrap tokens and DEKs in the background.
  4. Retire the old key.
- **Crypto-shredding:** deleting a user deletes their wrapped DEK. Every value sealed with it is then unreadable,
  including copies in database backups, which can't otherwise be edited.
- In production the master key never leaves KMS. IAM allows `kms:Decrypt` only for the API's runtime role, and every
  use is logged in CloudTrail. `KmsKeyProvider` in `server/src/keys.ts` is the integration point.

## Freshness without hoarding

- **Plaid webhooks** (`POST /webhooks/plaid`):
  - The signature is verified on every request: an ES256 JWT signed by Plaid, issued less than 5 minutes ago, and
    containing a SHA-256 of the exact request body (`server/src/webhooks.ts`).
  - `SYNC_UPDATES_AVAILABLE` triggers a rescan.
  - `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION` and `PENDING_DISCONNECT` mark the connection `login_required`; the app
    shows a banner and reopens Plaid Link in update mode.
  - `USER_PERMISSION_REVOKED` marks the connection `revoked`.
- **Pull to refresh** runs the same scan.
- **`SCAN_INTERVAL_HOURS`** is a timer fallback for missed webhooks.
- **A leak is marked resolved only after a scan in which every connection succeeded.** If one bank is down, a missing
  subscription is treated as missing data, not as a cancellation.

## Other controls

- **Read-only Plaid products:** transactions only. Looni can't move money.
- **API hardening:**
  - helmet security headers, HSTS included.
  - A rate limit of 120 requests per minute per IP on `/api`.
  - Request bodies capped at 16 KB.
  - The sandbox quick-link returns 404 outside sandbox.
- **Deletion:** `DELETE /api/me` removes every Plaid item at Plaid, deletes the user row and cascades to the
  connections, ledger and scans. The wrapped key goes with the row, and the in-memory copy of the key is zeroed.
- **Consent:** training examples are opt-in on the consent screen, versioned (`consentVersion` in `server/src/config.ts`), and written only for
  users who opted in.

## Before production (not done in the MVP)

- [ ] Real authentication (Clerk, Supabase Auth or Cognito) replaces the anonymous `x-looni-user` device id.
- [ ] `KEY_PROVIDER=kms` with a KMS key in `ca-central-1`; secrets in AWS Secrets Manager, not `.env`.
- [ ] Managed Postgres in `ca-central-1` with encryption at rest, private networking, TLS only, and point-in-time
      recovery. Move off the `node:sqlite` dev store.
- [ ] Register `PLAID_WEBHOOK_URL`; turn on Plaid's production OAuth redirect URIs.
- [ ] A per-user rate limit (after auth), audit logging of admin access, and alerts on decrypt failures.
- [ ] Privacy policy and a Quebec Law 25 privacy impact assessment (Canadian hosting keeps data in Canada). Name a
      privacy officer. Write a breach response runbook covering the PIPEDA breach reporting duty to the OPC.
- [ ] A penetration test before public launch.

## Reporting a vulnerability

Email the maintainers privately. Please don't open a public issue.
