/**
 * GET/PATCH /api/profile — the signed-in customer's own profile (context.txt §5).
 *
 * `email` never appears in the request body: it is the login identifier for
 * both providers (D3), so the RN profile screen shows it read-only and there is
 * no field here that could change it.
 */
import type { NextRequest } from 'next/server';

import { UpdateProfileRequestSchema, type ProfileResponse } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toSessionUser } from '@/lib/auth/users';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUnique({ where: { id: auth.actor.userId } });
  if (!user) {
    return fail('UNAUTHORIZED', 'This session is no longer valid. Please sign in again.');
  }

  const payload: ProfileResponse = { user: toSessionUser(user) };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, UpdateProfileRequestSchema);
  if (!body.ok) return body.response;

  const user = await prisma.user.update({
    where: { id: auth.actor.userId },
    data: { name: body.data.name, phone: body.data.phone ?? null },
  });

  const payload: ProfileResponse = { user: toSessionUser(user) };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
