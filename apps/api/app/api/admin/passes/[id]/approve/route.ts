/**
 * POST /api/admin/passes/:id/approve — the admin side of both pass payment
 * flows (`_/decisions.md` D5, Phase 21). Mirrors
 * `app/api/admin/bookings/[id]/approve/route.ts` exactly.
 *
 * One handler for both methods, on purpose: by the time a pass application is
 * approvable it is in exactly one of two statuses, and both resolve to the
 * same pair of moves —
 *
 *   UPI:  PAYMENT_VERIFICATION → CONFIRMED,  payment VERIFICATION_PENDING → PAID
 *   CASH: PENDING_APPROVAL     → CONFIRMED,  payment PENDING              → PAID
 *
 * `transitionPassBooking`'s tables already refuse anything else. This file
 * and `../reject/route.ts` are the ONLY code paths that ever pass
 * `payment.to: 'PAID'` or `'REJECTED'` to it — see that file's header.
 *
 * `specification`/`entrySide` are optional here (D5 point 6) — an admin may
 * set either now or leave it for a later `PATCH /api/admin/passes/:id`.
 */
import type { NextRequest } from 'next/server';

import { AdminPassApproveRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { PASS_ADMIN_RELATIONS, toAdminPassBooking } from '@/lib/passes/projection';
import { passTransitionFailureMessage, transitionPassBooking } from '@/lib/passes/transitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, AdminPassApproveRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  const result = await transitionPassBooking({
    passBookingId: id,
    to: 'CONFIRMED',
    allowedFrom: ['PAYMENT_VERIFICATION', 'PENDING_APPROVAL'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: body.data.note,
    data: {
      specification: body.data.specification,
      entrySide: body.data.entrySide,
    },
    payment: { to: 'PAID', recordVerifier: true },
  });

  if (!result.ok) {
    const message = passTransitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  // Re-read with the admin projection: `transitionPassBooking` returns the
  // customer-shaped relations, and this response is the admin queue's own
  // refresh after acting on it (mirrors the daily-booking approve route).
  const passBooking = await prisma.passBooking.findUniqueOrThrow({
    where: { id: result.passBooking.id },
    include: PASS_ADMIN_RELATIONS,
  });

  return ok(toAdminPassBooking(passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
