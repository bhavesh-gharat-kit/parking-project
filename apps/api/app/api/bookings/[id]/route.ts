/**
 * GET /api/bookings/:id — one of the caller's own bookings (context.txt §9,
 * §248-258).
 *
 * What the booking summary screen reads, and what it re-reads on every focus:
 * `status` and `payment.status` move underneath the customer (a Phase 07 admin
 * approval, the §15 sweep), so this endpoint is the source of truth for both and
 * is never cached.
 */
import type { NextRequest } from 'next/server';

import { requireUser } from '@/lib/auth/guard';
import { BOOKING_RELATIONS, toBooking } from '@/lib/bookings/projection';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // `userId` in the query, not an ownership check afterwards: another customer's
  // booking id reads as "not found" and learns the caller nothing (the Phase 03
  // rule, applied here).
  const booking = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    include: BOOKING_RELATIONS,
  });

  if (!booking) return fail('NOT_FOUND', 'That booking could not be found.');

  return ok(toBooking(booking), { headers: { 'Cache-Control': 'no-store' } });
}
