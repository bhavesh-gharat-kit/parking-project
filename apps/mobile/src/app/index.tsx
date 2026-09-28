/**
 * The entry route: decides where a launch lands, and renders nothing itself.
 *
 * Three outcomes, from `role` as the backend reported it (context.txt §4, §19):
 *   - still reading the stored session → nothing, while the splash screen is held
 *     up by the root layout;
 *   - no session → sign-in;
 *   - session → the admin stack for an `ADMIN`, the customer stack for a `USER`.
 *
 * `role` is not a permission here, it is a destination. The Phase 01 version of
 * this screen let a reviewer pick a stack by hand; that is gone, and there is now
 * no code path in the app that produces a role the backend did not issue. A
 * tampered build can still open the admin *screens* — and every admin *endpoint*
 * will answer it 403, because `apps/api/lib/auth/guard.ts` re-reads the role from
 * MySQL on each request and never looks at the client's claim about itself.
 */
import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';

export default function IndexScreen() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.user?.role);

  if (status === 'loading') return null;

  if (status === 'signedOut') return <Redirect href="/sign-in" />;

  return <Redirect href={role === 'ADMIN' ? '/admin' : '/customer'} />;
}
