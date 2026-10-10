/**
 * /download-apk — a plain link page the launch QR code points at.
 *
 * decisions.md D1: Thursday's release is a sideloaded APK, not a Play Store
 * listing, so there is no store page to send people to. This is that page —
 * it just links at `/pay-and-park.apk` (see `public/README.md` for how that
 * file gets there) and reminds an Android user to allow "install from
 * unknown sources", since a sideloaded APK always prompts for that once.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download — Pay & Park',
  description: 'Download the Pay & Park Android app.',
};

const APK_PATH = '/pay-and-park.apk';

export default function DownloadApkPage() {
  return (
    <main>
      <h1>Pay &amp; Park</h1>
      <p>Download the Android app to book and pay for parking.</p>

      <p>
        <a className="download-button" href={APK_PATH} download>
          Download APK
        </a>
      </p>

      <p>
        This app is installed directly (not from the Play Store yet), so Android
        will ask you to confirm once. If it blocks the install, go to{' '}
        <strong>Settings → apps → install unknown apps</strong>, allow it for your
        browser, then open the downloaded file again.
      </p>
    </main>
  );
}
