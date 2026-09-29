/**
 * POST /api/bookings/:id/utr — the customer submits the UPI reference after
 * paying the QR (context.txt §306-336, Phase 06).
 *
 * IMPORTANT — this never marks the payment `PAID`. It moves the booking to
 * `PAYMENT_VERIFICATION` and the payment to `VERIFICATION_PENDING`; only an
 * admin approving it (Phase 07) can move either further. The UTR is a claim by
 * the customer, not proof (§32) — `transitionBooking` enforces the "only an
 * admin" half of that by construction (`PAYMENT_VERIFICATION`'s only outgoing
 * moves in `BOOKING_TRANSITIONS` are `CONFIRMED`/`REJECTED`, neither of which
 * this handler asks for).
 *
 * Only reachable from `PENDING_PAYMENT`, which only a `UPI` booking is ever in
 * (`CASH` goes straight to `PENDING_APPROVAL`) — so a cash booking cannot reach
 * this endpoint's success path no matter what it posts.
 */
import type { NextRequest } from 'next/server';

import { BookingUtrSubmitRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toBooking } from '@/lib/bookings/projection';
import { transitionBooking, transitionFailureMessage } from '@/lib/bookings/transitions';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, BookingUtrSubmitRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  const owned = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: { id: true },
  });
  if (!owned) return fail('NOT_FOUND', 'That booking could not be found.');

  const result = await transitionBooking({
    bookingId: owned.id,
    to: 'PAYMENT_VERIFICATION',
    allowedFrom: ['PENDING_PAYMENT'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: 'UTR submitted by customer',
    payment: { to: 'VERIFICATION_PENDING', upiUtr: body.data.utr },
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toBooking(result.booking), { headers: { 'Cache-Control': 'no-store' } });
}
