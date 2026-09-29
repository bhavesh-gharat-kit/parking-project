/**
 * POST /api/admin/bookings/:id/reject — admin declines a UPI verification or a
 * cash approval (context.txt §347-349).
 *
 * Same two-status shape as `../approve/route.ts`: `PAYMENT_VERIFICATION` or
 * `PENDING_APPROVAL` → `REJECTED`, payment → `REJECTED`. `reason`, when given,
 * is stamped onto `Booking.reviewNote` — the same field the customer's booking
 * summary already renders as "Note from parking" (§21's "visible to the
 * customer").
 *
 * See the header of `../approve/route.ts` for why this and that file are the
 * only two places allowed to move a payment to a terminal status.
 */
import type { NextRequest } from 'next/server';

import { AdminBookingRejectRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { ADMIN_BOOKING_RELATIONS, toAdminBooking } from '@/lib/bookings/projection';
import { transitionBooking, transitionFailureMessage } from '@/lib/bookings/transitions';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, AdminBookingRejectRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  const result = await transitionBooking({
    bookingId: id,
    to: 'REJECTED',
    allowedFrom: ['PAYMENT_VERIFICATION', 'PENDING_APPROVAL'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    // `REJECTED` is a `REVIEWED_STATUSES` target, so this lands on
    // `Booking.reviewNote` directly — the same field the customer's own
    // booking summary already renders.
    note: body.data.reason,
    payment: { to: 'REJECTED', recordVerifier: true },
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: result.booking.id },
    include: ADMIN_BOOKING_RELATIONS,
  });

  return ok(toAdminBooking(booking), { headers: { 'Cache-Control': 'no-store' } });
}
