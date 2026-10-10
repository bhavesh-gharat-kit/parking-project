/**
 * Turns a failed API call into something a form can show.
 *
 * The backend already distinguishes the two kinds of failure: `VALIDATION_ERROR`
 * carries a `fields` map keyed to React Hook Form's field paths (see
 * `apps/api/lib/http.ts`), while everything else is about the request as a whole.
 * This routes each to where a customer will look for it — field errors under the
 * field, everything else in a banner above the form — so no screen re-implements
 * that decision.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from './api';

/**
 * Applies whatever can be attached to a field, and returns the message that still
 * needs showing at form level — or `null` when every part of the failure landed on
 * a field and a banner would just repeat it.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) {
    // A thrown non-ApiError is a bug in our own code, not a server response.
    console.error('[form-errors] unexpected error:', error);
    return 'Something went wrong. Please try again.';
  }

  if (!error.fields) return error.message;

  let attachedAny = false;

  for (const [path, messages] of Object.entries(error.fields)) {
    const message = messages[0];
    if (!message) continue;

    // `_` is what `failValidation` uses for an issue with no field path.
    if (path === '_') continue;

    setError(path as Path<T>, { type: 'server', message });
    attachedAny = true;
  }

  // When nothing could be attached — the server flagged a field this form does
  // not render — the customer would otherwise see a form that silently refuses to
  // submit.
  return attachedAny ? null : error.message;
}
