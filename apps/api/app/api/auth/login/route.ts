/**
 * POST /api/auth/login — email/password sign-in for the mobile app.
 *
 * The browser equivalent is Auth.js's `/api/auth/callback/credentials`; both run
 * `authenticateWithPassword`, so there is one definition of "correct password"
 * and one place the `isActive` check (§22) can be forgotten from — which is why
 * it is in neither.
 *
 * Failures answer 401 with a single message for both a wrong address and a wrong
 * password; `lib/auth/errors.ts` explains why that is not laziness.
 */
import type { NextRequest } from 'next/server';

import { LoginRequestSchema } from '@parking/shared';

import {
  parseJsonBody,
  respondWithAuthError,
  respondWithSession,
} from '@/lib/auth/route-helpers';
import { authenticateWithPassword } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req, LoginRequestSchema);
  if (!body.ok) return body.response;

  try {
    const user = await authenticateWithPassword(body.data.email, body.data.password);
    return await respondWithSession(user);
  } catch (error) {
    return respondWithAuthError(error, 'auth/login');
  }
}
