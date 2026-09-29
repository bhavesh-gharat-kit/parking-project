/**
 * GET /api/admin/bookings — the admin's booking queue (context.txt §21).
 *
 * `status` alone already separates "UPI pending verification"
 * (`PAYMENT_VERIFICATION`) from "cash pending approval" (`PENDING_APPROVAL`,
 * §12) — the two statuses the admin app's queue tabs filter on.
 * `paymentMethod`, the date range and `search` narrow further; `userId` lets
 * the user-detail screen reuse this endpoint for one customer's history
 * instead of a second list route.
 *
 * `POST /api/admin/bookings/:id/approve` and `.../reject` are the only two
 * places that may act on what this lists — see their own files, and the
 * enforcement note in `apps/api/lib/bookings/transitions.ts`.
 */
import type { NextRequest } from 'next/server';

import {
  AdminBookingListQuerySchema,
  istDayBounds,
  type AdminBooking,
  type Paginated,
} from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { ADMIN_BOOKING_RELATIONS, toAdminBooking } from '@/lib/bookings/projection';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = AdminBookingListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!query.success) return failValidation(query.error);

  const { page, pageSize, status, paymentMethod, dateFrom, dateTo, search, userId } = query.data;

  const startTime = {
    ...(dateFrom ? { gte: istDayBounds(dateFrom).start } : {}),
    ...(dateTo ? { lte: istDayBounds(dateTo).end } : {}),
  };

  const where = {
    ...(userId ? { userId } : {}),
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(Object.keys(startTime).length ? { startTime } : {}),
    ...(search
      ? {
          OR: [
            { bookingNumber: { contains: search } },
            { vehicleNumber: { contains: search } },
            { user: { name: { contains: search } } },
            { user: { email: { contains: search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: ADMIN_BOOKING_RELATIONS,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  const payload: Paginated<AdminBooking> = {
    items: rows.map(toAdminBooking),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
