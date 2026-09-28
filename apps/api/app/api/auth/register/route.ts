/**
 * POST /api/auth/register — email/password sign-up (context.txt §4).
 *
 * Sign-up is not something Auth.js does: a Credentials provider only ever checks
 * a credential against something that already exists. So account creation is its
 * own endpoint, and it hands back the same session token a sign-in would, because
 * making a customer type their password twice in a row to get into the app they
 * just joined is a needless step at a parking gate.
 *
 * The created account is always `USER`. There is no field in the request schema
 * that could make it anything else (context.txt §110-112) — see
 * `lib/auth/users.ts`.
 */
import type { NextRequest } from 'next/server';

import { RegisterRequestSchema } from '@parking/shared';

import {
  parseJsonBody,
  respondWithAuthError,
  respondWithSession,
} from '@/lib/auth/route-helpers';
import { registerWithPassword } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req, RegisterRequestSchema);
  if (!body.ok) return body.response;

  try {
    const user = await registerWithPassword({
      name: body.data.name,
      email: body.data.email,
      phone: body.data.phone,
      password: body.data.password,
    });

    return await respondWithSession(user, { status: 201 });
  } catch (error) {
    return respondWithAuthError(error, 'auth/register');
  }
}
