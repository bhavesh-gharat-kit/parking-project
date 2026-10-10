/**
 * Stack guard: keeps a signed-out (or wrong-role) session out of a stack's screens.
 *
 * Used by `customer/_layout.tsx` and `admin/_layout.tsx`. Returns whether it is
 * safe to render; a layout that ignores that and renders anyway will briefly show
 * screens to someone on their way out, which is why both callers check it.
 *
 * ── What this is and is not ─────────────────────────────────────────────────
 *
 * This is navigation, not security. Its whole job is that a customer who somehow
 * reaches `/admin` sees the customer stack instead of an admin screen full of
 * failed requests, and that a 401 mid-session lands on sign-in rather than on a
 * half-loaded booking list. Anyone editing the JS bundle can defeat it in a
 * minute, and nothing here is the reason an admin endpoint is safe — that is
 * `requireRole` on the server (context.txt §4).
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import type { UserRole } from '@parking/shared';

import { useAuthStore } from '@/stores/auth-store';

export function useRequireAuth(role?: UserRole): boolean {
  const status = useAuthStore((state) => state.status);
  const actualRole = useAuthStore((state) => state.user?.role);

  const signedOut = status === 'signedOut';
  const wrongRole = status === 'signedIn' && role !== undefined && actualRole !== role;

  useEffect(() => {
    // Redirecting from an effect rather than returning `<Redirect>`: this runs from
    // a layout, and navigating during a layout's render is what produces Expo
    // Router's "attempted to navigate before mounting" warning.
    if (signedOut) {
      router.replace('/sign-in');
    } else if (wrongRole) {
      // Back to the entry route, which sends them to the stack their real role
      // allows rather than this hook guessing.
      router.replace('/');
    }
  }, [signedOut, wrongRole]);

  return status === 'signedIn' && !wrongRole;
}
