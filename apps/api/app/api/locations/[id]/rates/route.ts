/**
 * GET /api/locations/:id/rates — the customer's package list for one location
 * (context.txt §7, §24), optionally filtered by `?vehicleType=BIKE|CAR|OTHER`.
 *
 * Any signed-in role. Always `isActive: true` — the same "no app rebuild"
 * guarantee as `GET /api/locations`: an admin retiring a price removes it from
 * here on the next fetch (§24, Phase 04 acceptance). A deactivated *location*
 * still answers here if queried directly; the customer only reaches this route
 * via `GET /api/locations`, which already filtered it out.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { VehicleTypeSchema, type ParkingRate } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';
import { toParkingRate } from '@/lib/rates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ vehicleType: VehicleTypeSchema.optional() });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const query = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);

  const { id: locationId } = await params;

  const rates = await prisma.parkingRate.findMany({
    where: {
      locationId,
      isActive: true,
      ...(query.data.vehicleType ? { vehicleType: query.data.vehicleType } : {}),
    },
    orderBy: [{ vehicleType: 'asc' }, { sortOrder: 'asc' }, { durationMinutes: 'asc' }],
  });

  const payload: ParkingRate[] = rates.map(toParkingRate);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
