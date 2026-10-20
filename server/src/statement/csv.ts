import type { Txn } from "../engine/types.js";
import { round2, stableId } from "../engine/util.js";

/**
 * Bank/card statement exports (CSV or plain-text CSV) → engine transactions.
 * Ported from the loonifinancial.com scan: delimiter sniffing, header
 * detection, per-column scoring to find date / description / amount, and
 * Canadian date and money formats in English and French. Runs in memory; the
 * file text is never stored.
 */

export interface StatementFile {
  name: string;
  text: string;
}

export interface ColumnMap {
  date: number;
  description: number;
  /** Signed amount column, or -1 when the file splits withdrawals and deposits. */
  amount: number;
  withdrawal: number;
  deposit: number;
}

export interface ParsedStatement {
  name: string;
  columns: ColumnMap;
  header: string[];
  /** True when positive amounts were read as spending (no withdrawal column, mostly positive values). */
  spendPositive: boolean;
  txns: Txn[];
  skippedRows: number;
}

export class StatementError extends Error {}

export const SUPPORTED = /\.(csv|txt)$/i;

const MONTHS: Record<string, number> = {
  jan: 0, janv: 0, janvier: 0, january: 0,
  feb: 1, fev: 1, fév: 1, fevr: 1, févr: 1, fevrier: 1, février: 1, february: 1,
  mar: 2, mars: 2, march: 2,
  apr: 3, avr: 3, avril: 3, april: 3,
  may: 4, mai: 4,
  jun: 5, juin: 5, june: 5,
  jul: 6, juil: 6, juillet: 6, july: 6,
  aug: 7, aout: 7, août: 7, august: 7,
  sep: 8, sept: 8, septembre: 8, september: 8,
  oct: 9, octobre: 9, october: 9,
  nov: 10, novembre: 10, november: 10,
  dec: 11, déc: 11, decembre: 11, décembre: 11, december: 11,
};

export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const head = text.split(/\r?\n/).slice(0, 15).join("\n");
  const count = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of head) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in count) count[ch as keyof typeof count]++;
  }
  if (count[";"] > count[","] && count[";"] >= count["\t"]) return ";";
  return count["\t"] > count[","] ? "\t" : ",";
}

export function parseCsv(text: string, delim = ","): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((x) => x.trim() !== "")) out.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return out;
}

