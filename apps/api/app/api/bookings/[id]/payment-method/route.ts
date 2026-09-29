/**
 * POST /api/bookings/:id/payment-method — the customer picks `UPI` or `CASH`
 * (context.txt §368-374, Phase 06). Only legal while the booking is still
 * `PENDING`; `transitionBooking`'s table sends it to `PENDING_PAYMENT` (UPI) or
 * `PENDING_APPROVAL` (CASH) and nowhere else.
 *
 * This is also where the booking's `Payment` row is born — Phase 05 creates a
 * booking with no payment at all (§14), so this handler is the one call in the
 * codebase that passes `payment.create` to `transitionBooking`.
 *
 * For UPI, the VPA the customer is about to see is resolved here (branch first,
 * then the business-wide fallback, §11) and snapshotted onto `Payment.upiPayeeVpa`
 * — see the column's own comment in `schema.prisma` for why that is not read live
 * on every later fetch.
 */
import type { NextRequest } from 'next/server';

import { BookingPaymentMethodRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toBooking } from '@/lib/bookings/projection';
import { transitionBooking, transitionFailureMessage } from '@/lib/bookings/transitions';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { getGlobalUpiVpa } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, BookingPaymentMethodRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  // Ownership as a query filter, same rule as every other booking route: another
  // customer's booking id reads as "not found".
  const booking = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: {
      id: true,
      amountInPaise: true,
      location: { select: { upiVpa: true } },
    },
  });
  if (!booking) return fail('NOT_FOUND', 'That booking could not be found.');

  const { method } = body.data;

  const upiPayeeVpa =
    method === 'UPI' ? (booking.location.upiVpa ?? (await getGlobalUpiVpa())) : null;

  const result = await transitionBooking({
    bookingId: booking.id,
    to: method === 'UPI' ? 'PENDING_PAYMENT' : 'PENDING_APPROVAL',
    allowedFrom: ['PENDING'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: `Payment method selected: ${method}`,
    data: { paymentMethod: method },
    payment: {
      to: 'PENDING',
      create: { method, amountInPaise: booking.amountInPaise, upiPayeeVpa },
    },
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toBooking(result.booking), { headers: { 'Cache-Control': 'no-store' } });
}
