/**
 * Customer stack.
 *
 * Phase 03 adds profile and vehicles; Phase 04 adds location → package
 * (context.txt §9). Phases 05-08 add the rest: vehicle + summary → payment →
 * receipt, plus booking history.
 *
 * The guard bounces a signed-out session back to sign-in. It takes no role: an
 * admin opening a customer screen is not a problem to prevent — they may well
 * want to book parking themselves.
 */
import { Stack } from 'expo-router';

import { useRequireAuth } from '@/hooks/use-require-auth';

export default function CustomerLayout() {
  const allowed = useRequireAuth();

  if (!allowed) return null;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'My Parking' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="vehicles/index" options={{ title: 'My Vehicles' }} />
      <Stack.Screen name="vehicles/[id]" options={{ title: 'Vehicle' }} />
      <Stack.Screen name="book/index" options={{ title: 'Choose a Location' }} />
      <Stack.Screen name="book/[locationId]" options={{ title: 'Choose a Package' }} />
    </Stack>
  );
}
