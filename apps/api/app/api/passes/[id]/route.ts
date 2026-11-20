/**
 * GET /api/passes/:id — one of the caller's own pass applications
 * (`_/decisions.md` D5). Mirrors `app/api/bookings/[id]/route.ts`.
 *
 * PATCH /api/passes/:id — the customer completing their own details after
 * creation (Phase 23, web). Owner-only (`userId` in the where), and what may
 * change is decided from the stored status, never the client: address any time
 * the pass is live (it is printed on the pass, so it stays editable after
 * approval); the informational fields only until approval. Never touches plan,
 * price, vehicle, dates or the admin-only specification/entry side.
 */
import type { NextRequest } from 'next/server';

import { PassDetailsUpdateRequestSchema, passDetailsEditScope } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { PASS_RELATIONS, toPassBooking } from '@/lib/passes/projection';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // `userId` in the query, not an ownership check afterwards: another
  // customer's pass id reads as "not found" and learns the caller nothing.
  const passBooking = await prisma.passBooking.findFirst({
    where: { id, userId: auth.actor.userId },
    include: PASS_RELATIONS,
  });

  if (!passBooking) return fail('NOT_FOUND', 'That pass application could not be found.');

  return ok(toPassBooking(passBooking), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await parseJsonBody(req, PassDetailsUpdateRequestSchema);
  if (!body.ok) return body.response;
  const d = body.data;

  const existing = await prisma.passBooking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: { id: true, status: true },
  });
  if (!existing) return fail('NOT_FOUND', 'That pass application could not be found.');

  const scope = passDetailsEditScope(existing.status);
  if (scope === 'none') {
    return fail('CONFLICT', 'This pass can no longer be edited.');
  }

  const data =
    scope === 'address'
      ? { address: d.address }
      : {
          address: d.address,
          occupationCategory: d.occupationCategory ?? null,
          occupationOther: d.occupationCategory === 'OTHER' ? (d.occupationOther ?? null) : null,
          holidayOffDay: d.holidayOffDay ?? null,
          holidayOffDayOther: d.holidayOffDay === 'OTHER' ? (d.holidayOffDayOther ?? null) : null,
          helmet: d.helmet,
          locker: d.locker,
          airCheck: d.airCheck,
          rickshawParking: d.rickshawParking,
          expectedParkingDays: d.expectedParkingDays ?? null,
          entryTime: d.entryTime ?? null,
          exitTime: d.exitTime ?? null,
        };

  // Status in the where too: if an admin approved/rejected between the read and
  // this write, the wider scope no longer applies and nothing is written.
  const result = await prisma.passBooking.updateMany({
    where: { id: existing.id, userId: auth.actor.userId, status: existing.status },
    data,
  });
  if (result.count === 0) {
    return fail('CONFLICT', 'This pass changed while you were editing. Please reload and try again.');
  }

  const updated = await prisma.passBooking.findFirstOrThrow({
    where: { id: existing.id },
    include: PASS_RELATIONS,
  });
  return ok(toPassBooking(updated), { headers: { 'Cache-Control': 'no-store' } });
}
