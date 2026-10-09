import { TransactionsUpdateStatus, type Transaction } from "plaid";
import { decrypt } from "./crypto.js";
import { deleteTransaction, type ItemRow, setCursor, upsertAccount, upsertTransaction } from "./db.js";
import type { Txn } from "./engine/types.js";
import { plaid, plaidError } from "./plaid.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  status: TransactionsUpdateStatus | null;
}

/**
 * Cursor-based /transactions/sync. Right after linking, Plaid may still be
 * pulling history (status NOT_READY with no data), so we wait for it briefly.
 */
export async function syncItem(item: ItemRow, opts: { waitForData?: boolean } = {}): Promise<SyncResult> {
  const accessToken = decrypt(item.access_token_enc);
  const result: SyncResult = { added: 0, modified: 0, removed: 0, status: null };
  const deadline = Date.now() + (opts.waitForData ? 30_000 : 0);

  let cursor = item.sync_cursor ?? undefined;
  const startCursor = cursor;
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
      // Data changed while paging: restart from where this sync began.
      if (plaidError(err)?.body.error_code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
        cursor = startCursor;
        continue;
      }
      throw err;
    }

    for (const a of data.accounts) {
      upsertAccount({
        account_id: a.account_id,
        item_id: item.item_id,
        name: a.official_name || a.name,
        mask: a.mask ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        current_balance: a.balances.current ?? null,
        available_balance: a.balances.available ?? null,
        currency: a.balances.iso_currency_code ?? null,
      });
    }
    for (const t of data.added) upsertTransaction(item.item_id, toTxn(t));
    for (const t of data.modified) upsertTransaction(item.item_id, toTxn(t));
    for (const r of data.removed) if (r.transaction_id) deleteTransaction(r.transaction_id);

    result.added += data.added.length;
    result.modified += data.modified.length;
    result.removed += data.removed.length;
    result.status = data.transactions_update_status;

    const notReady = data.transactions_update_status === TransactionsUpdateStatus.NotReady && result.added === 0;
    if (notReady && Date.now() < deadline) {
      await sleep(2000);
      continue; // retry with the same cursor
    }

    cursor = data.next_cursor;
    if (!data.has_more) break;
  }

  if (cursor) setCursor(item.item_id, cursor);
  return result;
}
