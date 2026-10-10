/**
 * GET/POST /api/vehicles — the signed-in customer's own vehicles (context.txt §5).
 *
 * Always scoped to `auth.actor.userId`: there is no `userId` in the request
 * body or query string anywhere in this file, so a vehicle cannot be listed or
 * created for anyone but the caller.
 */
import type { NextRequest } from 'next/server';

import { VehicleRequestSchema, type Vehicle } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { toVehicle } from '@/lib/vehicles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Prisma's error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const vehicles = await prisma.vehicle.findMany({
    where: { userId: auth.actor.userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const payload: Vehicle[] = vehicles.map(toVehicle);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, VehicleRequestSchema);
  if (!body.ok) return body.response;

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        userId: auth.actor.userId,
        number: body.data.number,
        type: body.data.type,
        makeModel: body.data.makeModel ?? null,
      },
    });

    return ok(toVehicle(vehicle), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('CONFLICT', 'You already have a vehicle with this number.', {
        fields: { number: ['You already have a vehicle with this number.'] },
      });
    }
    throw error;
  }
}
