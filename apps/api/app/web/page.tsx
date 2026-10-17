import { redirect } from 'next/navigation';

import { isAdminRole } from '@parking/shared';

import { auth } from '@/auth';

/**
 * `/web` — lands wherever `/` does in the mobile app (context.txt §19): a
 * signed-out visitor goes to sign-in, and a signed-in one goes to the stack
 * matching their role. Nothing here decides access on its own; it is a
 * convenience redirect, and `web/customer/layout.tsx` /
 * `web/admin/layout.tsx` are what actually gate the screens underneath.
 */
export default async function WebIndexPage() {
  const session = await auth();

  if (!session?.user) redirect('/web/sign-in');
  redirect(isAdminRole(session.user.role) ? '/web/admin' : '/web/customer');
}
