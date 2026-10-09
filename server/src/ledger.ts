import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import {
  firstScanAt,
  getLeak,
  getUser,
  insertScan,
  insertTrainingLabel,
  insertUser,
  itemsForUser,
  type ItemStatus,
  leaksForUser,
  resolveLeak,
  scansForUser,
  setVerdict,
  upsertLeak,
  type UserRow,
} from "./db.js";
import { totalImpact } from "./engine/receipt.js";
import { toTrainingFeatures } from "./engine/training.js";
import type { Leak, LeakKind, LeakReceipt, Txn, Verdict } from "./engine/types.js";
import { round2 } from "./engine/util.js";
import { newWrappedDek, openForUser, sealForUser } from "./keys.js";

/** Everything about a finding that identifies money or merchants. Sealed with the user's key. */
export interface LeakPayload {
  title: string;
  detail: string;
  merchantKey: string;
  annualImpact: number;
  features: Leak["features"];
  /** Dates and amounts of only this leak's charges, so it can be tracked after Plaid's window moves on. */
  history: { date: string; amount: number }[];
}

export interface ScanSummary {
  total: number;
  open: number;
  added: number;
  resolved: number;
  transactionCount: number;
  windowStart: string | null;
}

const HISTORY_LIMIT = 24;

export async function ensureUser(id: string): Promise<UserRow> {
  const existing = getUser(id);
  if (existing) return existing;
  const wrapped = await newWrappedDek(id);
  insertUser(id, wrapped, await sealForUser(id, wrapped, randomUUID(), "subject"));
  return getUser(id)!; // a concurrent first request may have won the insert; use whichever row exists
}

const seal = (u: UserRow, v: unknown, purpose: string) => sealForUser(u.id, u.wrapped_dek, v, purpose);
const unseal = <T>(u: UserRow, s: string, purpose: string) => openForUser<T>(u.id, u.wrapped_dek, s, purpose);

/**
 * Records one scan in the ledger. `complete` is false when any bank connection
 * failed: then leaks we didn't see are NOT resolved, because missing data is
 * not the same as a cancelled subscription.
 */
export async function applyScan(
  user: UserRow,
  receipt: LeakReceipt,
  txns: Txn[],
  opts: { today: string; complete: boolean },
): Promise<ScanSummary> {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const existing = new Map(leaksForUser(user.id).map((r) => [r.leak_id, r]));
  const seen = new Set<string>();
  let added = 0;

  for (const leak of receipt.leaks) {
    seen.add(leak.id);
    const prev = existing.get(leak.id);
    const prevHistory = prev ? (await unseal<LeakPayload>(user, prev.payload_enc, `leak:${leak.id}`)).history : [];
    const fresh = leak.txnIds
      .map((id) => byId.get(id))
      .filter((t): t is Txn => !!t)
      .map((t) => ({ date: t.date, amount: round2(t.amount) }));
    const history = [...new Map([...prevHistory, ...fresh].map((h) => [`${h.date}|${h.amount}`, h])).values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_LIMIT);

    const payload: LeakPayload = {
      title: leak.title,
      detail: leak.detail,
      merchantKey: leak.merchantKey,
      annualImpact: leak.annualImpact,
      features: leak.features,
      history,
    };
    if (!prev) added++;
    upsertLeak({
      user_id: user.id,
      leak_id: leak.id,
      kind: leak.kind,
      status: "open",
      first_seen: prev?.first_seen ?? opts.today,
      last_seen: opts.today,
      resolved_at: null,
      payload_enc: await seal(user, payload, `leak:${leak.id}`),
    });
  }

  let resolved = 0;
  if (opts.complete) {
    for (const r of existing.values()) {
      if (r.status === "open" && !seen.has(r.leak_id)) {
        resolveLeak(user.id, r.leak_id, opts.today);
        resolved++;
      }
    }
  }

  const summary: ScanSummary = {
    total: receipt.totalAnnualImpact,
    open: receipt.leaks.length,
    added,
    resolved,
    transactionCount: receipt.transactionCount,
    windowStart: receipt.windowStart,
  };
  insertScan(user.id, opts.complete, await seal(user, summary, "scan"));
  return summary;
}

