/**
 * Vehicle lookups and the public projection, shared by the routes under
 * `app/api/vehicles/**`.
 */
import type { Vehicle as VehicleRow } from '@/generated/prisma/client';
import type { Vehicle } from '@parking/shared';

import { prisma } from '@/lib/db';

/** The public projection of a vehicle. Never `userId` — the caller already knows whose it is. */
export function toVehicle(vehicle: VehicleRow): Vehicle {
  return {
    id: vehicle.id,
    number: vehicle.number,
    type: vehicle.type,
    makeModel: vehicle.makeModel,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

/**
 * The ownership check every `GET`/`PATCH`/`DELETE /api/vehicles/:id` starts
 * with (Phase 03 acceptance: another user's vehicle ID must come back as if it
 * does not exist, never as a 403 that confirms the ID is real).
 *
 * Filtering by `userId` in the query itself — rather than fetching by `id` alone
 * and comparing afterwards — means a row that belongs to someone else can never
 * even momentarily be held in a variable named `vehicle`.
 */
export async function findOwnVehicle(userId: string, vehicleId: string): Promise<VehicleRow | null> {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, userId, isActive: true },
  });
}
