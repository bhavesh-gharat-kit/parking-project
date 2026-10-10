/**
 * Location lookups and the two public projections, shared by the routes under
 * `app/api/locations/**` and `app/api/admin/locations/**`.
 */
import type { ParkingLocation as ParkingLocationRow } from '@/generated/prisma/client';
import type { AdminParkingLocation, ParkingLocation } from '@parking/shared';

import { prisma } from '@/lib/db';

/** §6 — what the customer's location picker sees. Never `code`/`capacity`/`isActive`. */
export function toParkingLocation(location: ParkingLocationRow): ParkingLocation {
  return {
    id: location.id,
    name: location.name,
    addressLine: location.addressLine,
    city: location.city,
    state: location.state,
    pincode: location.pincode,
    contactPhone: location.contactPhone,
  };
}

/** What the admin location screens see. */
export function toAdminParkingLocation(location: ParkingLocationRow): AdminParkingLocation {
  return {
    ...toParkingLocation(location),
    code: location.code,
    capacity: location.capacity,
    isActive: location.isActive,
    upiVpa: location.upiVpa,
    upiQrImageUrl: location.upiQrImageUrl,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

export async function findLocationById(id: string): Promise<ParkingLocationRow | null> {
  return prisma.parkingLocation.findUnique({ where: { id } });
}
