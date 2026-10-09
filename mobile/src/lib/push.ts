import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

/** Sends the device's time zone so quiet hours and "renews tomorrow" use local time. */
export async function syncTimezone(): Promise<void> {
  const tz = Localization.getCalendars()[0]?.timeZone;
  if (tz) await api.updateNotificationSettings({ timezone: tz }).catch(() => {});
}

/**
 * Asks for notification permission and registers the Expo push token.
 * Call this right after the Leak Reveal, once the user has seen what Looni
 * finds; never at first launch. Returns false if the user declined or the
 * device can't receive pushes (simulator, web).
 */
export async function enablePush(): Promise<boolean> {
  if (Platform.OS === "web" || !Device.isDevice) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Looni alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? "granted" : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.registerPushToken(token);
  await syncTimezone();
  return true;
}

/** Tap on a notification → the leak or alert it is about. */
export function onNotificationTap(handler: (data: { alertKey?: string; leakId?: string | null }) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handler(r.notification.request.content.data as never));
  return () => sub.remove();
}
