/**
 * Root navigator.
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
 * Phase 02 adds the redirect that reads `role` from the session and sends the
 * user to the right stack. Until then `index` is a manual chooser so both stacks
 * are reachable and reviewable.
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Pay & Park' }} />
        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="demo-form" options={{ title: 'Form wiring check' }} />
      </Stack>
    </ThemeProvider>
  );
}
