import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { auth } from '@/auth';

import { NavBar } from '../_components/NavBar';

/**
 * Gate: `ADMIN` role, same convenience-only guard as the mobile admin stack
 * (`apps/mobile/src/app/admin/_layout.tsx`'s own comment applies verbatim
 * here) — every admin endpoint this UI calls is independently authorised by
 * `requireRole(req, 'ADMIN')` off the database row, not by this check.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/web/sign-in');
  if (session.user.role !== 'ADMIN') redirect('/web/customer');

  return (
    <>
      <NavBar variant="admin" userEmail={session.user.email ?? ''} />
      <main className="web-shell">{children}</main>
    </>
  );
}
