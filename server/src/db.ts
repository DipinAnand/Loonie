import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import type { LeakKind, Verdict } from "./engine/types.js";

/**
 * What Looni keeps. No raw transactions, balances or descriptors: those are
 * fetched from Plaid into memory for each scan and thrown away. See SECURITY.md.
 */
export const db = new DatabaseSync(config.databasePath);

const SCHEMA_VERSION = 2;

db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;");

// v1 (first MVP) stored raw transactions and balances. Drop them rather than migrate.
if ((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version < SCHEMA_VERSION) {
  db.exec(`
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS labels;
    DROP TABLE IF EXISTS leaks;
    DROP TABLE IF EXISTS scans;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS users;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,
    wrapped_dek      TEXT NOT NULL,              -- per-user key, sealed by the master key
    subject_enc      TEXT NOT NULL,              -- training-data pseudonym, sealed with the user's key
    consent_training INTEGER NOT NULL DEFAULT 0,
    consent_version  TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    item_id           TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_enc  TEXT NOT NULL,             -- sealed by the master key, AAD = item id
    institution_enc   TEXT,                      -- sealed with the user's key
    status            TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'login_required', 'revoked')),
    status_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_scanned_at   TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The leak ledger: one row per finding, tracked across scans.
  CREATE TABLE IF NOT EXISTS leaks (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leak_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    resolved_at TEXT,
    verdict     TEXT CHECK (verdict IN ('confirmed', 'dismissed')),
    verdict_at  TEXT,
    payload_enc TEXT NOT NULL,                   -- title, detail, merchant, amounts, history: user's key
    PRIMARY KEY (user_id, leak_id)
  );

  CREATE TABLE IF NOT EXISTS scans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ran_at      TEXT NOT NULL DEFAULT (datetime('now')),
    complete    INTEGER NOT NULL,                -- 0 when a connection failed (ledger not resolved)
    summary_enc TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS scans_user ON scans(user_id, ran_at);

  -- De-identified, consented training rows. Deliberately no user_id and no
  -- foreign key: the only link back is subject_enc, destroyed with the user.
  CREATE TABLE IF NOT EXISTS training_labels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id      TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    leak_kind       TEXT NOT NULL,
    verdict         TEXT NOT NULL CHECK (verdict IN ('confirmed', 'dismissed')),
    features        TEXT NOT NULL,
    created_on      TEXT NOT NULL DEFAULT (date('now'))
  );
`);
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

// ---- users ------------------------------------------------------------------

export interface UserRow {
  id: string;
  wrapped_dek: string;
  subject_enc: string;
  consent_training: number;
  consent_version: string | null;
}

export function getUser(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function insertUser(id: string, wrappedDek: string, subjectEnc: string): void {
  db.prepare("INSERT OR IGNORE INTO users (id, wrapped_dek, subject_enc) VALUES (?, ?, ?)").run(id, wrappedDek, subjectEnc);
}

export function setConsent(id: string, training: boolean, version: string): void {
  db.prepare("UPDATE users SET consent_training = ?, consent_version = ? WHERE id = ?").run(training ? 1 : 0, version, id);
}

/** Cascades to items, leaks and scans. The wrapped DEK goes with the row. */
export function deleteUserRow(id: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function allUserIds(): string[] {
  return (db.prepare("SELECT id FROM users").all() as { id: string }[]).map((r) => r.id);
}

// ---- items ------------------------------------------------------------------

export type ItemStatus = "healthy" | "login_required" | "revoked";

export interface ItemRow {
  item_id: string;
  user_id: string;
  access_token_enc: string;
  institution_enc: string | null;
  status: ItemStatus;
  last_scanned_at: string | null;
}

export function insertItem(row: { item_id: string; user_id: string; access_token_enc: string; institution_enc: string | null }): void {
  db.prepare(
    `INSERT INTO items (item_id, user_id, access_token_enc, institution_enc) VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc, status = 'healthy'`,
  ).run(row.item_id, row.user_id, row.access_token_enc, row.institution_enc);
}

export function itemsForUser(userId: string): ItemRow[] {
  return db.prepare("SELECT * FROM items WHERE user_id = ? ORDER BY created_at").all(userId) as unknown as ItemRow[];
}

export function getItem(itemId: string): ItemRow | undefined {
  return db.prepare("SELECT * FROM items WHERE item_id = ?").get(itemId) as ItemRow | undefined;
}

export function setItemStatus(itemId: string, status: ItemStatus): void {
  db.prepare(
    "UPDATE items SET status = ?, status_updated_at = datetime('now') WHERE item_id = ? AND status != ?",
  ).run(status, itemId, status);
}

export function markItemScanned(itemId: string): void {
  db.prepare("UPDATE items SET last_scanned_at = datetime('now') WHERE item_id = ?").run(itemId);
}

export function deleteItem(itemId: string): void {
  db.prepare("DELETE FROM items WHERE item_id = ?").run(itemId);
}

// ---- leak ledger ------------------------------------------------------------

export interface LeakRow {
  user_id: string;
  leak_id: string;
  kind: LeakKind;
  status: "open" | "resolved";
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  verdict: Verdict | null;
  verdict_at: string | null;
  payload_enc: string;
}

export function leaksForUser(userId: string): LeakRow[] {
  return db.prepare("SELECT * FROM leaks WHERE user_id = ?").all(userId) as unknown as LeakRow[];
}

export function getLeak(userId: string, leakId: string): LeakRow | undefined {
  return db.prepare("SELECT * FROM leaks WHERE user_id = ? AND leak_id = ?").get(userId, leakId) as LeakRow | undefined;
}

export function upsertLeak(r: Omit<LeakRow, "verdict" | "verdict_at">): void {
  db.prepare(
    `INSERT INTO leaks (user_id, leak_id, kind, status, first_seen, last_seen, resolved_at, payload_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, leak_id) DO UPDATE SET
       status = excluded.status, last_seen = excluded.last_seen,
       resolved_at = excluded.resolved_at, payload_enc = excluded.payload_enc`,
  ).run(r.user_id, r.leak_id, r.kind, r.status, r.first_seen, r.last_seen, r.resolved_at, r.payload_enc);
}

export function resolveLeak(userId: string, leakId: string, on: string): void {
  db.prepare("UPDATE leaks SET status = 'resolved', resolved_at = ? WHERE user_id = ? AND leak_id = ?").run(on, userId, leakId);
}

export function setVerdict(userId: string, leakId: string, verdict: Verdict): void {
  db.prepare("UPDATE leaks SET verdict = ?, verdict_at = datetime('now') WHERE user_id = ? AND leak_id = ?").run(
    verdict,
    userId,
    leakId,
  );
}

// ---- scans ------------------------------------------------------------------

export function insertScan(userId: string, complete: boolean, summaryEnc: string): void {
  db.prepare("INSERT INTO scans (user_id, complete, summary_enc) VALUES (?, ?, ?)").run(userId, complete ? 1 : 0, summaryEnc);
}

export function scansForUser(userId: string, limit = 24): { ran_at: string; complete: number; summary_enc: string }[] {
  return db
    .prepare("SELECT ran_at, complete, summary_enc FROM scans WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as { ran_at: string; complete: number; summary_enc: string }[];
}

export function firstScanAt(userId: string): string | null {
  const row = db.prepare("SELECT MIN(ran_at) AS ran_at FROM scans WHERE user_id = ?").get(userId) as { ran_at: string | null };
  return row.ran_at;
}

// ---- training labels --------------------------------------------------------

export function insertTrainingLabel(r: {
  subjectId: string;
  consentVersion: string;
  leakKind: string;
  verdict: Verdict;
  features: Record<string, unknown>;
}): void {
  db.prepare(
    "INSERT INTO training_labels (subject_id, consent_version, leak_kind, verdict, features) VALUES (?, ?, ?, ?, ?)",
  ).run(r.subjectId, r.consentVersion, r.leakKind, r.verdict, JSON.stringify(r.features));
}
