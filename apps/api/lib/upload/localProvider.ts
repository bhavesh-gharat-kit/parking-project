/**
 * Writes a file to this server's own disk, under `apps/api/public/uploads`.
 * Counterpart to `mediaHostProvider.ts` — same `UploadResult` shape, swapped
 * in by `lib/upload/index.ts` when `STORAGE_PROVIDER=local`.
 *
 * No remote call, so nothing here can throw for config or network reasons —
 * only a filesystem error (e.g. disk full, bad permissions) can fail this.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LOCAL_CONFIG } from './storageConfig';
import type { UploadableFile, UploadResult } from './types';

export async function localUpload(
  file: UploadableFile,
  filename: string,
  folder?: string,
): Promise<UploadResult> {
  const subPath = folder && folder.trim() !== '' ? folder.trim() : '';
  const destDir = path.join(LOCAL_CONFIG.baseDir, subPath);
  await mkdir(destDir, { recursive: true });

  const destPath = path.join(destDir, filename);
  await writeFile(destPath, file.buffer);

  const urlPath = [LOCAL_CONFIG.baseFolder, subPath, filename].filter(Boolean).join('/');
  const url = new URL(urlPath, LOCAL_CONFIG.baseUrl).toString();

  return { url, filename, size: file.buffer.byteLength, mimetype: file.mimetype };
}
