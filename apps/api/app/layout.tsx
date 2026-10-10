import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Pay & Park — API',
  description: 'Backend API for the Pay & Park booking app.',
  robots: { index: false, follow: false },
};

/**
 * Next 16 generates a `LayoutProps<"/">` global from `.next/types`, which only
 * exists after a build — typing the props explicitly keeps `npm run typecheck`
 * working on a fresh clone.
 *
 * Fonts are deliberately not loaded from `next/font/google`: this app is an API
 * for now, and a build-time font fetch is a pointless way for a VPS deploy to
 * fail. The Phase 2 website can add them.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
