/**
 * Customer stack.
 *
 * Phases 03-08 add the screens the customer flow needs (context.txt §9):
 * dashboard → location → vehicle → package → summary → payment → receipt, plus
 * profile and booking history.
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
    </Stack>
  );
}
