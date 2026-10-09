import { type AccountBase, type Transaction, TransactionsUpdateStatus } from "plaid";
import { type ItemRow, type ItemStatus, itemsForUser, markItemScanned, scansForUser, setItemStatus } from "./db.js";
import { localToday, notifyUser } from "./engagement/service.js";
import { detectSuspicious } from "./engine/anomaly.js";
import { buildLeakReceipt } from "./engine/receipt.js";
import type { Txn } from "./engine/types.js";
import { openAccessToken } from "./keys.js";
import { applyScan, ensureUser, readReceipt, type ScanSummary } from "./ledger.js";
import { log } from "./log.js";
import { plaid, plaidError } from "./plaid.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plaid errors that mean "the user has to act", mapped to a connection status. */
const ITEM_ERROR_STATUS: Record<string, ItemStatus> = {
  ITEM_LOGIN_REQUIRED: "login_required",
  INVALID_CREDENTIALS: "login_required",
  INVALID_MFA: "login_required",
  ITEM_LOCKED: "login_required",
  ACCESS_NOT_GRANTED: "login_required",
  NO_ACCOUNTS: "login_required",
  USER_PERMISSION_REVOKED: "revoked",
  ITEM_NOT_FOUND: "revoked",
  INVALID_ACCESS_TOKEN: "revoked",
};

export function statusForPlaidError(code: string | undefined): ItemStatus | null {
  return (code && ITEM_ERROR_STATUS[code]) || null;
}

function toTxn(t: Transaction): Txn {
  return {
    id: t.transaction_id,
    accountId: t.account_id,
    date: t.date,
    amount: t.amount,
    name: t.name ?? t.merchant_name ?? "Unknown",
    merchantName: t.merchant_name ?? null,
    categoryPrimary: t.personal_finance_category?.primary ?? null,
    categoryDetailed: t.personal_finance_category?.detailed ?? null,
    pending: t.pending,
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
  };
}

export interface ItemData {
  accounts: AccountBase[];
  txns: Txn[];
}

/**
 * Pulls an item's full available history from Plaid into memory. No cursor is
 * kept: Plaid holds the history, so every call starts from the beginning and
 * nothing about individual transactions has to live in Looni's database.
 */
export async function fetchItem(item: ItemRow, opts: { waitForData?: boolean } = {}): Promise<ItemData> {
  const accessToken = await openAccessToken(item.access_token_enc, item.item_id);
  const deadline = Date.now() + (opts.waitForData ? 30_000 : 5_000);

  for (;;) {
    const txns = new Map<string, Txn>();
    let accounts: AccountBase[] = [];
    let cursor: string | undefined;
    let restart = false;
    let notReady = false;

    for (;;) {
      let data;
      try {
        ({ data } = await plaid.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
          options: { include_personal_finance_category: true, days_requested: 365 },
        }));
      } catch (err) {
        // Data changed while paging: start over.
        if (plaidError(err)?.body.error_code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
          restart = true;
          break;
        }
        throw err;
      }
      accounts = data.accounts;
      for (const t of [...data.added, ...data.modified]) txns.set(t.transaction_id, toTxn(t));
      for (const r of data.removed) if (r.transaction_id) txns.delete(r.transaction_id);
      notReady = data.transactions_update_status === TransactionsUpdateStatus.NotReady && txns.size === 0;
      if (notReady || !data.has_more) break;
      cursor = data.next_cursor;
    }

    // Right after linking Plaid may still be pulling history.
    if ((restart || notReady) && Date.now() < deadline) {
      await sleep(2000);
      continue;
    }
    return { accounts, txns: [...txns.values()] };
  }
}

/** Fetches every connection, records broken ones, and returns what it could read. */
export async function fetchAllForUser(
  userId: string,
  opts: { waitForData?: boolean } = {},
): Promise<{ data: ItemData[]; complete: boolean; scannedItemIds: string[] }> {
  const data: ItemData[] = [];
  const scannedItemIds: string[] = [];
  let complete = true;
  for (const item of itemsForUser(userId)) {
    if (item.status === "revoked") continue;
    try {
      data.push(await fetchItem(item, opts));
      scannedItemIds.push(item.item_id);
      setItemStatus(item.item_id, "healthy");
    } catch (err) {
      complete = false;
      const code = plaidError(err)?.body.error_code as string | undefined;
      const status = statusForPlaidError(code);
      if (status) setItemStatus(item.item_id, status);
      log.warn("item fetch failed", { itemId: item.item_id, code: code ?? "unknown", err: code ? undefined : err });
    }
  }
  return { data, complete, scannedItemIds };
}

// One scan per user at a time (a webhook and a pull-to-refresh can arrive together).
const running = new Map<string, Promise<ScanSummary | null>>();

/**
 * The only path from bank data to storage: fetch → analyze in memory →
 * write findings to the encrypted ledger → let the raw data go.
 */
export function runScan(userId: string, opts: { waitForData?: boolean } = {}): Promise<ScanSummary | null> {
  const inFlight = running.get(userId);
  if (inFlight) return inFlight;

  const job = (async () => {
    const user = await ensureUser(userId);
    const items = itemsForUser(userId);
    if (items.length === 0) return null;

    const { data, complete, scannedItemIds } = await fetchAllForUser(userId, opts);
    if (data.length === 0) return null; // nothing readable: keep the ledger as it was

    const txns = data.flatMap((d) => d.txns);
    const today = localToday(user);
    const receipt = buildLeakReceipt(txns, { asOf: today });

    // Suspicious charges: "zombie" check needs the subscriptions the user said they don't need.
    const ledger = await readReceipt(user);
    const cancelled = new Map(
      [...ledger.leaks, ...ledger.resolved]
        .filter((l) => l.kind === "subscription" && l.verdict === "confirmed" && l.verdictAt)
        .map((l) => [l.merchantKey, l.verdictAt!.slice(0, 10)]),
    );
    const firstScan = scansForUser(userId, 1).length === 0;
    receipt.leaks.push(
      ...detectSuspicious(txns, { asOf: today, lookbackDays: firstScan ? 7 : 14, cancelledMerchants: cancelled }).map((l) => ({
        ...l,
        verdict: null,
      })),
    );

    const summary = await applyScan(user, receipt, txns, { today, complete });
    for (const id of scannedItemIds) markItemScanned(id);
    // Alerts come from the updated ledger; a push failure never fails the scan.
    await notifyUser((await ensureUser(userId))).catch((err) => log.warn("notify after scan failed", { err }));
    return summary;
  })().finally(() => running.delete(userId));

  running.set(userId, job);
  return job;
}
