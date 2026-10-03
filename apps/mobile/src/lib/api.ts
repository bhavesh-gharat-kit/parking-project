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
import { File, UploadType } from 'expo-file-system';

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
  /**
   * Overrides `config.apiTimeoutMs` for this one call. A multipart file
   * upload (the UTR screenshot) needs far more headroom than a JSON request —
   * a multi-MB photo on a weak or congested mobile connection routinely takes
   * longer than the 20s default built for "is the server even reachable",
   * and the default's own abort message ("Could not reach the server") is
   * misleading for what is actually just a slow upload in progress.
   */
  timeoutMs?: number;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal, timeoutMs = config.apiTimeoutMs } = options;

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
  const timer = setTimeout(() => timeout.abort(), timeoutMs);

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
    // The generic message below is deliberately vague for the customer, but it
    // means every distinct failure (DNS, TLS, a file fetch() couldn't read,
    // an actual timeout) looks identical from the outside. Log the real one.
    console.warn(
      `[apiRequest] ${method} ${url} failed:`,
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
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

  const bodyText = await response.text();
  return resolvePayload<T>(bodyText, response.status, anonymous);
}

/** Shared by `apiRequest` and `apiUpload` — both end with "parse the envelope, handle a 401". */
function resolvePayload<T>(bodyText: string, status: number, anonymous: boolean): T {
  let payload: ApiResponse<T> | null = null;
  try {
    payload = JSON.parse(bodyText) as ApiResponse<T>;
  } catch {
    // Non-JSON body — an Nginx error page, or a crash before the handler ran.
  }

  if (!payload) {
    throw new ApiError('INTERNAL_ERROR', 'The server returned an unreadable response.', status);
  }

  if (!payload.ok) {
    // Only for a request that actually sent a token. A 401 from a sign-in attempt
    // means "wrong password" and must not trigger a sign-out — there is no session
    // to end, and doing so would wipe a session the customer still had open.
    if (!anonymous && payload.error.code === 'UNAUTHORIZED') {
      onUnauthorized();
    }

    throw new ApiError(payload.error.code, payload.error.message, status, payload.error.fields);
  }

  return payload.data;
}

type UploadFileOptions = {
  /** Local `file://` or `content://` URI (e.g. from `expo-image-picker`) to upload. */
  fileUri: string;
  /** Multipart field name the backend's route handler reads the file from. */
  fieldName: string;
  mimeType: string;
  /** Extra multipart form fields sent alongside the file. */
  fields?: Record<string, string>;
  anonymous?: boolean;
  timeoutMs?: number;
};

/**
 * Uploads a local file as `multipart/form-data` — the one other shape of
 * request this app makes, alongside `apiRequest`'s JSON/plain-FormData calls.
 *
 * Deliberately NOT built on `fetch()`/`FormData`/`Blob` like `apiRequest` is.
 * Two different failure modes showed up going through RN's JS networking for
 * a multi-MB local file: the New Architecture's native module rejecting a
 * plain `{ uri, name, type }` FormData part outright ("Unsupported
 * FormDataPart implementation"), and — after switching to a real `Blob` via
 * `fetch(uri).then(r => r.blob())` — the upload stalling indefinitely on a
 * memory-constrained device, past even this function's own timeout, with no
 * error ever surfacing. `expo-file-system`'s upload task reads the file and
 * builds the multipart body in native code (OkHttp on Android, URLSession on
 * iOS) instead of the JS bridge, which is the path each platform has actually
 * hardened for this.
 */
export async function apiUpload<T>(path: string, options: UploadFileOptions): Promise<T> {
  const {
    fileUri,
    fieldName,
    mimeType,
    fields,
    anonymous = false,
    timeoutMs = config.apiTimeoutMs,
  } = options;

  const url = `${config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!anonymous) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);

  let result: { body: string; status: number };
  try {
    result = await new File(fileUri).upload(url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName,
      mimeType,
      parameters: fields,
      headers,
      signal: timeout.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.warn(
      `[apiUpload] POST ${url} failed:`,
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
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

  return resolvePayload<T>(result.body, result.status, anonymous);
}
