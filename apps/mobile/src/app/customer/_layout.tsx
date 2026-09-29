/**
 * Customer stack.
 *
 * Phase 03 adds profile and vehicles; Phase 04 adds the location and package
 * pickers; Phase 05 completes the §9 flow — location → vehicle → package →
 * summary — and adds the bookings list the summary is reached from. Phases 06-08
 * add payment, admin approval and the receipt.
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
      <Stack.Screen name="book/[locationId]/index" options={{ title: 'Choose a Vehicle' }} />
      <Stack.Screen name="book/[locationId]/package" options={{ title: 'Choose a Package' }} />
      <Stack.Screen name="bookings/index" options={{ title: 'My Bookings' }} />
      <Stack.Screen name="bookings/[id]/index" options={{ title: 'Booking Summary' }} />
      <Stack.Screen name="bookings/[id]/payment" options={{ title: 'Choose Payment Method' }} />
      <Stack.Screen name="bookings/[id]/upi" options={{ title: 'Pay via UPI' }} />
    </Stack>
  );
}
