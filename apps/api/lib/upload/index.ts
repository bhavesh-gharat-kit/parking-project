/**
 * Single entry point for the one upload this app does — a customer's UPI
 * payment screenshot. Routes to the provider named by `STORAGE_PROVIDER`
 * (`.env`, validated in `lib/env.ts`): `local` writes to this server's own
 * disk (`localProvider.ts`), `mediahost` posts to the hosted PHP service
 * (`mediaHostProvider.ts`). Callers never import a provider directly, so
 * switching providers is a `.env` change, not a code change.
 */
import { env } from '@/lib/env';

import { localUpload } from './localProvider';
import { mediaHostUpload } from './mediaHostProvider';
import type { UploadableFile, UploadResult } from './types';

export async function uploadFile(
  file: UploadableFile,
  filename: string,
  folder?: string,
): Promise<UploadResult> {
  switch (env.STORAGE_PROVIDER) {
    case 'local':
      return localUpload(file, filename, folder);
    case 'mediahost':
      return mediaHostUpload(file, filename, folder);
  }
}
