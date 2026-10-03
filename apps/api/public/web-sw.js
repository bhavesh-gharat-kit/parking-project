/**
 * Service worker for the /web PWA, registered with `scope: '/web/'` by
 * apps/api/app/web/_lib/pwa-install.ts. Its only job is to make the browser
 * consider the site installable — Chrome's installability check requires a
 * registered service worker with a `fetch` handler.
 *
 * Deliberately NOT a caching/offline layer. This app's whole value — current
 * booking status, live parking rates, payment verification state — is data
 * that must never be shown stale (the same "never show something as
 * authoritative that isn't" rule the backend applies to pricing and payment
 * status, see context.txt §32). A service worker that served cached API
 * responses while offline would risk a customer reading a booking as
 * CONFIRMED, or a price as current, when neither is true anymore. So every
 * request is simply passed straight through to the network with no cache
 * read or write.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
