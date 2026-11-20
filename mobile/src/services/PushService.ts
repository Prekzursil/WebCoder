// PushService — wave G item 95: the mobile push channel.
//
// Opt-in flow: the settings screen flips `pushEnabled`; when on, the
// service asks OS permission, obtains the Expo device push token and
// registers it with the backend (POST /users/me/push-token/). When off,
// the token is cleared server-side. Delivery fans out from
// backend/notifications/channels.py (push → email → SMS).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from './ApiClient';

export const PUSH_ENABLED_KEY = 'wc_push_enabled';

/** Configure the foreground alert presentation (banners while open). */
export function configurePresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Obtain the Expo push token; returns null when permission is denied. */
export async function getExpoPushToken(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
  }
  if (!granted) return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data ?? null;
  } catch {
    return null; // e.g. emulator without Google services
  }
}

/** Register this device's token with the backend. */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    await apiFetch('/users/me/push-token/', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove the token (opt-out / OS-invalidated). */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await apiFetch('/users/me/push-token/', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  } catch {
    /* best-effort */
  }
}

/** The full enable flow; returns the registered token or null. */
export async function enablePush(): Promise<string | null> {
  configurePresentation();
  const token = await getExpoPushToken();
  if (!token) return null;
  const ok = await registerPushToken(token);
  return ok ? token : null;
}
