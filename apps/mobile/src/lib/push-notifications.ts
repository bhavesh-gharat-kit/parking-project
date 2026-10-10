/**
 * Expo push registration and the tapped-notification deep link (decisions.md D4).
 *
 * Kept deliberately thin for Thursday: no notification-history screen, no
 * per-user preferences (out of scope per `_/prompts/09-notifications.md`) — just
 * "get a token, tell the backend, and open the right booking if the customer
 * taps one".
 *
 * `expo-notifications` (unlike the Google Sign-In native module in
 * `google-auth.ts`) works from a plain `import` in both the dev client and a
 * standalone build, so there is no lazy `require` here. What still varies by
 * environment is whether registration actually *succeeds* — Expo Go dropped
 * remote push support, and simulators/emulators without Play services cannot
 * obtain a token — so every step below is expected to fail sometimes and always
 * resolves to `null` rather than throwing.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { DevicePlatform } from '@parking/shared';

/**
 * Notifications received while the app is foregrounded still show a banner and
 * play a sound. Without this handler Android suppresses them entirely, which
 * would make a demo on a single device (the common way to test this before a
 * second device is available) look like nothing happened.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DEVICE_PLATFORM: DevicePlatform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

export type RegisteredPushToken = {
  token: string;
  platform: DevicePlatform;
  deviceName: string | null;
};

/**
 * Requests permission and returns an Expo push token, or `null` if that was not
 * possible for any reason (simulator, permission denied, Expo Go, no
 * `projectId`, no network). Every branch is logged rather than thrown so a
 * customer who denies the permission prompt, or is running the app on an
 * emulator, still gets a working app — push is a convenience (decisions.md D4),
 * never a requirement for booking.
 */
export async function registerForPushNotificationsAsync(): Promise<RegisteredPushToken | null> {
  try {
    if (Platform.OS === 'android') {
      // Required once on Android 8+ before any notification is shown, channel or
      // no channel; harmless to call again on every launch.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Booking updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      console.warn('[push] notification permission was not granted.');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn('[push] no EAS projectId configured; cannot obtain an Expo push token.');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    return { token, platform: DEVICE_PLATFORM, deviceName: Device.deviceName ?? null };
  } catch (error) {
    // Expo Go (remote push removed since SDK 53) and simulators without a
    // notification service both land here — confirm the test target actually
    // supports push before treating this as a bug (`_/prompts/09-notifications.md`).
    console.warn('[push] could not register for push notifications:', error);
    return null;
  }
}

/** The booking id carried in a Phase 09 push's `data` payload, if present. */
export function extractBookingId(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { bookingId?: unknown } | undefined;
  return typeof data?.bookingId === 'string' ? data.bookingId : null;
}