export interface LedgerLeak {
  id: string;
  kind: LeakKind;
  status: "open" | "resolved";
  isNew: boolean;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
  verdict: Verdict | null;
  title: string;
  detail: string;
  merchantKey: string;
  annualImpact: number;
  history: { date: string; amount: number }[];
}

export interface LedgerReceipt {
  lastScanAt: string | null;
  lastScanComplete: boolean;
  totalAnnualImpact: number;
  /** Yearly cost of leaks the user confirmed and that have since stopped. */
  savedPerYear: number;
  transactionCount: number;
  windowStart: string | null;
  leaks: LedgerLeak[];
  resolved: LedgerLeak[];
  connections: { itemId: string; institution: string | null; status: ItemStatus; lastScannedAt: string | null }[];
}

export async function readReceipt(user: UserRow): Promise<LedgerReceipt> {
  const [lastScan] = scansForUser(user.id, 1);
  const summary = lastScan ? await unseal<ScanSummary>(user, lastScan.summary_enc, "scan") : null;
  const lastScanDay = lastScan?.ran_at.slice(0, 10);
  const firstScanDay = firstScanAt(user.id)?.slice(0, 10);

  const all: LedgerLeak[] = [];
  for (const r of leaksForUser(user.id)) {
    const p = await unseal<LeakPayload>(user, r.payload_enc, `leak:${r.leak_id}`);
    all.push({
      id: r.leak_id,
      kind: r.kind,
      status: r.status,
      // New = spotted by the latest scan, on a later day than the user's first scan (so day one isn't all "new").
      isNew: r.status === "open" && r.first_seen === lastScanDay && !!firstScanDay && r.first_seen > firstScanDay && !r.verdict,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      resolvedAt: r.resolved_at,
      verdict: r.verdict,
      title: p.title,
      detail: p.detail,
      merchantKey: p.merchantKey,
      annualImpact: p.annualImpact,
      history: p.history,
    });
  }

  const open = all.filter((l) => l.status === "open").sort((a, b) => b.annualImpact - a.annualImpact);
  const resolved = all.filter((l) => l.status === "resolved").sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  const saved = resolved.filter((l) => l.verdict === "confirmed" && l.kind !== "duplicate").reduce((s, l) => s + l.annualImpact, 0);

  const connections = [];
  for (const i of itemsForUser(user.id)) {
    connections.push({
      itemId: i.item_id,
      institution: i.institution_enc ? await unseal<string>(user, i.institution_enc, `institution:${i.item_id}`) : null,
      status: i.status,
      lastScannedAt: i.last_scanned_at,
    });
  }

  return {
    lastScanAt: lastScan?.ran_at ?? null,
    lastScanComplete: lastScan ? lastScan.complete === 1 : false,
    totalAnnualImpact: totalImpact(open),
    savedPerYear: round2(saved),
    transactionCount: summary?.transactionCount ?? 0,
    windowStart: summary?.windowStart ?? null,
    leaks: open,
    resolved,
    connections,
  };
}

/**
 * Stores the user's verdict on the ledger row, and, only if they opted in, a
 * de-identified training row under their pseudonym (not their user id).
 */
export async function labelLeak(user: UserRow, leakId: string, verdict: Verdict): Promise<boolean> {
  const row = getLeak(user.id, leakId);
  if (!row) return false;
  setVerdict(user.id, leakId, verdict);

  if (user.consent_training === 1 && user.consent_version) {
    const p = await unseal<LeakPayload>(user, row.payload_enc, `leak:${leakId}`);
    const features = toTrainingFeatures({ kind: row.kind, merchantKey: p.merchantKey, features: p.features, annualImpact: p.annualImpact });
    if (features) {
      insertTrainingLabel({
        subjectId: await unseal<string>(user, user.subject_enc, "subject"),
        consentVersion: user.consent_version,
        leakKind: row.kind,
        verdict,
        features,
      });
    }
  }
  return true;
}

export const sealInstitution = (user: UserRow, itemId: string, name: string | null | undefined) =>
  name ? seal(user, name, `institution:${itemId}`) : Promise.resolve(null);

export const currentConsentVersion = () => config.consentVersion;
