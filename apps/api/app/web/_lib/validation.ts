/**
 * Zod validation for plain controlled forms.
 *
 * The mobile app resolves these same `@parking/shared` schemas through
 * `@hookform/resolvers/zod` + React Hook Form. The website has neither
 * dependency (apps/api has no form library installed, and this task is
 * frontend-only against an already-shipped backend), so form screens here
 * hold values in `useState` and call `safeParseForm` on submit — the schema,
 * and therefore the validation rules, is still the single one shared with the
 * API and the app.
 */
import type { z } from 'zod';

import { WebApiError } from './api';

export type FieldErrors = Record<string, string>;

type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export function safeParseForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): ParseResult<z.output<S>> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * Merges a failed API call's field errors onto a form, same convention as
 * the mobile app's `applyApiError`: field-level messages land under the
 * matching input, and anything else (or no fields at all) becomes the banner
 * message returned here.
 */
export function applyApiError(
  error: unknown,
  setFieldErrors: (errors: FieldErrors) => void,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof WebApiError) {
    if (error.fields) {
      const flattened: FieldErrors = {};
      for (const [key, messages] of Object.entries(error.fields)) {
        if (messages[0]) flattened[key] = messages[0];
      }
      setFieldErrors(flattened);
    }
    return error.message;
  }
  return fallback;
}
