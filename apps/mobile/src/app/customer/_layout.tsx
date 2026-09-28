/**
 * Customer stack.
 *
 * Phase 03-08 add the screens the customer flow needs (context.txt §9):
 * dashboard → location → vehicle → package → summary → payment → receipt, plus
 * profile and booking history. Phase 02 adds the guard that bounces a signed-out
 * user back to sign-in.
 */
import { Stack } from 'expo-router';

export default function CustomerLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'My Parking' }} />
    </Stack>
  );
}
