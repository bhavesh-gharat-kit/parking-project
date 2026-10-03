import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './_lib/web.css';

export const metadata: Metadata = {
  title: 'Pay & Park',
  description: 'Book and manage parking online.',
};

export default function WebLayout({ children }: { children: ReactNode }) {
  return <div className="web-root">{children}</div>;
}
