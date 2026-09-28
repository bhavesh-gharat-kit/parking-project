/**
 * Rate lookups and the two public projections, shared by the routes under
 * `app/api/locations/[id]/rates` and `app/api/admin/locations/[id]/rates/**`.
 */
import type { ParkingRate as ParkingRateRow } from '@/generated/prisma/client';
import type { AdminParkingRate, ParkingRate } from '@parking/shared';

import { prisma } from '@/lib/db';

/** §7 — what the customer's package list sees. Never `isActive` (already filtered). */
export function toParkingRate(rate: ParkingRateRow): ParkingRate {
  return {
    id: rate.id,
    locationId: rate.locationId,
    vehicleType: rate.vehicleType,
    label: rate.label,
    durationMinutes: rate.durationMinutes,
    priceInPaise: rate.priceInPaise,
    sortOrder: rate.sortOrder,
  };
}

/** What the admin rate-management screen sees. */
export function toAdminParkingRate(rate: ParkingRateRow): AdminParkingRate {
  return {
    ...toParkingRate(rate),
    isActive: rate.isActive,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}

/**
 * A rate scoped to a specific location, the same "filter in the query, never
 * fetch-then-compare" shape as `findOwnVehicle` — a rate ID from another
 * location must read as `NOT_FOUND`, not a 403 that confirms the ID is real.
 */
export async function findRateInLocation(
  locationId: string,
  rateId: string,
): Promise<ParkingRateRow | null> {
  return prisma.parkingRate.findFirst({ where: { id: rateId, locationId } });
}
