/**
 * GET /api/passes/:id — one of the caller's own pass applications
 * (`_/decisions.md` D5). Mirrors `app/api/bookings/[id]/route.ts`.
 */
import type { NextRequest } from 'next/server';

import { requireUser } from '@/lib/auth/guard';
import { PASS_RELATIONS, toPassBooking } from '@/lib/passes/projection';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // `userId` in the query, not an ownership check afterwards: another
  // customer's pass id reads as "not found" and learns the caller nothing.
  const passBooking = await prisma.passBooking.findFirst({
    where: { id, userId: auth.actor.userId },
    include: PASS_RELATIONS,
  });

  if (!passBooking) return fail('NOT_FOUND', 'That pass application could not be found.');

  return ok(toPassBooking(passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
