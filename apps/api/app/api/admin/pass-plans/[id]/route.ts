/**
 * PATCH/DELETE /api/admin/pass-plans/:id — editing or retiring one pass plan
 * (`_/decisions.md` D5 point 2; Phase 19).
 *
 * `DELETE` sets `isActive = false`, never a hard delete — the same rule as
 * `ParkingRate`: a `PassBooking` snapshots the plan's price/label at creation
 * (schema.prisma's comment on `PassPlan`), and `onDelete: Restrict` would
 * refuse a real delete the moment one exists anyway.
 */
import type { NextRequest } from 'next/server';

import { PassPlanRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { findPassPlanInLocation, toAdminPassPlan } from '@/lib/pass-plans';

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

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const body = await parseJsonBody(req, PassPlanRequestSchema);
  if (!body.ok) return body.response;

  const existing = await findPassPlanInLocation(body.data.locationId, id);
  if (!existing) return fail('NOT_FOUND', 'Pass plan not found.');

  try {
    const plan = await prisma.passPlan.update({
      where: { id: existing.id },
      data: {
        vehicleType: body.data.vehicleType,
        shiftType: body.data.shiftType,
        label: body.data.label,
        validityMonths: body.data.validityMonths,
        // Post-transform, `priceInRupees` holds paise (see passes.ts).
        priceInPaise: body.data.priceInRupees,
        sortOrder: body.data.sortOrder,
        isActive: body.data.isActive,
      },
    });

    return ok(toAdminPassPlan(plan));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(
        'CONFLICT',
        'A plan with this vehicle type, shift and label already exists at this location.',
      );
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existing = await prisma.passPlan.findUnique({ where: { id } });
  if (!existing) return fail('NOT_FOUND', 'Pass plan not found.');

  const plan = await prisma.passPlan.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return ok(toAdminPassPlan(plan));
}
