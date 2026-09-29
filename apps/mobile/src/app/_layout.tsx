/**
 * Root navigator, and the app's one-time startup wiring.
 *
 * Two sibling stacks, `customer/` and `admin/`, each with their own layout — the
 * structure context.txt §19 asks for: one APK where an admin lands on the admin
 * dashboard rather than the customer one.
 *
 * Real path segments rather than Expo Router groups (`(customer)`), for two
 * reasons: groups are URL-transparent, so `(customer)/index` and `(admin)/index`
 * would both resolve to `/` and collide; and Phase 09 deep-links a push
 * notification straight to a booking (decisions.md D4), which needs an
 * addressable path like `/customer/bookings/<id>`.
 *
 * ── Why the wiring is here ──────────────────────────────────────────────────
 *
 * `src/lib/api.ts` deliberately knows nothing about Zustand or the auth store —
 * the store imports it, so the reverse would be a cycle. Instead it exposes two
 * registration hooks, and this layout, the one place guaranteed to run once before
 * any screen mounts, connects them:
 *
 *   - the token provider, so every request carries `Authorization: Bearer <token>`;
 *   - the 401 handler, so a session the server no longer accepts ends here rather
 *     than surfacing as an error on whichever screen happened to ask.
 *
 * Both are registered at module scope, not in an effect: a screen could fire a
 * request during its first render, which happens before any effect runs.
 */
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import type { RegisterPushTokenRequest } from '@parking/shared';

import { apiRequest, setAuthTokenProvider, setUnauthorizedHandler } from '@/lib/api';
import { extractBookingId, registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Opens the booking a tapped notification pointed at (decisions.md D4). The
 * status/receipt screen at `/customer/bookings/[id]` already re-fetches on
 * focus, so it shows whatever the booking's current state is — confirmed,
 * rejected, or expired — regardless of which of the three pushes was tapped.
 */
function openNotifiedBooking(response: Notifications.NotificationResponse): void {
  const bookingId = extractBookingId(response);
  if (bookingId) router.push(`/customer/bookings/${bookingId}`);
}

setAuthTokenProvider(() => useAuthStore.getState().token);

setUnauthorizedHandler(() => {
  // Fire-and-forget: the API client is not async-aware, and the in-memory part of
  // `signOut` (which is what the navigation guards watch) happens synchronously.
  void useAuthStore.getState().signOut();
});

/**
 * Hold the splash screen until `restore()` has read SecureStore, so the app never
 * shows sign-in for the fraction of a second before discovering it has a session.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const status = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  // Registers (or re-confirms) this device's push token once signed in. Cheap
  // and idempotent on the backend (`POST /api/push-tokens` upserts on the token
  // itself), so re-running it on every cold start that resolves to `signedIn` —
  // not only a fresh sign-in — is fine and is what keeps `lastUsedAt`/`isActive`
  // current for a device that was reinstalled or re-signed-in.
  useEffect(() => {
    if (status !== 'signedIn') return;

    void (async () => {
      const registered = await registerForPushNotificationsAsync();
      if (!registered) return;

      const body: RegisterPushTokenRequest = {
        token: registered.token,
        platform: registered.platform,
        deviceName: registered.deviceName ?? undefined,
      };

      try {
        await apiRequest('/api/push-tokens', { method: 'POST', body });
      } catch (error) {
        // A convenience notification failing to register must never block the
        // app (decisions.md D4) — log and move on.
        console.warn('[push] could not register the push token with the server:', error);
      }
    })();
  }, [status]);

  // Tapped-notification deep link: the listener covers a tap while the app is
  // foregrounded or backgrounded, and `getLastNotificationResponseAsync` covers
  // a tap that cold-started the app (that response would otherwise be missed,
  // since the listener is not attached yet when it happened).
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotifiedBooking(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openNotifiedBooking,
    );
    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack>
        {/* The redirect that picks a stack; never shown. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />

        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />

        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
