/**
 * POST /api/pass/account — step 1 of the simplified pass flow.
 *
 * Public (no session): a visitor enters their name, mobile number and a
 * password. If no account exists for that number, one is created; if one
 * already exists, nothing changes here and the client then signs in with the
 * supplied password (which only works if it is correct). Either way the client
 * follows this with an Auth.js credentials sign-in using the mobile number.
 *
 * This endpoint never signs anyone in and never returns whether the password
 * was right — that is the sign-in step's job.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { IndianPhoneSchema, PasswordSchema } from '@parking/shared';

import { findOrCreatePassHolder } from '@/lib/auth/users';
import { respondWithAuthError } from '@/lib/auth/route-helpers';
import { fail, failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Keep the name under 80 characters'),
  phone: IndianPhoneSchema,
  password: PasswordSchema,
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail('BAD_REQUEST', 'Expected a JSON body.');
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return failValidation(parsed.error);

  try {
    const { created } = await findOrCreatePassHolder(parsed.data);
    return ok({ created }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respondWithAuthError(error, 'pass/account');
  }
}
