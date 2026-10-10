/**
 * POST /api/admin/passes/:id/reject — admin declines a UPI verification or a
 * cash approval for a pass application (`_/decisions.md` D5, Phase 21).
 * Mirrors `app/api/admin/bookings/[id]/reject/route.ts`.
 *
 * Same two-status shape as `../approve/route.ts`: `PAYMENT_VERIFICATION` or
 * `PENDING_APPROVAL` → `REJECTED`, payment → `REJECTED`. Unlike the
 * daily-booking reject, `reviewNote` is required (Phase 21 deliverable 2) —
 * it lands on `PassBooking.reviewNote`, the same field the customer's pass
 * summary already shows as "Note from parking".
 */
import type { NextRequest } from 'next/server';

import { AdminPassRejectRequestSchema } from '@parking/shared';

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

  const body = await parseJsonBody(req, AdminPassRejectRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;

  const result = await transitionPassBooking({
    passBookingId: id,
    to: 'REJECTED',
    allowedFrom: ['PAYMENT_VERIFICATION', 'PENDING_APPROVAL'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: body.data.reviewNote,
    payment: { to: 'REJECTED', recordVerifier: true },
  });

  if (!result.ok) {
    const message = passTransitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  const passBooking = await prisma.passBooking.findUniqueOrThrow({
    where: { id: result.passBooking.id },
    include: PASS_ADMIN_RELATIONS,
  });

  return ok(toAdminPassBooking(passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
