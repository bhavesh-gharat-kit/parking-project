/**
 * POST /api/passes/:id/payment-method — the customer picks `UPI` or `CASH`
 * for a pass application (`_/decisions.md` D5, Phase 20). Loosely mirrors
 * `app/api/bookings/[id]/payment-method/route.ts`, retargeted at
 * `PassBooking`/`PassPayment`.
 *
 * Legal from `PENDING` (first choice) and also from `PENDING_PAYMENT`/
 * `PENDING_APPROVAL` (the customer changing their mind before actually
 * paying) — `transitionPassBooking`'s table sends it to `PENDING_PAYMENT`
 * (UPI) or `PENDING_APPROVAL` (CASH) and nowhere else. Once a UTR is
 * submitted (`PAYMENT_VERIFICATION`) the method is locked. No pass-specific
 * UPI config exists — the location's existing `upiVpa`/`upiQrImageUrl` is
 * reused as-is (D5 — "no pass-specific UPI config").
 */
import type { NextRequest } from 'next/server';

import { BookingPaymentMethodRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { PASS_RELATIONS, toPassBooking } from '@/lib/passes/projection';
import { passTransitionFailureMessage, transitionPassBooking } from '@/lib/passes/transitions';
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

  const passBooking = await prisma.passBooking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      amountInPaise: true,
      location: { select: { upiVpa: true } },
    },
  });
  if (!passBooking) return fail('NOT_FOUND', 'That pass application could not be found.');

  const { method } = body.data;
  const editableStatuses: readonly typeof passBooking.status[] = ['PENDING_PAYMENT', 'PENDING_APPROVAL'];

  // Reselecting the method already in effect is a no-op, not a transition —
  // `PASS_BOOKING_TRANSITIONS` has no self-loop for either intermediate status.
  if (passBooking.paymentMethod === method && editableStatuses.includes(passBooking.status)) {
    const current = await prisma.passBooking.findUniqueOrThrow({
      where: { id: passBooking.id },
      include: PASS_RELATIONS,
    });
    return ok(toPassBooking(current), { headers: { 'Cache-Control': 'no-store' } });
  }

  const upiPayeeVpa =
    method === 'UPI' ? (passBooking.location.upiVpa ?? (await getGlobalUpiVpa())) : null;

  const result = await transitionPassBooking({
    passBookingId: passBooking.id,
    to: method === 'UPI' ? 'PENDING_PAYMENT' : 'PENDING_APPROVAL',
    allowedFrom: ['PENDING', 'PENDING_PAYMENT', 'PENDING_APPROVAL'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: `Payment method selected: ${method}`,
    data: { paymentMethod: method },
    payment: {
      to: 'PENDING',
      create: { method, amountInPaise: passBooking.amountInPaise, upiPayeeVpa },
    },
  });

  if (!result.ok) {
    const message = passTransitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toPassBooking(result.passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
