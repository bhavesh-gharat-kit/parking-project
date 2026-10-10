/**
 * GET/POST /api/admin/locations/:id/rates — the admin's full price list for one
 * branch, and adding a new package (context.txt §7, §24; Phase 04).
 *
 * `label` is never read from the request body — it is derived from
 * `durationMinutes` with `formatDuration` so the customer-facing text can never
 * drift from the duration a booking is actually computed against (schema.prisma
 * comment on `ParkingRate.durationMinutes`).
 */
import type { NextRequest } from 'next/server';

import { formatDuration, ParkingRateRequestSchema, type AdminParkingRate } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { findLocationById } from '@/lib/locations';
import { toAdminParkingRate } from '@/lib/rates';

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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id: locationId } = await params;
  const location = await findLocationById(locationId);
  if (!location) return fail('NOT_FOUND', 'Location not found.');

  const rates = await prisma.parkingRate.findMany({
    where: { locationId },
    orderBy: [{ vehicleType: 'asc' }, { sortOrder: 'asc' }, { durationMinutes: 'asc' }],
  });

  const payload: AdminParkingRate[] = rates.map(toAdminParkingRate);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id: locationId } = await params;
  const location = await findLocationById(locationId);
  if (!location) return fail('NOT_FOUND', 'Location not found.');

  const body = await parseJsonBody(req, ParkingRateRequestSchema);
  if (!body.ok) return body.response;

  try {
    const rate = await prisma.parkingRate.create({
      data: {
        locationId,
        vehicleType: body.data.vehicleType,
        label: formatDuration(body.data.durationMinutes),
        durationMinutes: body.data.durationMinutes,
        // Post-transform, `priceInRupees` holds paise (see rates.ts).
        priceInPaise: body.data.priceInRupees,
        sortOrder: body.data.sortOrder,
        isActive: body.data.isActive,
      },
    });

    return ok(toAdminParkingRate(rate), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(
        'CONFLICT',
        'A rate for this vehicle type and duration already exists at this location.',
      );
    }
    throw error;
  }
}
