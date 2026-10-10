/**
 * POST /api/bookings/:id/cancel — the customer withdraws their own booking
 * (context.txt §14's `Cancelled`).
 *
 * Which statuses this accepts is not decided here: it is
 * `CUSTOMER_CANCELLABLE_BOOKING_STATUSES` in `@parking/shared`, the same list
 * the app uses to decide whether to show the button, and `transitionBooking`
 * checks the transition table on top of it. A booking already in
 * `PAYMENT_VERIFICATION` is deliberately NOT cancellable — the customer has
 * claimed to have paid, so withdrawing it is a refund decision for an admin, not
 * a self-service action (see the omission notes in `packages/shared/src/bookings.ts`).
 *
 * The payment side is untouched on purpose. A cancelled booking's `Payment` row,
 * if one exists at all, is Phase 06/07's to move — nothing here should quietly
 * mark money failed or refunded on a customer's tap (§32).
 */
import type { NextRequest } from 'next/server';

import { BookingCancelRequestSchema, CUSTOMER_CANCELLABLE_BOOKING_STATUSES } from '@parking/shared';

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

  const body = await parseJsonBody(req, BookingCancelRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  // Ownership first, and as a query filter: `transitionBooking` works on a
  // booking id alone, so the row has to be proven to be the caller's before it is
  // handed over.
  const owned = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: { id: true },
  });
  if (!owned) return fail('NOT_FOUND', 'That booking could not be found.');

  const result = await transitionBooking({
    bookingId: owned.id,
    to: 'CANCELLED',
    allowedFrom: CUSTOMER_CANCELLABLE_BOOKING_STATUSES,
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: body.data.reason ?? 'Cancelled by the customer',
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);

    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    // 409 for everything else: the request was well-formed, the booking's state
    // is what refuses it (`INVALID_STATE_TRANSITION` exists for exactly this).
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toBooking(result.booking), { headers: { 'Cache-Control': 'no-store' } });
}
