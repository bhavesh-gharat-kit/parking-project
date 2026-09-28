/**
 * Route-handler response helpers.
 *
 * Every endpoint under `app/api/**` answers with the `ApiResponse` envelope from
 * `@parking/shared`, so the mobile client has one place to branch on failure
 * instead of one per endpoint. Phases 02+ build their handlers on these.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  API_ERROR_STATUS,
  type ApiErrorCode,
  type ApiFailure,
  type ApiSuccess,
} from '@parking/shared';

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json<ApiSuccess<T>>(
    { ok: true, data },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

export function fail(
  code: ApiErrorCode,
  message: string,
  options?: { fields?: Record<string, string[]>; status?: number },
) {
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: { code, message, ...(options?.fields ? { fields: options.fields } : {}) },
    },
    { status: options?.status ?? API_ERROR_STATUS[code] },
  );
}

/**
 * Turns a Zod failure into a `VALIDATION_ERROR` whose `fields` map lines up with
 * React Hook Form's field paths, so the mobile form can set errors directly.
 */
export function failValidation(error: z.ZodError) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    (fields[path] ??= []).push(issue.message);
  }
  return fail('VALIDATION_ERROR', 'Please correct the highlighted fields.', { fields });
}
