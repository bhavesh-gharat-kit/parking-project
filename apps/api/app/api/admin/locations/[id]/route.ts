/**
 * GET/PATCH/DELETE /api/admin/locations/:id — one branch (context.txt §3, §6,
 * §23; Phase 04).
 *
 * `DELETE` never hard-deletes (schema.prisma's rule at the top of the file): it
 * sets `isActive = false`, same as `DELETE /api/vehicles/:id`. A location with
 * bookings against it uses `onDelete: Restrict` anyway, so a real delete would
 * fail the moment a booking exists — soft-deactivate is the only sane "delete".
 */
import type { NextRequest } from 'next/server';

import { ParkingLocationRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { findLocationById, toAdminParkingLocation } from '@/lib/locations';

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

  const { id } = await params;
  const location = await findLocationById(id);
  if (!location) return fail('NOT_FOUND', 'Location not found.');

  return ok(toAdminParkingLocation(location), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await findLocationById(id);
  if (!existing) return fail('NOT_FOUND', 'Location not found.');

  const body = await parseJsonBody(req, ParkingLocationRequestSchema);
  if (!body.ok) return body.response;

  try {
    const location = await prisma.parkingLocation.update({
      where: { id: existing.id },
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
        upiVpa: body.data.upiVpa ?? null,
        upiQrImageUrl: body.data.upiQrImageUrl ?? null,
      },
    });

    return ok(toAdminParkingLocation(location));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('CONFLICT', 'A location with this code already exists.', {
        fields: { code: ['A location with this code already exists.'] },
      });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await findLocationById(id);
  if (!existing) return fail('NOT_FOUND', 'Location not found.');

  const location = await prisma.parkingLocation.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return ok(toAdminParkingLocation(location));
}
