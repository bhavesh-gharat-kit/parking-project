/**
 * Placeholder root page.
 *
 * Phase 1 uses this Next.js app purely as the API for the Expo client; the
 * customer website and admin web dashboard land on top of the same app in
 * Phase 2 (context.txt §28). `/download-apk` (Phase 16) is the one bit of real
 * web UI before then — launch needs a page for the install QR code to point
 * at. This page exists so hitting the bare domain in a browser says something
 * useful instead of 404ing.
 */
export default function Home() {
  return (
    <main>
      <h1>Pay &amp; Park API</h1>
      <p>
        This is the backend for the Pay &amp; Park Android app. There is no customer
        or admin web UI yet — those are Phase 2.
      </p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
      <p>
        Download the Android app: <a href="/download-apk">/download-apk</a>
      </p>
    </main>
  );
}
