/**
 * GET/POST /api/passes — the signed-in customer's own pass applications
 * (`_/decisions.md` D5, Phase 20). Mirrors `app/api/bookings/route.ts`.
 *
 * Both handlers are scoped to `auth.actor.userId`. There is no `userId` in
 * any request body or query string in this file, so a pass cannot be created
 * for, or listed on behalf of, anyone but the caller.
 */
import type { NextRequest } from 'next/server';

import { PassCreateRequestSchema, type PassBooking, type Paginated } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { createPassBooking } from '@/lib/passes/create';
import { PASS_RELATIONS, toPassBooking } from '@/lib/passes/projection';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Why a failed creation is answered per-field: each reason means a different
 * thing went stale while the customer was choosing, mirroring
 * `CREATE_FAILURES` in `app/api/bookings/route.ts`.
 */
const CREATE_FAILURES = {
  LOCATION_NOT_FOUND: {
    code: 'NOT_FOUND',
    field: 'locationId',
    message: 'That parking location is not available right now.',
  },
  PLAN_NOT_FOUND: {
    code: 'NOT_FOUND',
    field: 'passPlanId',
    message: 'That pass plan is no longer available. Please choose again.',
  },
  PLAN_VEHICLE_MISMATCH: {
    code: 'VALIDATION_ERROR',
    field: 'passPlanId',
    message: 'That plan is priced for a different vehicle type. Please choose again.',
  },
} as const;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const [rows, total] = await Promise.all([
    prisma.passBooking.findMany({
      where: { userId: auth.actor.userId },
      include: PASS_RELATIONS,
      // D5 point 1 — the customer's own "my passes" list, newest first.
      orderBy: { createdAt: 'desc' },
    }),
    prisma.passBooking.count({ where: { userId: auth.actor.userId } }),
  ]);

  const payload: Paginated<PassBooking> = {
    items: rows.map(toPassBooking),
    page: 1,
    pageSize: total,
    total,
    totalPages: 1,
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, PassCreateRequestSchema);
  if (!body.ok) return body.response;

  const result = await createPassBooking({ ...body.data, userId: auth.actor.userId });

  if (!result.ok) {
    const failure = CREATE_FAILURES[result.reason];
    return fail(failure.code, failure.message, { fields: { [failure.field]: [failure.message] } });
  }

  return ok(toPassBooking(result.passBooking), {
    status: 201,
    headers: { 'Cache-Control': 'no-store' },
  });
}
