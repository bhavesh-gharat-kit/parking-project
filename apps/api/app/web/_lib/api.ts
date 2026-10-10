/**
 * The browser's single HTTP entry point to the backend (mirrors
 * apps/mobile/src/lib/api.ts, minus the Bearer token — the website is
 * cookie-authenticated by Auth.js, and a same-origin `fetch` sends that
 * cookie automatically).
 */
import type { ApiErrorCode, ApiResponse } from '@parking/shared';

export class WebApiError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string[]>;

  constructor(code: ApiErrorCode, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'WebApiError';
    this.code = code;
    this.fields = fields;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** `FormData` is sent as-is (the UTR screenshot upload) — no `Content-Type`
   *  is set for it, so the browser picks the multipart boundary itself. */
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    console.warn(`[apiRequest] ${method} ${path} failed:`, error);
    throw new WebApiError(
      'SERVICE_UNAVAILABLE',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const bodyText = await response.text();
  let payload: ApiResponse<T> | null = null;
  try {
    payload = JSON.parse(bodyText) as ApiResponse<T>;
  } catch {
    // Non-JSON body — an Nginx error page, or a crash before the handler ran.
  }

  if (!payload) {
    throw new WebApiError('INTERNAL_ERROR', 'The server returned an unreadable response.');
  }

  if (!payload.ok) {
    throw new WebApiError(payload.error.code, payload.error.message, payload.error.fields);
  }

  return payload.data;
}

/** Narrows an unknown catch value down to a message safe to show a customer. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof WebApiError ? error.message : fallback;
}
