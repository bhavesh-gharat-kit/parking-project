/**
 * GET/PATCH/DELETE /api/vehicles/:id — one of the signed-in customer's own
 * vehicles (context.txt §5).
 *
 * Every handler starts with `findOwnVehicle`, which filters by `userId` in the
 * query itself rather than fetching by `id` and comparing after. Another
 * customer's vehicle ID therefore reads exactly like an ID that does not exist
 * — `NOT_FOUND`, never a 403 that would confirm the ID is real (Phase 03
 * acceptance criterion).
 */
import type { NextRequest } from 'next/server';

import { TERMINAL_BOOKING_STATUSES, VehicleRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { findOwnVehicle, toVehicle } from '@/lib/vehicles';

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
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const vehicle = await findOwnVehicle(auth.actor.userId, id);
  if (!vehicle) return fail('NOT_FOUND', 'Vehicle not found.');

  return ok(toVehicle(vehicle), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await findOwnVehicle(auth.actor.userId, id);
  if (!existing) return fail('NOT_FOUND', 'Vehicle not found.');

  const body = await parseJsonBody(req, VehicleRequestSchema);
  if (!body.ok) return body.response;

  try {
    const vehicle = await prisma.vehicle.update({
      where: { id: existing.id },
      data: {
        number: body.data.number,
        type: body.data.type,
        makeModel: body.data.makeModel ?? null,
      },
    });

    return ok(toVehicle(vehicle));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('CONFLICT', 'You already have a vehicle with this number.', {
        fields: { number: ['You already have a vehicle with this number.'] },
      });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const vehicle = await findOwnVehicle(auth.actor.userId, id);
  if (!vehicle) return fail('NOT_FOUND', 'Vehicle not found.');

  // §9, §16 — a vehicle mid-booking must stay put: the receipt and the admin's
  // pending queue both read it live off `Vehicle`, and Booking.vehicle uses
  // `onDelete: Restrict`, so a hard delete would fail anyway. This is the same
  // check spelled out in application terms, with a message the app can show.
  const activeBooking = await prisma.booking.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: { notIn: [...TERMINAL_BOOKING_STATUSES] },
    },
    select: { id: true },
  });

  if (activeBooking) {
    return fail(
      'CONFLICT',
      'This vehicle has an active or pending booking and cannot be deleted.',
    );
  }

  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { isActive: false },
  });

  return ok({ id: vehicle.id });
}
