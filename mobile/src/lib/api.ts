import Constants from "expo-constants";
import { Platform } from "react-native";
import { getUserId } from "./user";
import type {
  Account,
  Alert,
  Badge,
  Home,
  Hunt,
  LabelResult,
  LeakReceipt,
  MonthlyReport,
  NotificationSettings,
  Quest,
  QuickLinkResult,
  ShareStats,
  Txn,
  Verdict,
} from "./types";

/**
 * EXPO_PUBLIC_API_URL wins. Otherwise reuse the LAN host Metro is served from,
 * so a physical phone on the same Wi-Fi reaches the API on your laptop.
 */
function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-looni-user": await getUserId(), ...init.headers },
    });
  } catch {
    throw new ApiError(`Can't reach the Looni server at ${API_URL}. Is it running?`, 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.display_message || body.error || `Request failed (${res.status})`, res.status, body.error_code);
  return body as T;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const api = {
  health: () => request<{ ok: boolean; plaidEnv: "sandbox" | "production" }>("/health"),
  createLinkToken: () => post<{ linkToken: string }>("/api/link/token", { platform: Platform.OS }),
  exchangePublicToken: (publicToken: string, institution?: { id?: string; name?: string }) =>
    post<{ itemId: string }>("/api/link/exchange", { publicToken, institution }),
  sandboxQuickLink: (scenario: "leaky" | "dynamic") => post<QuickLinkResult>("/api/sandbox/quick-link", { scenario }),
  createUpdateLinkToken: (itemId: string) => post<{ linkToken: string }>("/api/link/update-token", { itemId, platform: Platform.OS }),
  consent: (training: boolean) => post<{ ok: boolean }>("/api/consent", { training }),
  scan: () => post<{ receipt: LeakReceipt }>("/api/scan"),
  /** Fetched live from Plaid by the server; not stored anywhere. */
  transactions: (limit = 100) =>
    request<{ accounts: Account[]; transactions: Txn[]; complete: boolean }>(`/api/transactions?limit=${limit}`),
  receipt: () => request<LeakReceipt>("/api/receipt"),
  label: (leakId: string, verdict: Verdict) => post<LabelResult>("/api/labels", { leakId, verdict }),
  home: () => request<Home>("/api/home"),
  hunt: () => request<Hunt>("/api/hunt"),
  quests: () => request<{ quests: Quest[]; newlyCompleted: string[]; questLoonies: number }>("/api/quests"),
  completeQuest: (id: string) => post<{ ok: true }>(`/api/quests/${encodeURIComponent(id)}/complete`),
  badges: () => request<{ badges: Badge[] }>("/api/badges"),
  markBadgesSeen: () => post("/api/badges/seen"),
  alerts: () => request<{ alerts: Alert[] }>("/api/alerts"),
  markAlertsRead: (keys?: string[]) => post("/api/alerts/read", { keys }),
  registerPushToken: (token: string) => post("/api/push-token", { token }),
  notificationSettings: () => request<NotificationSettings>("/api/settings/notifications"),
  updateNotificationSettings: (patch: Partial<NotificationSettings>) =>
    request<NotificationSettings>("/api/settings/notifications", { method: "PUT", body: JSON.stringify(patch) }),
  share: () => request<ShareStats>("/api/share"),
  report: (month: string) => request<MonthlyReport>(`/api/report?month=${month}`),
  deleteMe: () => request("/api/me", { method: "DELETE" }),
};
