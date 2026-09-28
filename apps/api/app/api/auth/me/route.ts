/**
 * GET /api/auth/me — who the Bearer token belongs to.
 *
 * The app calls this once at startup, after reading the token out of
 * `expo-secure-store`. It answers the two questions the app cannot answer itself:
 * is this stored token still valid (it holds no key to decrypt it), and is the
 * `role` it cached still current — a user promoted to `ADMIN` in MySQL lands on
 * the admin stack on their next launch because of this call.
 *
 * A 401 here is the app's cue to clear the stored token and show sign-in.
 */
import type { NextRequest } from 'next/server';

import type { MeResponse } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { toSessionUser } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  // `requireUser` selects only what authorisation needs; the profile fields
  // (`phone`, `imageUrl`) come from a full read.
  const user = await prisma.user.findUnique({ where: { id: auth.actor.userId } });
  if (!user) {
    return fail('UNAUTHORIZED', 'This session is no longer valid. Please sign in again.');
  }

  const payload: MeResponse = { user: toSessionUser(user) };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
