import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { auth } from '@/auth';

import { NavBar } from '../_components/NavBar';

/**
 * Gate: any signed-in user (context.txt §19 — an admin can book parking too,
 * same as the mobile customer stack's own guard takes no role). This is a
 * navigation convenience only; every `/api/bookings` etc. call this UI makes
 * is still authorised server-side by `requireUser` off the database row.
 */
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/web/sign-in');

  return (
    <>
      <NavBar variant="customer" userEmail={session.user.email ?? ''} />
      <main className="web-shell">{children}</main>
    </>
  );
}
