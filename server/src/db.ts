import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import type { LeakKind, Verdict } from "./engine/types.js";

/**
 * What Looni keeps. No raw transactions, balances or descriptors: those are
 * fetched from Plaid into memory for each scan and thrown away. See SECURITY.md.
 */
export const db = new DatabaseSync(config.databasePath);

const SCHEMA_VERSION = 3;

db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;");

// v1 (first MVP) stored raw transactions and balances. Drop them rather than migrate.
if ((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version < SCHEMA_VERSION) {
  db.exec(`
    DROP TABLE IF EXISTS hunts;
    DROP TABLE IF EXISTS quest_progress;
    DROP TABLE IF EXISTS achievements;
    DROP TABLE IF EXISTS push_tokens;
    DROP TABLE IF EXISTS alerts;
    DROP TABLE IF EXISTS notification_log;
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
    timezone         TEXT NOT NULL DEFAULT 'America/Toronto',
    notify_settings  TEXT NOT NULL DEFAULT '{}',   -- preferences only, no financial data
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

  -- Weekly Leak Hunt: the cards chosen for a week, and when the user finished them.
  CREATE TABLE IF NOT EXISTS hunts (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week         TEXT NOT NULL,                  -- ISO week, e.g. 2026-W41
    leak_ids     TEXT NOT NULL,                  -- JSON array of leak ids (opaque hashes)
    completed_at TEXT,
    PRIMARY KEY (user_id, week)
  );

  CREATE TABLE IF NOT EXISTS quest_progress (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id     TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, quest_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge       TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    seen        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, badge)
  );

  CREATE TABLE IF NOT EXISTS push_tokens (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,                    -- dedupe without storing the token in clear
    token_enc  TEXT NOT NULL,                    -- sealed with the user's key
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, token_hash)
  );

  -- In-app alert inbox. Every alert lands here; only some are also pushed.
  CREATE TABLE IF NOT EXISTS alerts (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_key   TEXT NOT NULL,                   -- idempotency key, e.g. renew:<leakId>:<date>
    kind        TEXT NOT NULL,
    security    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    pushed_at   TEXT,
    read_at     TEXT,
    payload_enc TEXT NOT NULL,                   -- title/body/leak id, sealed with the user's key
    PRIMARY KEY (user_id, alert_key)
  );
  CREATE INDEX IF NOT EXISTS alerts_user_time ON alerts(user_id, created_at);

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
  timezone: string;
  notify_settings: string;
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

export function setTimezone(id: string, tz: string): void {
  db.prepare("UPDATE users SET timezone = ? WHERE id = ?").run(tz, id);
}

export function setNotifySettings(id: string, json: string): void {
  db.prepare("UPDATE users SET notify_settings = ? WHERE id = ?").run(json, id);
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

// ---- engagement --------------------------------------------------------------

export interface HuntRow {
  user_id: string;
  week: string;
  leak_ids: string;
  completed_at: string | null;
}

export function getHunt(userId: string, week: string): HuntRow | undefined {
  return db.prepare("SELECT * FROM hunts WHERE user_id = ? AND week = ?").get(userId, week) as HuntRow | undefined;
}

export function insertHunt(userId: string, week: string, leakIds: string[], completedAt: string | null): void {
  db.prepare("INSERT OR IGNORE INTO hunts (user_id, week, leak_ids, completed_at) VALUES (?, ?, ?, ?)").run(
    userId,
    week,
    JSON.stringify(leakIds),
    completedAt,
  );
}

export function completeHunt(userId: string, week: string, at: string): void {
  db.prepare("UPDATE hunts SET completed_at = ? WHERE user_id = ? AND week = ? AND completed_at IS NULL").run(at, userId, week);
}

export function completedHuntWeeks(userId: string): string[] {
  return (db.prepare("SELECT week FROM hunts WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as { week: string }[]).map(
    (r) => r.week,
  );
}

export function completedQuests(userId: string): Map<string, string> {
  const rows = db.prepare("SELECT quest_id, completed_at FROM quest_progress WHERE user_id = ?").all(userId) as {
    quest_id: string;
    completed_at: string;
  }[];
  return new Map(rows.map((r) => [r.quest_id, r.completed_at]));
}

export function completeQuest(userId: string, questId: string, at: string): boolean {
  return db.prepare("INSERT OR IGNORE INTO quest_progress (user_id, quest_id, completed_at) VALUES (?, ?, ?)").run(userId, questId, at)
    .changes > 0;
}

export function unlockedBadges(userId: string): { badge: string; unlocked_at: string; seen: number }[] {
  return db.prepare("SELECT badge, unlocked_at, seen FROM achievements WHERE user_id = ?").all(userId) as {
    badge: string;
    unlocked_at: string;
    seen: number;
  }[];
}

export function unlockBadge(userId: string, badge: string, at: string): boolean {
  return db.prepare("INSERT OR IGNORE INTO achievements (user_id, badge, unlocked_at) VALUES (?, ?, ?)").run(userId, badge, at).changes > 0;
}

export function markBadgesSeen(userId: string): void {
  db.prepare("UPDATE achievements SET seen = 1 WHERE user_id = ?").run(userId);
}

export function upsertPushToken(userId: string, tokenHash: string, tokenEnc: string): void {
  db.prepare("INSERT OR REPLACE INTO push_tokens (user_id, token_hash, token_enc) VALUES (?, ?, ?)").run(userId, tokenHash, tokenEnc);
}

export function pushTokensFor(userId: string): { token_hash: string; token_enc: string }[] {
  return db.prepare("SELECT token_hash, token_enc FROM push_tokens WHERE user_id = ?").all(userId) as {
    token_hash: string;
    token_enc: string;
  }[];
}

export function deletePushToken(userId: string, tokenHash: string): void {
  db.prepare("DELETE FROM push_tokens WHERE user_id = ? AND token_hash = ?").run(userId, tokenHash);
}

export interface AlertRow {
  user_id: string;
  alert_key: string;
  kind: string;
  security: number;
  created_at: string;
  pushed_at: string | null;
  read_at: string | null;
  payload_enc: string;
}

/** Returns false if this alert already exists (idempotent). */
export function insertAlert(r: { userId: string; key: string; kind: string; security: boolean; payloadEnc: string; at: string }): boolean {
  return (
    db
      .prepare("INSERT OR IGNORE INTO alerts (user_id, alert_key, kind, security, created_at, payload_enc) VALUES (?, ?, ?, ?, ?, ?)")
      .run(r.userId, r.key, r.kind, r.security ? 1 : 0, r.at, r.payloadEnc).changes > 0
  );
}

export function markAlertPushed(userId: string, key: string, at: string): void {
  db.prepare("UPDATE alerts SET pushed_at = ? WHERE user_id = ? AND alert_key = ?").run(at, userId, key);
}

export function countPushedSince(userId: string, since: string, security: boolean): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND pushed_at >= ? AND security = ?")
      .get(userId, since, security ? 1 : 0) as { n: number }
  ).n;
}

export function alertsFor(userId: string, limit = 50): AlertRow[] {
  return db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as unknown as AlertRow[];
}

export function markAlertsRead(userId: string, keys: string[] | "all", at: string): void {
  if (keys === "all") {
    db.prepare("UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(at, userId);
    return;
  }
  const stmt = db.prepare("UPDATE alerts SET read_at = ? WHERE user_id = ? AND alert_key = ? AND read_at IS NULL");
  for (const k of keys) stmt.run(at, userId, k);
}