/** "(1,234.50)", "-12.00", "12,50", "45.00 CR" → number (negative for brackets, minus or CR). */
export function parseMoney(raw: string | undefined | null): number {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /-/.test(s) || /\bCR$/i.test(s);
  let t = s.replace(/[^0-9.,]/g, "");
  if (!t) return NaN;
  if (/,\d{1,2}$/.test(t) && !/\.\d/.test(t)) t = t.replace(/\./g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  else t = t.replace(/,/g, "");
  const v = parseFloat(t);
  return Number.isNaN(v) ? NaN : negative ? -v : v;
}

export function isMoney(raw: string | undefined | null): boolean {
  const s = String(raw ?? "").trim();
  return !!s && /^[($\s+-]*\d[\d\s,. ]*(?:\s?(?:CR|DR))?[)\s-]*\$?$/i.test(s) && !Number.isNaN(parseMoney(s));
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const year4 = (y: string | number) => (+y < 100 ? 2000 + +y : +y);
const monthIndex = (w: string) => MONTHS[w.toLowerCase().replace(/\./g, "")] ?? -1;

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCMonth() === m ? iso(y, m, d) : null;
}

/** Parses statement dates to YYYY-MM-DD. `dayFirst` decides ambiguous 03/04/2026. */
export function parseDate(raw: string | undefined | null, dayFirst = false, defaultYear?: number): string | null {
  const s = String(raw ?? "").trim().replace(/^['"]+|['"]+$/g, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return validDate(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return validDate(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
    const a = +m[1];
    const b = +m[2];
    const df = a > 12 ? true : b > 12 ? false : dayFirst;
    return validDate(year4(m[3]), (df ? b : a) - 1, df ? a : b);
  }
  if ((m = s.match(/^([A-Za-zÀ-ÿ]{3,9})\.?,?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/))) {
    const mi = monthIndex(m[1]);
    const y = m[3] ? +m[3] : defaultYear;
    return mi < 0 || y === undefined ? null : validDate(y, mi, +m[2]);
  }
  if ((m = s.match(/^(\d{1,2})(?:er)?[\s-]*([A-Za-zÀ-ÿ]{3,9})\.?(?:,?[\s-]+(\d{4}|\d{2}))?$/))) {
    const mi = monthIndex(m[2]);
    const y = m[3] ? year4(m[3]) : defaultYear;
    return mi < 0 || y === undefined ? null : validDate(y, mi, +m[1]);
  }
  return null;
}

interface ColumnStats {
  dates: number;
  numbers: number;
  texts: number;
  textLength: number;
  filled: number;
  firstOver12: number;
  secondOver12: number;
}

const HEADER = {
  date: /date|posted/i,
  description: /desc|detail|merchant|payee|name|memo|narr|libell/i,
  amount: /^amount|amount$|amt|value|montant|cad\$?$|^cad\b/i,
  withdrawal: /withdraw|debit|d[ée]bit|retrait|paid out|money out/i,
  deposit: /deposit|^credit|cr[ée]dit|d[ée]p[oô]t|paid in|money in/i,
};

/** Works out which column is which, the way the site does: header names first, then what the values look like. */
export function detectColumns(text: string, opts: { french?: boolean } = {}) {
  const clean = text.replace(/^﻿/, "");
  const delim = sniffDelimiter(clean);
  let data = parseCsv(clean, delim);

  // The most common row width is the table; skip preamble lines (account number, period) above it.
  const widths = new Map<number, number>();
  for (const r of data) widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
  let width = 0;
  let best = 0;
  for (const [w, n] of widths) if (n > best || (n === best && w > width)) [best, width] = [n, w];
  let start = 0;
  while (start < data.length - 1 && data[start].length < Math.min(width, 3)) start++;
  data = data.slice(start).filter((r) => r.length >= 2);
  if (data.length < 2) throw new StatementError("That file looks empty. Export your transactions as CSV and try again.");

  let dayFirst = !!opts.french || delim === ";";
  const first = data[0];
  const hasHeader = first.some((c) => /[a-zà-ÿ]/i.test(c)) && !first.some((c) => !!parseDate(c, dayFirst) || isMoney(c));
  const header = hasHeader ? first.map((h) => h.trim()) : first.map((_, i) => `Column ${i + 1}`);
  const rows = hasHeader ? data.slice(1) : data;

  const n = header.length;
  const stats: ColumnStats[] = Array.from({ length: n }, () => ({
    dates: 0, numbers: 0, texts: 0, textLength: 0, filled: 0, firstOver12: 0, secondOver12: 0,
  }));
  for (const r of rows.slice(0, 500)) {
    for (let c = 0; c < n; c++) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      const s = stats[c];
      s.filled++;
      const dm = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
      if (dm) {
        if (+dm[1] > 12) s.firstOver12++;
        if (+dm[2] > 12) s.secondOver12++;
      }
      if (parseDate(v, dayFirst)) s.dates++;
      else if (isMoney(v)) s.numbers++;
      else {
        s.texts++;
        s.textLength += v.length;
      }
    }
  }
  const sample = Math.min(rows.length, 500);
  const byHeader = (re: RegExp) => (hasHeader ? header.findIndex((h) => re.test(h)) : -1);
  const argmax = (score: (s: ColumnStats, c: number) => number) => {
    let bi = -1;
    let bv = 0;
    stats.forEach((s, c) => {
      const v = score(s, c);
      if (v > bv) [bv, bi] = [v, c];
    });
    return bi;
  };

  let date = byHeader(HEADER.date);
  if (date < 0 || stats[date].dates === 0) {
    const d = argmax((s) => s.dates);
    if (d >= 0) date = d;
  }
  if (date < 0) date = 0;
  if (stats[date].firstOver12 > 0) dayFirst = true;
  else if (stats[date].secondOver12 > 0) dayFirst = false;

  let description = byHeader(HEADER.description);
  if (description < 0 || stats[description].texts === 0) {
    const d = argmax((s, c) => (c === date || !s.texts ? 0 : s.textLength / s.texts + (s.texts / sample) * 5));
    if (d >= 0) description = d;
  }
  if (description < 0) description = Math.min(1, n - 1);

  let amount = byHeader(HEADER.amount);
  let withdrawal = byHeader(HEADER.withdrawal);
  let deposit = byHeader(HEADER.deposit);
  if (amount >= 0 && stats[amount].numbers === 0) amount = -1;
  if (amount < 0 && withdrawal < 0) {
    const numeric = stats
      .map((s, c) => ({ s, c }))
      .filter(({ s, c }) => c !== date && c !== description && s.numbers > 0 && s.numbers >= s.filled * 0.8);
    const partial = numeric.filter(({ s }) => s.numbers < sample * 0.9).map(({ c }) => c);
    const full = numeric.filter(({ s }) => s.numbers >= sample * 0.9).map(({ c }) => c);
    if (partial.length >= 2) [withdrawal, deposit] = [partial[0], partial[1]];
    else if (partial.length === 1 && full.length) [withdrawal, deposit] = [partial[0], -1];
    else if (full.length) amount = full[0];
    else if (partial.length === 1) amount = partial[0];
    if (amount < 0 && withdrawal < 0) amount = n - 1;
  }
  if (withdrawal < 0) deposit = -1;

  return { header, rows, dayFirst, columns: { date, description, amount: withdrawal >= 0 ? -1 : amount, withdrawal, deposit } as ColumnMap };
}

// A payment to a credit card is moving your own money, never spending.
const CARD_PAYMENT_OUT = /PAYMENT TO|PMT TO|PAIEMENT (?:À|A) |\bVISA\b|MASTERCARD|MC PAYMENT|CREDIT CARD|CARTE DE CR[ÉE]DIT|\bAMEX\b|CC PAYMENT|BILL PAYMENT.*(VISA|MC|CARD)/i;
const CARD_PAYMENT_IN = /PAYMENT ?-? ?THANK YOU|PAYMENT RECEIVED|PAIEMENT ?-? ?MERCI|PAIEMENT RE[ÇC]U|AUTOPAY PAYMENT|ONLINE PAYMENT|THANK YOU/i;
const TRANSFER = /\b(TRANSFER|TFR|XFER|VIREMENT)\b.*\b(TO|FROM|DE|À|VERS)\b|\bINTERNET TRANSFER\b|\bOWN ACCOUNT\b/i;
const INCOME = /PAYROLL|SALARY|\bPAY\b.*DEPOSIT|DIRECT DEP|DEP(OT)? DIRECT|\bPAIE\b|CANADA (CHILD|CCB|GST|HST)|EI CANADA|CPP|OAS|GST CREDIT|CRA REFUND/i;

function categorize(desc: string, amount: number): string | null {
  if (amount > 0 && CARD_PAYMENT_OUT.test(desc)) return "TRANSFER_OUT";
  if (amount < 0 && CARD_PAYMENT_IN.test(desc)) return "TRANSFER_IN";
  if (TRANSFER.test(desc)) return amount > 0 ? "TRANSFER_OUT" : "TRANSFER_IN";
  if (amount < 0 && INCOME.test(desc)) return "INCOME";
  return null;
}

/** One file → transactions. Amounts follow the engine's convention: positive = money out. */
export function parseStatement(file: StatementFile, opts: { columns?: Partial<ColumnMap>; french?: boolean } = {}): ParsedStatement {
  if (!SUPPORTED.test(file.name)) {
    throw new StatementError(`Looni can't read ${file.name} yet. Export a CSV from your bank's website.`);
  }
  const detected = detectColumns(file.text, opts);
  const columns = { ...detected.columns, ...opts.columns };
  const { rows, dayFirst, header } = detected;

  const raw: { date: string; desc: string; signed: number; fromWithdrawal: boolean }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[columns.date], dayFirst);
    const desc = (r[columns.description] ?? "").trim().replace(/\s+/g, " ");
    let signed = NaN;
    let fromWithdrawal = false;
    if (columns.withdrawal >= 0 && r[columns.withdrawal]?.trim() && !Number.isNaN(parseMoney(r[columns.withdrawal]))) {
      signed = -Math.abs(parseMoney(r[columns.withdrawal]));
      fromWithdrawal = true;
    } else if (columns.withdrawal >= 0 && columns.deposit >= 0 && r[columns.deposit]?.trim() && !Number.isNaN(parseMoney(r[columns.deposit]))) {
      signed = Math.abs(parseMoney(r[columns.deposit]));
    } else if (columns.amount >= 0) signed = parseMoney(r[columns.amount]);
    if (!date || !desc || Number.isNaN(signed) || signed === 0) {
      skipped++;
      continue;
    }
    raw.push({ date, desc, signed, fromWithdrawal });
  }
  if (!raw.length) throw new StatementError("Couldn't read any transactions. Check that the file has dates, descriptions and amounts.");

  // Card exports often list purchases as positive numbers with no withdrawal column.
  const spendPositive = columns.withdrawal < 0 && raw.filter((t) => t.signed > 0).length > raw.length * 0.7;
  const seen = new Map<string, number>();
  const txns: Txn[] = raw.map((t) => {
    const amount = round2(spendPositive ? t.signed : -t.signed);
    const key = `${t.date}|${t.desc.toLowerCase()}|${amount}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return {
      id: stableId("stmt", key, String(occurrence)),
      accountId: stableId("stmt-account", file.name),
      date: t.date,
      amount,
      name: t.desc,
      merchantName: null,
      categoryPrimary: categorize(t.desc, amount),
      // The engine spots foreign purchases from the descriptor (see isForeignPurchase).
      currency: "CAD",
    };
  });
  return { name: file.name, columns, header, spendPositive, txns, skippedRows: skipped };
}

/**
 * Several statements → one list. The same row exported twice (overlapping
 * date ranges) counts once, but genuine same-day repeats inside one file stay.
 */
export function mergeStatements(parsed: ParsedStatement[]): Txn[] {
  const byId = new Map<string, Txn>();
  for (const p of parsed) for (const t of p.txns) if (!byId.has(t.id)) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}
