import type { ReactNode } from 'react';

type BannerProps = {
  kind?: 'danger' | 'success' | 'info';
  children: ReactNode;
};

export function Banner({ kind = 'info', children }: BannerProps) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}
