/**
 * GET /api/admin/passes/:id — one pass application, full detail, with its
 * complete edit/status history (D5 point 8's "visible... without a DB
 * query"). No ownership filter — mirrors `app/api/admin/bookings/[id]/route.ts`.
 *
 * PATCH /api/admin/passes/:id — the universal field-edit endpoint (D5 point
 * 8, Phase 21 deliverable 4): accepts a partial update to any `PassBooking`
 * field, `startDate`/`endDate` included, as a plain manual override — no
 * recomputation of anything else. Requires `note`. `status` and
 * `paymentMethod` are not accepted here — see `apps/api/lib/passes/edit.ts`'s
 * header for why, and `../[id]/approve|reject/route.ts` for where those
 * belong instead.
 */
import type { NextRequest } from 'next/server';

import { AdminPassEditRequestSchema, istDayBounds } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { editPassBooking, editPassBookingFailureMessage, type PassFieldEdit } from '@/lib/passes/edit';
import { PASS_ADMIN_RELATIONS, toAdminPassBooking } from '@/lib/passes/projection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const passBooking = await prisma.passBooking.findUnique({
    where: { id },
    include: PASS_ADMIN_RELATIONS,
  });
  if (!passBooking) return fail('NOT_FOUND', 'That pass application could not be found.');

  return ok(toAdminPassBooking(passBooking), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, AdminPassEditRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;
  const { note, startDate, endDate, ...rest } = body.data;

  // `startDate`/`endDate` arrive as a plain `YYYY-MM-DD` stamp (same
  // convention as an admin date filter); expand to the exact IST instant
  // `computePassValidity` would have used, so a hand-edited date reads back
  // identically everywhere else in the app.
  const edit: PassFieldEdit = {
    ...rest,
    ...(startDate ? { startDate: istDayBounds(startDate).start } : {}),
    ...(endDate ? { endDate: istDayBounds(endDate).end } : {}),
  };

  const result = await editPassBooking({
    passBookingId: id,
    edit,
    note,
    actor: { userId: auth.actor.userId, role: auth.actor.role },
  });

  if (!result.ok) {
    const message = editPassBookingFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    return fail('BAD_REQUEST', message);
  }

  return ok(toAdminPassBooking(result.passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
