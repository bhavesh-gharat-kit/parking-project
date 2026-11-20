'use client';

import { signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PROFILE_REMINDER_DISMISSED_KEY } from './CompleteProfileModal';
import { promptPwaInstall } from '../_lib/pwa-install';
import { usePwaInstall } from '../_lib/use-pwa-install';

type NavLink = { href: string; label: string };

const CUSTOMER_LINKS: NavLink[] = [
  { href: '/web/customer', label: 'Home' },
  { href: '/web/customer/passes', label: 'My passes' },
  { href: '/web/customer/complaints', label: 'Complaints' },
  { href: '/web/customer/profile', label: 'Profile' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/web/admin', label: 'Dashboard' },
  { href: '/web/admin/bookings', label: 'Bookings' },
  { href: '/web/admin/passes', label: 'Passes' },
  { href: '/web/admin/locations', label: 'Locations' },
  { href: '/web/admin/complaints', label: 'Complaints' },
  { href: '/web/admin/users', label: 'Users' },
  { href: '/web/admin/reports', label: 'Reports' },
  { href: '/web/admin/profile', label: 'Profile' },
];

type NavBarProps = {
  variant: 'customer' | 'admin';
  userEmail: string;
  /** Adds the "Admins" link — admin-account management is super-admin only. */
  isSuperAdmin?: boolean;
};

export function NavBar({ variant, userEmail, isSuperAdmin }: NavBarProps) {
  const pathname = usePathname();
  const adminLinks = isSuperAdmin
    ? [
        ...ADMIN_LINKS.slice(0, -1),
        { href: '/web/admin/admins', label: 'Admins' },
        ...ADMIN_LINKS.slice(-1),
      ]
    : ADMIN_LINKS;
  const links = variant === 'customer' ? CUSTOMER_LINKS : adminLinks;
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
            // Require a path separator after the prefix so a sibling route that
            // merely shares a prefix doesn't light up the wrong link.
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
            onClick={() => {
              try {
                window.sessionStorage.removeItem(PROFILE_REMINDER_DISMISSED_KEY);
              } catch {
                /* ignore */
              }
              void signOut({ callbackUrl: '/web/sign-in' });
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
