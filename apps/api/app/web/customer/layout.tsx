import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { isPlaceholderEmail } from '@parking/shared';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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

  // Show the phone instead of a synthesized `@phone.local` placeholder, and pick up
  // a newly-set email without waiting for a fresh sign-in.
  const row = session.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, phone: true },
      })
    : null;
  const navLabel = row
    ? isPlaceholderEmail(row.email)
      ? (row.phone ?? '')
      : row.email
    : (session.user.email ?? '');

  return (
    <>
      <NavBar variant="customer" userEmail={navLabel} />
      <main className="web-shell">{children}</main>
    </>
  );
}
