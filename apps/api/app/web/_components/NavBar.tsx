'use client';

import { signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { promptPwaInstall } from '../_lib/pwa-install';
import { usePwaInstall } from '../_lib/use-pwa-install';

type NavLink = { href: string; label: string };

const CUSTOMER_LINKS: NavLink[] = [
  { href: '/web/customer', label: 'Home' },
  { href: '/web/customer/passes', label: 'My passes' },
  { href: '/web/customer/book', label: 'Book parking' },
  { href: '/web/customer/vehicles', label: 'My vehicles' },
  { href: '/web/customer/profile', label: 'Profile' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/web/admin', label: 'Dashboard' },
  { href: '/web/admin/bookings', label: 'Bookings' },
  { href: '/web/admin/passes', label: 'Passes' },
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

  // `InstallBanner` (mounted globally in app/web/layout.tsx) already captures
  // `beforeinstallprompt` and auto-prompts once; this button reads the same
  // module-level state so install is still reachable from any page after
  // that banner has been dismissed. Hidden once installed, or if no prompt
  // has been captured (nothing to trigger yet, or iOS Safari, which never
  // fires one at all).
  const { installable, installed } = usePwaInstall();

  return (
    <nav className="web-nav">
      <div className="web-nav-inner">
        <Link href={brandHref} className="web-nav-brand">
          <Image
            src="/brand/ke-logo-sm.png"
            alt="Pay & Park logo"
            width={200}
            height={161}
            className="web-nav-logo"
            priority
          />
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
          {installable && !installed ? (
            <button type="button" className="btn btn-secondary" onClick={() => void promptPwaInstall()}>
              Install app
            </button>
          ) : null}
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
