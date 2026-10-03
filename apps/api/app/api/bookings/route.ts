/**
 * GET/POST /api/bookings — the signed-in customer's own bookings
 * (context.txt §9, §16, §32).
 *
 * Both handlers are scoped to `auth.actor.userId`. There is no `userId` in any
 * request body or query string in this file, so a booking cannot be created for,
 * or listed on behalf of, anyone but the caller. The admin's view of all
 * bookings is Phase 07 and lives under `app/api/admin/`.
 */
import type { NextRequest } from 'next/server';

import {
  BookingCreateRequestSchema,
  BookingListQuerySchema,
  type Booking,
  type Paginated,
} from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { createBooking } from '@/lib/bookings/create';
import { BOOKING_RELATIONS, toBooking } from '@/lib/bookings/projection';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Why a failed creation is answered per-field rather than with one generic
 * message: each of these means a different thing went stale while the customer
 * was choosing, and the app can only send them back to the right screen if it is
 * told which one. `NOT_FOUND` (not `FORBIDDEN`) for the vehicle case — see the
 * ownership note in `lib/bookings/create.ts`.
 */
const CREATE_FAILURES = {
  VEHICLE_NOT_FOUND: {
    code: 'NOT_FOUND',
    field: 'vehicleId',
    message: 'That vehicle is not on your account. Please choose another.',
  },
  LOCATION_NOT_FOUND: {
    code: 'NOT_FOUND',
    field: 'locationId',
    message: 'That parking location is not available right now.',
  },
  RATE_NOT_FOUND: {
    code: 'NOT_FOUND',
    field: 'rateId',
    message: 'That parking package is no longer available. Please choose again.',
  },
  RATE_VEHICLE_MISMATCH: {
    code: 'VALIDATION_ERROR',
    field: 'rateId',
    message: 'That package is priced for a different vehicle type. Please choose again.',
  },
} as const;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const query = BookingListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);

  const { status, paymentStatus, page, pageSize } = query.data;

  // §32 — two filters over two separate columns on two separate tables. Nothing
  // here derives one status from the other, and `?paymentStatus=` matching
  // through the `payment` relation means a booking with no payment row yet is
  // correctly excluded rather than silently treated as "payment pending".
  const where = {
    userId: auth.actor.userId,
    ...(status ? { status } : {}),
    ...(paymentStatus ? { payment: { status: paymentStatus } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: BOOKING_RELATIONS,
      // §16 — the customer's history, newest first.
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  const payload: Paginated<Booking> = {
    items: rows.map(toBooking),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, BookingCreateRequestSchema);
  if (!body.ok) return body.response;

  const result = await createBooking({ ...body.data, userId: auth.actor.userId });

  if (!result.ok) {
    const failure = CREATE_FAILURES[result.reason];
    return fail(failure.code, failure.message, {
      ...(failure.field ? { fields: { [failure.field]: [failure.message] } } : {}),
    });
  }

  return ok(toBooking(result.booking), { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
