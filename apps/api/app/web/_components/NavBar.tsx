'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string };

const CUSTOMER_LINKS: NavLink[] = [
  { href: '/web/customer', label: 'Home' },
  { href: '/web/customer/book', label: 'Book parking' },
  { href: '/web/customer/bookings', label: 'My bookings' },
  { href: '/web/customer/vehicles', label: 'My vehicles' },
  { href: '/web/customer/profile', label: 'Profile' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/web/admin', label: 'Dashboard' },
  { href: '/web/admin/bookings', label: 'Bookings' },
  { href: '/web/admin/locations', label: 'Locations' },
  { href: '/web/admin/users', label: 'Users' },
  { href: '/web/admin/reports', label: 'Reports' },
  { href: '/web/admin/profile', label: 'Profile' },
];

type NavBarProps = {
  variant: 'customer' | 'admin';
  userEmail: string;
};

export function NavBar({ variant, userEmail }: NavBarProps) {
  const pathname = usePathname();
  const links = variant === 'customer' ? CUSTOMER_LINKS : ADMIN_LINKS;
  const brandHref = variant === 'customer' ? '/web/customer' : '/web/admin';

  return (
    <nav className="web-nav">
      <div className="web-nav-inner">
        <Link href={brandHref} className="web-nav-brand">
          Pay &amp; Park
        </Link>

        <div className="web-nav-links">
          {links.map((link) => {
            // `startsWith` alone would also light up "Book parking" for a
            // `/web/customer/bookings/...` path, since "bookings" starts with
            // "book" — require the next character to be a path separator.
            const active =
              link.href === brandHref
                ? pathname === brandHref
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`web-nav-link${active ? ' active' : ''}`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="web-nav-user">
          <span>{userEmail}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void signOut({ callbackUrl: '/web/sign-in' })}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
