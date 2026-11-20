import Link from 'next/link';

import { getProfileGaps } from '@parking/shared';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

import { CompleteProfileModal } from '../_components/CompleteProfileModal';

export default async function CustomerHomePage() {
  const session = await auth();

  // Read the row, not the JWT: the session's email is a snapshot from sign-in and
  // would keep showing the placeholder (and the reminder) after it is replaced.
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, name: true, email: true, phone: true },
      })
    : null;

  // The reminder is for customers only — never admins (`role === 'USER'`).
  const gaps = user && user.role === 'USER' ? getProfileGaps(user) : null;
  const showReminder = !!gaps && (gaps.email || gaps.name);
  const contact = user && !gaps?.email ? user.email : user?.phone;

  return (
    <div className="stack-loose">
      {showReminder && gaps ? (
        <CompleteProfileModal needsEmail={gaps.email} needsName={gaps.name} phone={user?.phone ?? null} />
      ) : null}

      <div className="card">
        <p className="text-small-bold">Welcome back{user?.name ? `, ${user.name}` : ''}</p>
        <p className="text-small text-secondary">{contact}</p>
      </div>

      <div className="stack">
        <Link href="/web/pass" className="btn btn-primary btn-block">
          Book Pass
        </Link>
        <Link href="/web/customer/passes" className="btn btn-secondary btn-block">
          My Passes
        </Link>
        <Link href="/web/customer/complaints" className="btn btn-secondary btn-block">
          Help &amp; complaints
        </Link>
      </div>

      <p className="text-small text-secondary">
        Choose a day, night or full-day bike parking pass, pay by UPI or cash, and track its approval
        and status right here. Once approved, your pass is ready to show at the gate.
      </p>
    </div>
  );
}
