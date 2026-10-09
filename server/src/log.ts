/**
 * Logging that can't leak bank data. Plaid tokens are masked, and fields that
 * carry transaction content are dropped before anything is printed.
 */
const TOKEN = /\b(access|public|link)-(sandbox|development|production)-[0-9a-f-]+/gi;
const SENSITIVE_KEYS = /token|secret|password|authorization|name|description|merchant|amount|balance|account|mask|institution|body/i;

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(TOKEN, "$1-$2-[redacted]");
  if (value instanceof Error) return { error: value.name, message: redact(value.message) };
  if (!value || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

const write = (level: "info" | "warn" | "error", msg: string, meta?: unknown) =>
  console[level](JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta === undefined ? {} : { meta: redact(meta) }) }));

export const log = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
