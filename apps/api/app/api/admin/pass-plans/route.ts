/**
 * GET/POST /api/admin/pass-plans — the admin's pass-plan pricing matrix for
 * one branch, and adding a new plan (`_/decisions.md` D5 point 2; Phase 19).
 *
 * Flat, not nested under `/admin/locations/:id` like `ParkingRate` — the
 * phase prompt calls for `locationId` as a query param here, with `POST`
 * taking it in the body instead (`PassPlanRequestSchema` already carries it).
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { PassPlanRequestSchema, type AdminPassPlan } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';
import { findLocationById } from '@/lib/locations';
import { toAdminPassPlan } from '@/lib/pass-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

const QuerySchema = z.object({ locationId: z.string().min(1, 'locationId is required') });

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);

  const location = await findLocationById(query.data.locationId);
  if (!location) return fail('NOT_FOUND', 'Location not found.');

  const plans = await prisma.passPlan.findMany({
    where: { locationId: query.data.locationId },
    orderBy: [{ vehicleType: 'asc' }, { shiftType: 'asc' }, { sortOrder: 'asc' }],
  });

  const payload: AdminPassPlan[] = plans.map(toAdminPassPlan);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, PassPlanRequestSchema);
  if (!body.ok) return body.response;

  const location = await findLocationById(body.data.locationId);
  if (!location) return fail('NOT_FOUND', 'Location not found.');

  try {
    const plan = await prisma.passPlan.create({
      data: {
        locationId: body.data.locationId,
        vehicleType: body.data.vehicleType,
        shiftType: body.data.shiftType,
        label: body.data.label,
        durationUnit: body.data.durationUnit,
        durationValue: body.data.durationValue,
        // Post-transform, `priceInRupees` holds paise (see passes.ts).
        priceInPaise: body.data.priceInRupees,
        sortOrder: body.data.sortOrder,
        isActive: body.data.isActive,
      },
    });

    return ok(toAdminPassPlan(plan), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(
        'CONFLICT',
        'A plan with this vehicle type, shift and label already exists at this location.',
      );
    }
    throw error;
  }
}
