/**
 * Admin stack.
 *
 * Phase 02 gates this stack on `role === 'ADMIN'` from the session JWT — the
 * client-side guard is a convenience only; every admin endpoint authorises
 * server-side regardless (context.txt §4).
 *
 * Phases 04, 07 and 10 add the screens: booking approval queue, UPI verification,
 * cash approval, location and rate management, dashboard and reports.
 */
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
    </Stack>
  );
}
