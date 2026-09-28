/**
 * The single HTTP entry point to the backend.
 *
 * Everything the app knows about the API goes through here, which keeps three
 * concerns out of every screen:
 *
 *  - The `ApiResponse` envelope from `@parking/shared` is unwrapped once, so a
 *    screen gets either data or an `ApiError`, never a discriminated union to
 *    re-check.
 *  - The auth token is attached in one place. Phase 02 fills in
 *    `getAuthToken` from the auth store; nothing else needs to change.
 *  - A dead network or a sleeping VPS becomes a typed error with a readable
 *    message rather than an unhandled promise rejection at a parking gate.
 */
import type { ApiErrorCode, ApiResponse } from '@parking/shared';

import { config } from './config';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/**
 * Supplies the bearer token for authenticated calls (decisions.md D3).
 * Phase 02 replaces this with a read from the auth store / SecureStore.
 */
let getAuthToken: () => string | null = () => null;

export function setAuthTokenProvider(provider: () => string | null) {
  getAuthToken = provider;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skips the Authorization header (sign-in, health check). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options;

  const url = `${config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Without a timeout a request to an unreachable host hangs until the OS gives
  // up, which on a weak connection at the gate looks like a frozen app.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.apiTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? timeout.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      aborted
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'Could not reach the server. Check your connection and try again.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON body — an Nginx error page, or a crash before the handler ran.
  }

  if (!payload) {
    throw new ApiError('INTERNAL_ERROR', 'The server returned an unreadable response.', response.status);
  }

  if (!payload.ok) {
    throw new ApiError(payload.error.code, payload.error.message, response.status, payload.error.fields);
  }

  return payload.data;
}
