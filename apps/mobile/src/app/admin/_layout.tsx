/**
 * Admin stack.
 *
 * Phases 04, 07 and 10 add the screens: booking approval queue, UPI verification,
 * cash approval, location and rate management, dashboard and reports.
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
    </Stack>
  );
}
