import { NextResponse } from 'next/server';

/**
 * The /web PWA manifest, served as a plain Route Handler rather than Next's
 * `manifest.ts` file convention — that convention only generates a route at
 * the app ROOT (`app/manifest.ts` → `/manifest.webmanifest`); nested under a
 * route segment like `app/web/manifest.ts` it is silently never matched
 * (confirmed: `icon.png`/`apple-icon.png` DO nest per segment, `manifest.ts`
 * does not). A literal `manifest.webmanifest` folder containing a
 * `route.ts` sidesteps that by being an ordinary path segment instead.
 *
 * `scope`/`start_url` are pinned to `/web` on purpose: this Next app also
 * serves the JSON API and the APK download page from the same origin, and
 * neither of those is part of this PWA.
 */
const MANIFEST = {
  name: 'Pay & Park',
  short_name: 'Pay & Park',
  description: 'Book and manage parking — pay by UPI or cash, track your booking and receipt.',
  start_url: '/web',
  scope: '/web',
  display: 'standalone',
  background_color: '#0B5FA5',
  theme_color: '#0B5FA5',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

export function GET() {
  return NextResponse.json(MANIFEST, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
