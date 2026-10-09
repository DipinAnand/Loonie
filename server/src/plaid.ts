import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { config } from "./config.js";

export const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[config.plaid.env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.plaid.clientId,
        "PLAID-SECRET": config.plaid.secret,
      },
    },
  }),
);

/** Pulls Plaid's error body out of an axios error so the app sees something useful. */
export function plaidError(err: unknown): { status: number; body: Record<string, unknown> } | null {
  const res = (err as { response?: { status: number; data: Record<string, unknown> } }).response;
  if (!res?.data?.error_code) return null;
  return {
    status: res.status,
    body: {
      error: res.data.error_message,
      error_code: res.data.error_code,
      error_type: res.data.error_type,
      display_message: res.data.display_message,
    },
  };
}
