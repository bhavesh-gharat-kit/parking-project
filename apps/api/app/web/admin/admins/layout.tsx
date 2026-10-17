import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { isSuperAdminRole } from '@parking/shared';

import { auth } from '@/auth';

/**
 * Convenience gate; `/api/admin/admins/**` enforces `requireSuperAdmin` off the
 * database row independently.
 */
export default async function AdminAccountsLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!isSuperAdminRole(session?.user?.role)) redirect('/web/admin');
  return <>{children}</>;
}
