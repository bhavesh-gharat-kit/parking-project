/**
 * GET/POST /api/admin/locations — the admin's full location list, and creating
 * a new branch (context.txt §3, §6, §23; Phase 04).
 *
 * `ADMIN`-only, same `requireRole` gate every admin route starts with. Unlike
 * the public `GET /api/locations`, this includes inactive locations — an admin
 * re-enabling a closed branch needs to find it first.
 */
import type { NextRequest } from 'next/server';

import { ParkingLocationRequestSchema, type AdminParkingLocation } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { toAdminParkingLocation } from '@/lib/locations';

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

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const locations = await prisma.parkingLocation.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const payload: AdminParkingLocation[] = locations.map(toAdminParkingLocation);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, ParkingLocationRequestSchema);
  if (!body.ok) return body.response;

  try {
    const location = await prisma.parkingLocation.create({
      data: {
        name: body.data.name,
        code: body.data.code,
        addressLine: body.data.addressLine,
        city: body.data.city,
        state: body.data.state,
        pincode: body.data.pincode ?? null,
        contactPhone: body.data.contactPhone ?? null,
        capacity: body.data.capacity ?? null,
        isActive: body.data.isActive,
      },
    });

    return ok(toAdminParkingLocation(location), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('CONFLICT', 'A location with this code already exists.', {
        fields: { code: ['A location with this code already exists.'] },
      });
    }
    throw error;
  }
}
