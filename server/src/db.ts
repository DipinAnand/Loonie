import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import type { Txn, Verdict } from "./engine/types.js";

export const db = new DatabaseSync(config.databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    item_id           TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_enc  TEXT NOT NULL,
    institution_id    TEXT,
    institution_name  TEXT,
    sync_cursor       TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    account_id        TEXT PRIMARY KEY,
    item_id           TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    mask              TEXT,
    type              TEXT,
    subtype           TEXT,
    current_balance   REAL,
    available_balance REAL,
    currency          TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id    TEXT PRIMARY KEY,
    account_id        TEXT NOT NULL,
    item_id           TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    date              TEXT NOT NULL,
    amount            REAL NOT NULL,
    name              TEXT NOT NULL,
    merchant_name     TEXT,
    category_primary  TEXT,
    category_detailed TEXT,
    pending           INTEGER NOT NULL DEFAULT 0,
    currency          TEXT
  );
  CREATE INDEX IF NOT EXISTS transactions_item_date ON transactions(item_id, date);

  -- Every confirm/dismiss is a training label for the Phase 2 models.
  CREATE TABLE IF NOT EXISTS labels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leak_id     TEXT NOT NULL,
    leak_kind   TEXT NOT NULL,
    merchant_key TEXT NOT NULL,
    verdict     TEXT NOT NULL CHECK (verdict IN ('confirmed', 'dismissed')),
    features    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS labels_user_leak ON labels(user_id, leak_id);
`);

export interface ItemRow {
  item_id: string;
  user_id: string;
  access_token_enc: string;
  institution_id: string | null;
  institution_name: string | null;
  sync_cursor: string | null;
}

export function ensureUser(userId: string): void {
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(userId);
}

export function insertItem(row: Omit<ItemRow, "sync_cursor">): void {
  db.prepare(
    `INSERT INTO items (item_id, user_id, access_token_enc, institution_id, institution_name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc`,
  ).run(row.item_id, row.user_id, row.access_token_enc, row.institution_id, row.institution_name);
}

export function itemsForUser(userId: string): ItemRow[] {
  return db.prepare("SELECT * FROM items WHERE user_id = ? ORDER BY created_at").all(userId) as unknown as ItemRow[];
}

export function setCursor(itemId: string, cursor: string): void {
  db.prepare("UPDATE items SET sync_cursor = ? WHERE item_id = ?").run(cursor, itemId);
}

export function deleteUser(userId: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export interface AccountRow {
  account_id: string;
  item_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  currency: string | null;
}

export function upsertAccount(a: AccountRow): void {
  db.prepare(
    `INSERT INTO accounts (account_id, item_id, name, mask, type, subtype, current_balance, available_balance, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       name = excluded.name, current_balance = excluded.current_balance,
       available_balance = excluded.available_balance, currency = excluded.currency`,
  ).run(a.account_id, a.item_id, a.name, a.mask, a.type, a.subtype, a.current_balance, a.available_balance, a.currency);
}

export function accountsForUser(userId: string): (AccountRow & { institution_name: string | null })[] {
  return db
    .prepare(
      `SELECT a.*, i.institution_name FROM accounts a JOIN items i ON i.item_id = a.item_id
       WHERE i.user_id = ? ORDER BY i.created_at, a.name`,
    )
    .all(userId) as unknown as (AccountRow & { institution_name: string | null })[];
}

export function upsertTransaction(itemId: string, t: Txn): void {
  db.prepare(
    `INSERT INTO transactions (transaction_id, account_id, item_id, date, amount, name, merchant_name,
       category_primary, category_detailed, pending, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(transaction_id) DO UPDATE SET
       date = excluded.date, amount = excluded.amount, name = excluded.name,
       merchant_name = excluded.merchant_name, category_primary = excluded.category_primary,
       category_detailed = excluded.category_detailed, pending = excluded.pending`,
  ).run(
    t.id,
    t.accountId,
    itemId,
    t.date,
    t.amount,
    t.name,
    t.merchantName ?? null,
    t.categoryPrimary ?? null,
    t.categoryDetailed ?? null,
    t.pending ? 1 : 0,
    t.currency ?? null,
  );
}

export function deleteTransaction(id: string): void {
  db.prepare("DELETE FROM transactions WHERE transaction_id = ?").run(id);
}

export function transactionsForUser(userId: string, limit?: number): Txn[] {
  const rows = db
    .prepare(
      `SELECT t.* FROM transactions t JOIN items i ON i.item_id = t.item_id
       WHERE i.user_id = ? ORDER BY t.date DESC ${limit ? "LIMIT ?" : ""}`,
    )
    .all(...(limit ? [userId, limit] : [userId])) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.transaction_id as string,
    accountId: r.account_id as string,
    date: r.date as string,
    amount: r.amount as number,
    name: r.name as string,
    merchantName: r.merchant_name as string | null,
    categoryPrimary: r.category_primary as string | null,
    categoryDetailed: r.category_detailed as string | null,
    pending: r.pending === 1,
    currency: r.currency as string | null,
  }));
}

export function insertLabel(l: {
  userId: string;
  leakId: string;
  leakKind: string;
  merchantKey: string;
  verdict: Verdict;
  features: unknown;
}): void {
  db.prepare(
    `INSERT INTO labels (user_id, leak_id, leak_kind, merchant_key, verdict, features) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(l.userId, l.leakId, l.leakKind, l.merchantKey, l.verdict, JSON.stringify(l.features));
}

/** Latest verdict per leak (labels are append-only so the history is kept for training). */
export function latestVerdicts(userId: string): Map<string, Verdict> {
  const rows = db
    .prepare(
      `SELECT leak_id, verdict FROM labels l
       WHERE user_id = ? AND id = (SELECT MAX(id) FROM labels WHERE user_id = l.user_id AND leak_id = l.leak_id)`,
    )
    .all(userId) as { leak_id: string; verdict: Verdict }[];
  return new Map(rows.map((r) => [r.leak_id, r.verdict]));
}
