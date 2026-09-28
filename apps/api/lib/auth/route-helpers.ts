/**
 * The plumbing the four JSON auth handlers would otherwise each repeat: parse a
 * body against a shared Zod schema, turn an `AuthFailure` into the right envelope,
 * and answer a successful sign-in with a freshly minted token.
 */
import type { NextResponse } from 'next/server';
import type { z } from 'zod';

import type { AuthSession } from '@parking/shared';

import type { User } from '@/generated/prisma/client';
import { fail, failValidation, ok } from '@/lib/http';
import { AuthFailure } from './errors';
import { issueSessionToken } from './session';
import { toSessionSubject, toSessionUser } from './users';

/**
 * Reads and validates a JSON body.
 *
 * A malformed body is `BAD_REQUEST` while a well-formed body with bad values is
 * `VALIDATION_ERROR` — the app can put the second kind on the form fields
 * (`failValidation` keys `fields` to React Hook Form's paths) and has nothing
 * useful to do with the first.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: fail('BAD_REQUEST', 'Expected a JSON request body.') };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: failValidation(parsed.error) };
  }

  return { ok: true, data: parsed.data };
}

/** The one success shape `register`, `login` and `google` all answer with. */
export async function respondWithSession(
  user: User,
  init?: { status?: number },
): Promise<NextResponse> {
  const { token, expiresAt } = await issueSessionToken(toSessionSubject(user));

  const payload: AuthSession = { token, expiresAt, user: toSessionUser(user) };

  // `no-store` so a token can never be cached by Nginx or a proxy on the way back.
  return ok(payload, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Maps a thrown auth error onto the envelope.
 *
 * An `AuthFailure` carries a message written to be read by a customer. Anything
 * else is a bug or an outage: it gets logged with its detail and answered with a
 * generic 500, because whatever a Prisma or driver error says, the customer
 * should not be reading it.
 */
export function respondWithAuthError(error: unknown, context: string): NextResponse {
  if (error instanceof AuthFailure) {
    return fail(error.code, error.message, error.fields ? { fields: error.fields } : undefined);
  }

  console.error(`[${context}] unexpected failure:`, error);
  return fail('INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
