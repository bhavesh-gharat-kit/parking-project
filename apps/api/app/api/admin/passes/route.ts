/**
 * GET /api/admin/passes — the admin's pass-application queue (`_/decisions.md`
 * D5, Phase 21). Mirrors `app/api/admin/bookings/route.ts`.
 *
 * `status` alone already separates "UPI pending verification"
 * (`PAYMENT_VERIFICATION`) from "cash pending approval" (`PENDING_APPROVAL`)
 * — the two queues the list page's counts are built from, the same way the
 * admin dashboard counts daily bookings. `paymentMethod` and `locationId`
 * narrow further; `userId` lets a future "this customer's passes" view reuse
 * this endpoint instead of a second list route.
 *
 * `POST /api/admin/passes/:id/approve` and `.../reject` are the only two
 * places that may move what this lists into `CONFIRMED`/`REJECTED` — see
 * `apps/api/lib/passes/transitions.ts`. `PATCH /api/admin/passes/:id` is the
 * one place every other field changes (`apps/api/lib/passes/edit.ts`).
 */
import type { NextRequest } from 'next/server';

import { AdminPassListQuerySchema, type AdminPass, type Paginated } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';
import { PASS_ADMIN_RELATIONS, toAdminPassBooking } from '@/lib/passes/projection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = AdminPassListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);

  const { page, pageSize, status, paymentMethod, locationId, search, userId } = query.data;

  const where = {
    ...(userId ? { userId } : {}),
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(locationId ? { locationId } : {}),
    ...(search
      ? {
          OR: [
            { passNumber: { contains: search } },
            { vehicleNumber: { contains: search } },
            { user: { name: { contains: search } } },
            { user: { email: { contains: search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.passBooking.findMany({
      where,
      include: PASS_ADMIN_RELATIONS,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.passBooking.count({ where }),
  ]);

  const payload: Paginated<AdminPass> = {
    items: rows.map(toAdminPassBooking),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
