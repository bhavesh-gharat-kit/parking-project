/**
 * The single HTTP entry point to the backend.
 *
 * Everything the app knows about the API goes through here, which keeps three
 * concerns out of every screen:
 *
 *  - The `ApiResponse` envelope from `@parking/shared` is unwrapped once, so a
 *    screen gets either data or an `ApiError`, never a discriminated union to
 *    re-check.
 *  - The auth token is attached in one place, and an expired one is handled in
 *    one place: a 401 signs the customer out rather than surfacing as a confusing
 *    error on whichever screen happened to ask.
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
 *
 * A provider function rather than an imported store value, so this module stays
 * free of any dependency on Zustand or on the auth store — which itself imports
 * `apiRequest`. `src/app/_layout.tsx` registers both hooks below at startup.
 */
let getAuthToken: () => string | null = () => null;

export function setAuthTokenProvider(provider: () => string | null) {
  getAuthToken = provider;
}

/**
 * Called when the server rejects our token (401 / `UNAUTHORIZED`).
 *
 * Every screen from Phase 03 onward calls authenticated endpoints, and a 30-day
 * token will eventually expire mid-session — or be invalidated by an admin
 * disabling the account (context.txt §22), or by `AUTH_SECRET` rotating on the
 * VPS. Handling it here means no screen has to recognise "my session died" as
 * distinct from "this request failed"; the root layout wires this to sign-out, and
 * the navigation guards take the customer back to sign-in.
 */
let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /**
   * `FormData` is sent as-is (Phase 15 — the UTR screenshot upload): no
   * `Content-Type` is set for it below, because fetch must choose the
   * multipart boundary itself. Anything else is JSON-encoded as before.
   */
  body?: unknown;
  /** Skips the Authorization header (sign-in, health check). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options;

  const url = `${config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

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
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
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
    // Only for a request that actually sent a token. A 401 from a sign-in attempt
    // means "wrong password" and must not trigger a sign-out — there is no session
    // to end, and doing so would wipe a session the customer still had open.
    if (!anonymous && payload.error.code === 'UNAUTHORIZED') {
      onUnauthorized();
    }

    throw new ApiError(payload.error.code, payload.error.message, response.status, payload.error.fields);
  }

  return payload.data;
}
