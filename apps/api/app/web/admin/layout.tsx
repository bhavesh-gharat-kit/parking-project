import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { isAdminRole, isSuperAdminRole } from '@parking/shared';

import { auth } from '@/auth';

import { NavBar } from '../_components/NavBar';
import { VehicleLookup } from '../_components/VehicleLookup';

/**
 * Gate: `ADMIN` role, same convenience-only guard as the mobile admin stack
 * (`apps/mobile/src/app/admin/_layout.tsx`'s own comment applies verbatim
 * here) — every admin endpoint this UI calls is independently authorised by
 * `requireAdmin(req)` off the database row, not by this check.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/web/sign-in');
  if (!isAdminRole(session.user.role)) redirect('/web/customer');

  return (
    <>
      <NavBar variant="admin" userEmail={session.user.email ?? ''}
        isSuperAdmin={isSuperAdminRole(session.user.role)}
      />
      <main className="web-shell">{children}</main>
      <VehicleLookup />
    </>
  );
}
