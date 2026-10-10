/**
 * GET /api/admin/bookings/:id — one booking, full detail (context.txt §21,
 * §601-602: "View booking details" including the UTR for UPI payments).
 *
 * No ownership filter, unlike the customer's `GET /api/bookings/:id` — an
 * admin may look up any booking, which is the entire point of this route
 * existing separately from that one.
 */
import type { NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/guard';
import { ADMIN_BOOKING_RELATIONS, toAdminBooking } from '@/lib/bookings/projection';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: ADMIN_BOOKING_RELATIONS,
  });
  if (!booking) return fail('NOT_FOUND', 'That booking could not be found.');

  return ok(toAdminBooking(booking), { headers: { 'Cache-Control': 'no-store' } });
}
