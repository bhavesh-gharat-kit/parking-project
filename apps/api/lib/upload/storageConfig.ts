/**
 * Config for the one upload this app does: a customer's UPI payment
 * screenshot, stored on the self-hosted media-host PHP service (Phase 15).
 *
 * Ported from `reliableverify/src/utils/upload/storageConfig.ts`, stripped
 * down to the single mediahost project this app needs — no local/s3 toggle,
 * no multi-project map, since there is exactly one project and one upload
 * use case here.
 */

/** Base URL and endpoint of the hosted PHP upload service. */
export const MEDIAHOST_CONFIG = {
  baseUrl: 'https://media.kumarinfotech.com',
  uploadPath: '/upload.php',
  projectName: process.env.MEDIAHOST_PROJECT_NAME ?? '',
  token: process.env.MEDIAHOST_TOKEN ?? '',
};

/** Size and type limits for the UTR screenshot specifically (§278-336). */
export const UTR_SCREENSHOT_RULES = {
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as string[],
};
