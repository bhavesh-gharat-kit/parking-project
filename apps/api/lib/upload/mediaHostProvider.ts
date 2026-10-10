/**
 * Uploads a file to the self-hosted PHP media service at
 * media.kumarinfotech.com. Ported from
 * `reliableverify/src/utils/upload/providers/mediaHostProvider.ts`, trimmed to
 * just the upload call this app needs (no list/delete — a UTR screenshot is
 * never replaced through this route, only submitted once).
 *
 * Endpoint: POST /upload.php?project={name}[&folder={folder}]
 *
 * ─── Web API FormData note ───────────────────────────────────────────────────
 * Uses native Web API FormData + Blob — NOT the `form-data` npm package.
 * Next.js App Router's fetch() requires Web API types; the Node.js
 * stream-based `form-data` package causes the remote server to receive an
 * empty file field.
 */
import { MEDIAHOST_CONFIG } from './storageConfig';
import type { UploadableFile, UploadResult } from './types';

interface MediaHostUploadSuccess {
  status: 'success';
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

interface MediaHostErrorResponse {
  status: 'error';
  message: string;
  hint?: string;
}

function buildUploadUrl(folder?: string): URL {
  const url = new URL(MEDIAHOST_CONFIG.uploadPath, MEDIAHOST_CONFIG.baseUrl);
  url.searchParams.set('project', MEDIAHOST_CONFIG.projectName);
  if (folder && folder.trim() !== '') url.searchParams.set('folder', folder.trim());
  return url;
}

/**
 * Upload a file to the media host.
 *
 * Throws on any failure — missing config, a network error, or an error
 * response from the server. Callers that want a failed upload to not block
 * the rest of a request (this route does — see the comment on
 * `app/api/bookings/[id]/utr/route.ts`) must catch this themselves.
 */
export async function mediaHostUpload(
  file: UploadableFile,
  filename: string,
  folder?: string,
): Promise<UploadResult> {
  if (!MEDIAHOST_CONFIG.projectName || !MEDIAHOST_CONFIG.token) {
    throw new Error(
      '[mediaHostUpload] MEDIAHOST_PROJECT_NAME / MEDIAHOST_TOKEN is not configured.',
    );
  }

  // Use native Web API FormData + Blob so Next.js fetch() sends a proper
  // multipart body. Do NOT set Content-Type manually - fetch() adds the
  // correct multipart boundary automatically when body is FormData.
  const arrayBuffer = file.buffer.buffer.slice(
    file.buffer.byteOffset,
    file.buffer.byteOffset + file.buffer.byteLength,
  ) as ArrayBuffer;

  const form = new FormData();
  form.append('file', new Blob([arrayBuffer], { type: file.mimetype }), filename);

  const response = await fetch(buildUploadUrl(folder).toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${MEDIAHOST_CONFIG.token}` },
    body: form,
  });

  let json: MediaHostUploadSuccess | MediaHostErrorResponse;
  try {
    json = await response.json();
  } catch {
    throw new Error(`[mediaHostUpload] invalid JSON response (HTTP ${response.status})`);
  }

  if (json.status !== 'success') {
    throw new Error(
      `[mediaHostUpload] upload failed: ${json.message}${json.hint ? ` - ${json.hint}` : ''}`,
    );
  }

  return { url: json.url, filename: json.filename, size: json.size, mimetype: json.mimeType };
}
