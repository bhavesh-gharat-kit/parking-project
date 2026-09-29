/**
 * Admin stack.
 *
 * Phase 04 adds location and rate management. Phase 07 adds the booking
 * approval queue, UPI verification, cash approval and user management. Phase
 * 10 adds the dashboard and reports.
 *
 * The `'ADMIN'` guard is a convenience — it keeps a customer from reaching screens
 * that would only show them failed requests. It is emphatically not what makes
 * these features safe: every admin endpoint authorises server-side off the
 * database role, whatever the client believes about itself (context.txt §4, and
 * `apps/api/lib/auth/guard.ts`).
 */
import { Stack } from 'expo-router';

import { useRequireAuth } from '@/hooks/use-require-auth';

export default function AdminLayout() {
  const allowed = useRequireAuth('ADMIN');

  if (!allowed) return null;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="locations/index" options={{ title: 'Locations' }} />
      <Stack.Screen name="locations/[id]/index" options={{ title: 'Location' }} />
      <Stack.Screen name="locations/[id]/rates/index" options={{ title: 'Rates' }} />
      <Stack.Screen name="locations/[id]/rates/[rateId]" options={{ title: 'Rate' }} />
      <Stack.Screen name="bookings/index" options={{ title: 'Bookings' }} />
      <Stack.Screen name="bookings/[id]/index" options={{ title: 'Booking' }} />
      <Stack.Screen name="users/index" options={{ title: 'Users' }} />
      <Stack.Screen name="users/[id]/index" options={{ title: 'User' }} />
    </Stack>
  );
}
