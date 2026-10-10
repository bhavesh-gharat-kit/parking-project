/**
 * PATCH/DELETE /api/admin/locations/:id/rates/:rateId — editing or retiring one
 * package (context.txt §7, §24; Phase 04).
 *
 * `DELETE` sets `isActive = false`, never a hard delete — bookings reference the
 * row (schema.prisma comment on `ParkingRate`), and `onDelete: Restrict` would
 * refuse a real delete the moment one exists anyway.
 */
import type { NextRequest } from 'next/server';

import { formatDuration, ParkingRateRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { findRateInLocation, toAdminParkingRate } from '@/lib/rates';

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

type RouteContext = { params: Promise<{ id: string; rateId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id: locationId, rateId } = await params;
  const existing = await findRateInLocation(locationId, rateId);
  if (!existing) return fail('NOT_FOUND', 'Rate not found.');

  const body = await parseJsonBody(req, ParkingRateRequestSchema);
  if (!body.ok) return body.response;

  try {
    const rate = await prisma.parkingRate.update({
      where: { id: existing.id },
      data: {
        vehicleType: body.data.vehicleType,
        label: formatDuration(body.data.durationMinutes),
        durationMinutes: body.data.durationMinutes,
        // Post-transform, `priceInRupees` holds paise (see rates.ts).
        priceInPaise: body.data.priceInRupees,
        sortOrder: body.data.sortOrder,
        isActive: body.data.isActive,
      },
    });

    return ok(toAdminParkingRate(rate));
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

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id: locationId, rateId } = await params;
  const existing = await findRateInLocation(locationId, rateId);
  if (!existing) return fail('NOT_FOUND', 'Rate not found.');

  const rate = await prisma.parkingRate.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return ok(toAdminParkingRate(rate));
}
