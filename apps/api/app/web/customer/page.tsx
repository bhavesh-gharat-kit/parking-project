import Link from 'next/link';

import { auth } from '@/auth';

export default async function CustomerHomePage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="stack-loose">
      <div className="card">
        <p className="text-small-bold">Welcome back{user?.name ? `, ${user.name}` : ''}</p>
        <p className="text-small text-secondary">{user?.email}</p>
      </div>

      <div className="stack">
        <Link href="/web/customer/book" className="btn btn-primary btn-block">
          Book parking
        </Link>
        <Link href="/web/customer/bookings" className="btn btn-secondary btn-block">
          My bookings
        </Link>
        <Link href="/web/customer/vehicles" className="btn btn-secondary btn-block">
          My vehicles
        </Link>
        <Link href="/web/customer/profile" className="btn btn-secondary btn-block">
          My profile
        </Link>
      </div>

      <p className="text-small text-secondary">
        Book a slot, pay by UPI or cash, and track your booking status and receipt right here — an
        unfinished booking is released after 10 minutes if it&apos;s not completed.
      </p>
    </div>
  );
}
