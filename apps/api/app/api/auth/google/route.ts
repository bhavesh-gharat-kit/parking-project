/**
 * POST /api/auth/google — native Google sign-in (decisions.md D3).
 *
 * The app ran the Google flow itself and got an ID token; this exchanges it for a
 * session token of ours. On a first sign-in the `User` row is created here, which
 * is what the Phase 02 acceptance test looks for in MySQL.
 *
 * The ID token is untrusted input. `lib/auth/google.ts` verifies its signature
 * against Google's keys and its `aud` against this project's OAuth client IDs
 * before any claim in it is used — and `lib/auth/users.ts` only links it to an
 * existing account because that verification also insisted the email was verified.
 */
import type { NextRequest } from 'next/server';

import { GoogleSignInRequestSchema } from '@parking/shared';

import { isGoogleSignInConfigured } from '@/lib/auth/google';
import {
  parseJsonBody,
  respondWithAuthError,
  respondWithSession,
} from '@/lib/auth/route-helpers';
import { authenticateWithGoogle } from '@/lib/auth/users';
import { fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Checked before reading the body so a server missing its GOOGLE_* variables
  // says so plainly, instead of failing later inside token verification with
  // something that reads like the customer's fault.
  if (!isGoogleSignInConfigured()) {
    return fail(
      'SERVICE_UNAVAILABLE',
      'Google sign-in is not configured on this server. Please sign in with your email and password.',
    );
  }

  const body = await parseJsonBody(req, GoogleSignInRequestSchema);
  if (!body.ok) return body.response;

  try {
    const user = await authenticateWithGoogle(body.data.idToken);
    return await respondWithSession(user);
  } catch (error) {
    return respondWithAuthError(error, 'auth/google');
  }
}
