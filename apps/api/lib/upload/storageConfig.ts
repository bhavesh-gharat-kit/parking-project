/**
 * Config for the one upload this app does: a customer's UPI payment
 * screenshot. Which provider stores it is a single `.env` toggle
 * (`STORAGE_PROVIDER`, read in `lib/env.ts`) — see `lib/upload/index.ts` for
 * the dispatcher.
 *
 * Ported from `reliableverify/src/utils/upload/storageConfig.ts`, stripped
 * down to the two providers this app needs — no s3, no multi-project map,
 * since there is exactly one upload use case here.
 */
import { env } from '@/lib/env';

/** Base URL and endpoint of the hosted PHP upload service. */
export const MEDIAHOST_CONFIG = {
  baseUrl: 'https://media.kumarinfotech.com',
  uploadPath: '/upload.php',
  projectName: process.env.MEDIAHOST_PROJECT_NAME ?? '',
  token: process.env.MEDIAHOST_TOKEN ?? '',
};

/**
 * Local-disk storage. Files land under `apps/api/public/<baseFolder>` —
 * Next.js serves `public/` straight from disk at runtime (confirmed by the
 * sideloaded APK in the same `public/` dir, see `public/README.md`), so no
 * extra route handler is needed to serve them back.
 *
 * `baseUrl` is this API's own public origin (`AUTH_URL`) rather than a
 * relative path: the RN app loads `utrScreenshotUrl` straight into an
 * `<Image>` `uri`, which — unlike a browser `<img src>` — cannot resolve a
 * relative URL against "the current page", so it must always be absolute.
 */
export const LOCAL_CONFIG = {
  baseDir: `${process.cwd()}/public/uploads`,
  baseFolder: 'uploads',
  baseUrl: env.AUTH_URL,
};

/** Size and type limits for the UTR screenshot specifically (§278-336). */
export const UTR_SCREENSHOT_RULES = {
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as string[],
};
