/**
 * GET /api/locations/:id/pass-plans — the customer's pass-plan list for one
 * location (`_/decisions.md` D5 point 2), optionally filtered by
 * `?vehicleType=BIKE|CAR|OTHER`. Mirrors `GET /api/locations/:id/rates`.
 *
 * Any signed-in role. Always `isActive: true` — an admin retiring a plan
 * removes it from here on the next fetch (Phase 19 acceptance), with no app
 * rebuild. Phase 20 is the first customer-reachable consumer of this route.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { VehicleTypeSchema, type PassPlan } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';
import { toPassPlan } from '@/lib/pass-plans';

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

  const plans = await prisma.passPlan.findMany({
    where: {
      locationId,
      isActive: true,
      ...(query.data.vehicleType ? { vehicleType: query.data.vehicleType } : {}),
    },
    orderBy: [{ vehicleType: 'asc' }, { shiftType: 'asc' }, { sortOrder: 'asc' }],
  });

  const payload: PassPlan[] = plans.map(toPassPlan);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
