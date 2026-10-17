/**
 * GET /api/admin/vehicle-lookup?q=… — the gate's "what is this vehicle's
 * pass/booking?" lookup.
 *
 * Matches `CONFIRMED` passes and daily bookings whose vehicle number contains
 * the query, so the last few digits of a plate are enough. Each row is
 * classified `ACTIVE` / `UPCOMING` / `EXPIRED` against the current instant and
 * the result is ordered with what is valid right now first.
 *
 * Only `CONFIRMED` rows are searched: an unpaid or rejected application is not
 * something the gate can honour. Expired rows are kept for a short lookback so
 * "it ran out yesterday" is distinguishable from "never had one".
 */
import type { NextRequest } from 'next/server';

import {
  VehicleLookupQuerySchema,
  type VehicleLookupMatch,
  type VehicleLookupResponse,
  type VehicleLookupState,
} from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPIRED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PER_SOURCE_LIMIT = 20;
const STATE_ORDER: Record<VehicleLookupState, number> = { ACTIVE: 0, UPCOMING: 1, EXPIRED: 2 };

function classify(now: Date, startsAt: Date, endsAt: Date): VehicleLookupState {
  if (endsAt < now) return 'EXPIRED';
  if (startsAt > now) return 'UPCOMING';
  return 'ACTIVE';
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const parsed = VehicleLookupQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return failValidation(parsed.error);

  const { q } = parsed.data;
  const now = new Date();
  const since = new Date(now.getTime() - EXPIRED_LOOKBACK_MS);

  const [passes, bookings] = await Promise.all([
    prisma.passBooking.findMany({
      where: { status: 'CONFIRMED', vehicleNumber: { contains: q }, endDate: { gte: since } },
      include: {
        user: { select: { name: true, phone: true } },
        location: { select: { name: true } },
      },
      orderBy: { endDate: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.booking.findMany({
      where: { status: 'CONFIRMED', vehicleNumber: { contains: q }, endTime: { gte: since } },
      include: {
        user: { select: { name: true, phone: true } },
        location: { select: { name: true } },
      },
      orderBy: { endTime: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
  ]);

  const matches: VehicleLookupMatch[] = [
    ...passes.map((row) => ({
      kind: 'PASS' as const,
      id: row.id,
      reference: row.passNumber,
      state: classify(now, row.startDate, row.endDate),
      vehicleNumber: row.vehicleNumber,
      vehicleType: row.vehicleType,
      customerName: row.user.name,
      // The pass form's own number is what the customer gave for this pass.
      customerPhone: row.mobileNumber || row.user.phone,
      locationName: row.location.name,
      planLabel: row.planLabel,
      amountInPaise: row.amountInPaise,
      startsAt: row.startDate.toISOString(),
      endsAt: row.endDate.toISOString(),
    })),
    ...bookings.map((row) => ({
      kind: 'BOOKING' as const,
      id: row.id,
      reference: row.bookingNumber,
      state: classify(now, row.startTime, row.endTime),
      vehicleNumber: row.vehicleNumber,
      vehicleType: row.vehicleType,
      customerName: row.user.name,
      customerPhone: row.user.phone,
      locationName: row.location.name,
      planLabel: row.rateLabel,
      amountInPaise: row.amountInPaise,
      startsAt: row.startTime.toISOString(),
      endsAt: row.endTime.toISOString(),
    })),
  ].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      // Passes outrank daily bookings within a state: they cover the whole
      // period, so they are the answer the gate most likely needs.
      (a.kind === b.kind ? 0 : a.kind === 'PASS' ? -1 : 1) ||
      b.endsAt.localeCompare(a.endsAt),
  );

  const payload: VehicleLookupResponse = { query: q, matches };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
