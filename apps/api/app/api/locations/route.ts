/**
 * GET /api/locations — the customer's location picker (context.txt §6, §23).
 *
 * Any signed-in role, not just `USER` — an admin can book parking too. Always
 * `isActive: true`: a location the admin has deactivated must vanish from this
 * list on the very next fetch, no app rebuild (§23, Phase 04 acceptance).
 */
import type { NextRequest } from 'next/server';

import type { ParkingLocation } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';
import { toParkingLocation } from '@/lib/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const locations = await prisma.parkingLocation.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const payload: ParkingLocation[] = locations.map(toParkingLocation);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
