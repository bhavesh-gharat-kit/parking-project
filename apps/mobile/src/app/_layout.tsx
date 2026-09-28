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
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { setAuthTokenProvider, setUnauthorizedHandler } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

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
