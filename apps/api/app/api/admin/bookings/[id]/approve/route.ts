/**
 * POST /api/admin/bookings/:id/approve — the admin side of both payment flows
 * (context.txt §341-345 UPI, §382-386 cash).
 *
 * One handler for both methods, on purpose: by the time a booking is
 * approvable it is in exactly one of two statuses, and both resolve to the
 * same pair of moves —
 *
 *   UPI:  PAYMENT_VERIFICATION → CONFIRMED,  payment VERIFICATION_PENDING → PAID
 *   CASH: PENDING_APPROVAL     → CONFIRMED,  payment PENDING              → PAID
 *
 * `transitionBooking`'s tables already refuse anything else — `CONFIRMED` is
 * reachable only from these two statuses (see the omission notes in
 * `packages/shared/src/bookings.ts`) — so there is no separate "which method is
 * this" branch to get wrong.
 *
 * This file and `../reject/route.ts` are the ONLY code paths that ever pass
 * `payment.to: 'PAID'` or `'REJECTED'` to `transitionBooking` — see the header
 * of `apps/api/lib/bookings/transitions.ts`. Nothing under `app/api/bookings/**`
 * (the customer-facing tree) does.
 */
import type { NextRequest } from 'next/server';

import { AdminBookingApproveRequestSchema } from '@parking/shared';

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

  const body = await parseJsonBody(req, AdminBookingApproveRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  const result = await transitionBooking({
    bookingId: id,
    to: 'CONFIRMED',
    allowedFrom: ['PAYMENT_VERIFICATION', 'PENDING_APPROVAL'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    // `CONFIRMED` is a `REVIEWED_STATUSES` target, so `transitionBooking` stamps
    // this straight onto `Booking.reviewNote` itself — no need to also pass it
    // via `data`.
    note: body.data.note,
    payment: { to: 'PAID', recordVerifier: true },
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  // Re-read with the admin projection: `transitionBooking` returns the
  // customer-shaped relations, and this response is the admin queue's own
  // refresh after acting on it.
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: result.booking.id },
    include: ADMIN_BOOKING_RELATIONS,
  });

  return ok(toAdminBooking(booking), { headers: { 'Cache-Control': 'no-store' } });
}
