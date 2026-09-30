/**
 * GET /api/admin/reports — basic operational reports (context.txt §26, §27,
 * Phase 10).
 *
 * `dateFrom`/`dateTo` are both optional; omitting either leaves that side of
 * the range open, so calling this with no params reports on everything ever
 * booked. See `apps/api/lib/admin/dashboard.ts` for how counts and revenue are
 * built — counts bound `Booking.startTime`, revenue bounds `Payment.paidAt`.
 */
import type { NextRequest } from 'next/server';

import { AdminReportQuerySchema } from '@parking/shared';

import { buildReport } from '@/lib/admin/dashboard';
import { requireRole } from '@/lib/auth/guard';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = AdminReportQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);

  const report = await buildReport(query.data);

  return ok(report, { headers: { 'Cache-Control': 'no-store' } });
}
