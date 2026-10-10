import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './_lib/web.css';
import { InstallBanner } from './_components/InstallBanner';

export const metadata: Metadata = {
  title: 'Pay & Park',
  description: 'Book and manage parking online.',
  // Links to the manifest.webmanifest/route.ts handler — Next's `manifest.ts`
  // file convention would do this automatically, but only works at the app
  // root, not nested here (see that route's own comment).
  manifest: '/web/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pay & Park',
  },
};

export const viewport = {
  themeColor: '#0B5FA5',
};

export default function WebLayout({ children }: { children: ReactNode }) {
  return (
    <div className="web-root">
      {children}
      <InstallBanner />
    </div>
  );
}
