import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "looni.userId";
let cached: string | null = null;

// SecureStore is native-only; the web preview falls back to localStorage.
const store = {
  get: (): Promise<string | null> =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null) : SecureStore.getItemAsync(KEY),
  set: (v: string): Promise<void> =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.setItem(KEY, v)) : SecureStore.setItemAsync(KEY, v),
  clear: (): Promise<void> =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.removeItem(KEY)) : SecureStore.deleteItemAsync(KEY),
};

/** Anonymous per-install id. MVP stand-in for real auth. */
export async function getUserId(): Promise<string> {
  if (cached) return cached;
  cached = (await store.get()) ?? Crypto.randomUUID();
  await store.set(cached);
  return cached;
}

export async function resetUserId(): Promise<void> {
  cached = null;
  await store.clear();
}
